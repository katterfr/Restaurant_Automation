import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user
from integrations import meta as meta_api
from integrations import tiktok as tiktok_api

log = logging.getLogger(__name__)
router = APIRouter(prefix="/social", tags=["social"])

SUPPORTED_PLATFORMS = {"meta", "tiktok"}


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Tenant access only")
    if not current_user.get("tenant_id"):
        raise HTTPException(403, "No tenant")
    return current_user


async def _check_feature(tenant_id: int, db) -> None:
    row = await db.fetchrow(
        "SELECT enabled FROM tenant_features WHERE tenant_id=$1 AND feature='social_posts'",
        tenant_id,
    )
    if not row or not row["enabled"]:
        raise HTTPException(403, "Social media posts feature not enabled for this account")


@router.get("/posts")
async def list_posts(current_user=Depends(_require_owner), db=Depends(get_db)):
    await _check_feature(current_user["tenant_id"], db)
    rows = await db.fetch(
        "SELECT * FROM social_posts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
        current_user["tenant_id"],
    )
    return [dict(r) for r in rows]


class PostCreate(BaseModel):
    platforms: list[str]
    content: str
    image_url: Optional[str] = None
    link_url: Optional[str] = None


@router.post("/posts", status_code=201)
async def create_post(body: PostCreate, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)

    row = await db.fetchrow(
        """INSERT INTO social_posts (tenant_id, platforms, content, image_url, link_url, status)
           VALUES ($1,$2,$3,$4,$5,'publishing') RETURNING id""",
        tid, json.dumps(body.platforms), body.content, body.image_url, body.link_url,
    )
    post_id = row["id"]
    results: dict = {}

    for platform in body.platforms:
        conn = await db.fetchrow(
            "SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
            tid, platform,
        )
        if not conn:
            results[platform] = {"status": "not_connected"}
            continue
        if platform not in SUPPORTED_PLATFORMS:
            results[platform] = {"status": "not_supported"}
            continue

        try:
            if platform == "meta":
                pid = await meta_api.create_page_post(
                    conn["access_token"],
                    conn["page_id"] or "",
                    body.content,
                    body.image_url,
                    body.link_url,
                )
            else:  # tiktok
                pid = await tiktok_api.create_post(
                    conn["access_token"],
                    conn["ad_account_id"],
                    body.content,
                    body.image_url,
                )
            results[platform] = {"status": "published", "id": pid}
        except Exception as e:
            log.error("Social post failed [%s]: %s", platform, e)
            results[platform] = {"status": "failed", "error": str(e)[:200]}

    ok = [r for r in results.values() if r["status"] == "published"]
    final_status = "published" if ok else "failed"
    if len(ok) > 0 and len(ok) < len(body.platforms):
        final_status = "partial"

    await db.execute(
        "UPDATE social_posts SET status=$1, platform_results=$2 WHERE id=$3",
        final_status, json.dumps(results), post_id,
    )
    return {"id": post_id, "status": final_status, "results": results}


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(post_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM social_posts WHERE id=$1 AND tenant_id=$2",
        post_id, current_user["tenant_id"],
    )
