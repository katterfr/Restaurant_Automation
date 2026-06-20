import json
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel

from db.database import get_db
from api.routers.auth import get_current_user
from core.config import settings
from integrations import meta as meta_api
from integrations import tiktok as tiktok_api
from integrations import youtube as youtube_api

log = logging.getLogger(__name__)
router = APIRouter(prefix="/social", tags=["social"])

UPLOAD_DIR = Path("/tmp/uploads")
SUPPORTED_PLATFORMS = {"meta", "tiktok_content", "youtube"}

ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/quicktime", "video/webm",
}
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB


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


# ─── File upload ─────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    current_user=Depends(_require_owner),
):
    """Upload an image or video from the owner's device. Returns a public URL."""
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"File type '{file.content_type}' not allowed")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "File too large (max 500 MB)")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix.lower() or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / filename).write_bytes(content)

    is_video = file.content_type.startswith("video/")
    return {
        "url": f"{settings.saas_api_url}/uploads/{filename}",
        "filename": filename,
        "content_type": file.content_type,
        "is_video": is_video,
    }


# ─── Post history ─────────────────────────────────────────────────────────────

@router.get("/posts")
async def list_posts(current_user=Depends(_require_owner), db=Depends(get_db)):
    await _check_feature(current_user["tenant_id"], db)
    rows = await db.fetch(
        "SELECT * FROM social_posts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
        current_user["tenant_id"],
    )
    return [dict(r) for r in rows]


# ─── Create & publish post ────────────────────────────────────────────────────

class PostCreate(BaseModel):
    platforms: list[str]
    content: str
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    link_url: Optional[str] = None
    media_type: str = "feed"  # feed | reel | story


@router.post("/posts", status_code=201)
async def create_post(body: PostCreate, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)

    row = await db.fetchrow(
        """INSERT INTO social_posts (tenant_id, platforms, content, image_url, link_url, status)
           VALUES ($1,$2,$3,$4,$5,'publishing') RETURNING id""",
        tid, json.dumps(body.platforms), body.content, body.image_url or body.video_url, body.link_url,
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
                # refresh_token stores "page_id:page_token:ig_id"
                page_id, page_token, ig_id = _parse_meta_conn(conn)

                if body.media_type in ("reel", "story") and ig_id:
                    pid = await meta_api.create_ig_post(
                        page_token, ig_id, body.content,
                        image_url=body.image_url,
                        video_url=body.video_url,
                        media_type=body.media_type,
                    )
                elif ig_id and (body.image_url or body.video_url):
                    # Post to both FB page and Instagram
                    fb_pid = await meta_api.create_page_post(
                        page_token or conn["access_token"], page_id,
                        body.content, body.image_url, body.video_url, body.link_url,
                    )
                    ig_pid = await meta_api.create_ig_post(
                        page_token, ig_id, body.content,
                        image_url=body.image_url, video_url=body.video_url,
                    )
                    pid = f"fb:{fb_pid},ig:{ig_pid}"
                else:
                    pid = await meta_api.create_page_post(
                        page_token or conn["access_token"], page_id,
                        body.content, body.image_url, body.video_url, body.link_url,
                    )

            elif platform == "tiktok_content":
                pid = await tiktok_api.create_post(
                    conn["access_token"],
                    conn["ad_account_id"] or "",
                    body.content,
                    image_url=body.image_url,
                    video_url=body.video_url,
                )

            elif platform == "youtube":
                pid = await youtube_api.create_post(
                    conn["access_token"],
                    conn["ad_account_id"] or "",
                    body.content,
                    body.video_url or body.image_url,
                )

            results[platform] = {"status": "published", "id": pid}

        except Exception as e:
            log.error("Social post failed [%s]: %s", platform, e)
            results[platform] = {"status": "failed", "error": str(e)[:200]}

    ok = [r for r in results.values() if r["status"] == "published"]
    final_status = "published" if ok else "failed"
    if 0 < len(ok) < len(body.platforms):
        final_status = "partial"

    await db.execute(
        "UPDATE social_posts SET status=$1, platform_results=$2 WHERE id=$3",
        final_status, json.dumps(results), post_id,
    )
    return {"id": post_id, "status": final_status, "results": results}


def _parse_meta_conn(conn) -> tuple[str, str, str]:
    """Extract page_id, page_token, ig_id from stored refresh_token field."""
    raw = conn.get("refresh_token") or ""
    parts = raw.split(":", 2)
    if len(parts) == 3:
        return parts[0], parts[1], parts[2]
    return conn.get("ad_account_id", ""), conn.get("access_token", ""), ""


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(post_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM social_posts WHERE id=$1 AND tenant_id=$2",
        post_id, current_user["tenant_id"],
    )
