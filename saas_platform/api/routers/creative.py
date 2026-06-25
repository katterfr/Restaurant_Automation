import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user
from integrations import ai_creative

log = logging.getLogger(__name__)
router = APIRouter(prefix="/creative", tags=["creative"])

# ── Plan limits (per calendar month) ─────────────────────────────────────────

PLAN_LIMITS = {
    "starter": {"image": 10,  "video": 0},
    "growth":  {"image": 50,  "video": 5},
    "pro":     {"image": 200, "video": 20},
}


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin", "manager", "marketing", "staff", "viewer"):
        raise HTTPException(403, "Tenant access only")
    return current_user


async def _check_limit(db, tenant_id: int, plan: str, asset_type: str):
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["starter"])
    limit = limits[asset_type]

    if limit == 0:
        raise HTTPException(
            402,
            f"Your {plan} plan does not include AI {asset_type} generation. "
            f"Upgrade to {'Growth' if asset_type == 'image' else 'Pro'} to unlock this feature."
        )

    used = await db.fetchval(
        """SELECT COUNT(*) FROM creative_assets
           WHERE tenant_id=$1 AND type=$2
             AND status IN ('completed','processing','pending')
             AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())""",
        tenant_id, asset_type,
    )

    if used >= limit:
        raise HTTPException(
            429,
            f"Monthly {asset_type} limit reached ({used}/{limit} on {plan} plan). "
            f"Limit resets on the 1st of next month. Upgrade your plan for more."
        )

    return {"used": used, "limit": limit}


# ── GET library ───────────────────────────────────────────────────────────────

@router.get("/library")
async def get_library(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]

    rows = await db.fetch(
        "SELECT * FROM creative_assets WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
        tid,
    )

    # Fetch plan and monthly usage for the usage display
    tenant = await db.fetchrow("SELECT plan FROM tenants WHERE id=$1", tid)
    plan = tenant["plan"] if tenant else "starter"
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["starter"])

    usage = await db.fetchrow(
        """SELECT
             COUNT(*) FILTER (WHERE type='image' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())) AS images_used,
             COUNT(*) FILTER (WHERE type='video' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())) AS videos_used
           FROM creative_assets WHERE tenant_id=$1 AND status IN ('completed','processing','pending')""",
        tid,
    )

    return {
        "configured": ai_creative.is_configured(),
        "assets": [dict(r) for r in rows],
        "plan": plan,
        "usage": {
            "images": {"used": usage["images_used"], "limit": limits["image"]},
            "videos": {"used": usage["videos_used"], "limit": limits["video"]},
        },
    }


# ── POST generate image ───────────────────────────────────────────────────────

class ImageRequest(BaseModel):
    prompt: str
    style: str = "photorealistic"
    aspect_ratio: str = "1:1"


@router.post("/image")
async def generate_image(body: ImageRequest, current_user=Depends(_require_owner), db=Depends(get_db)):
    if not ai_creative.is_configured():
        raise HTTPException(503, "REPLICATE_API_TOKEN not configured")

    tid = current_user["tenant_id"]
    tenant = await db.fetchrow("SELECT name, plan FROM tenants WHERE id=$1", tid)
    if not tenant:
        raise HTTPException(404)

    await _check_limit(db, tid, tenant["plan"], "image")

    enhanced = ai_creative.enhance_image_prompt(body.prompt, tenant["name"], body.style)

    row = await db.fetchrow(
        """INSERT INTO creative_assets (tenant_id, type, status, prompt, style, aspect_ratio)
           VALUES ($1,'image','processing',$2,$3,$4) RETURNING id""",
        tid, body.prompt, body.style, body.aspect_ratio,
    )
    asset_id = row["id"]

    try:
        result = await ai_creative.generate_image(enhanced, body.aspect_ratio)
        await db.execute(
            "UPDATE creative_assets SET status='completed', url=$1 WHERE id=$2",
            result["url"], asset_id,
        )
        return {"id": asset_id, "status": "completed", "url": result["url"]}
    except Exception as e:
        await db.execute(
            "UPDATE creative_assets SET status='failed', error_message=$1 WHERE id=$2",
            str(e), asset_id,
        )
        raise HTTPException(502, f"Image generation failed: {e}")


# ── POST generate video ───────────────────────────────────────────────────────

class VideoRequest(BaseModel):
    prompt: str
    image_url: Optional[str] = None
    duration: int = 5
    aspect_ratio: str = "16:9"
    style: str = "cinematic"


@router.post("/video")
async def generate_video(body: VideoRequest, current_user=Depends(_require_owner), db=Depends(get_db)):
    if not ai_creative.is_configured():
        raise HTTPException(503, "REPLICATE_API_TOKEN not configured")

    tid = current_user["tenant_id"]
    tenant = await db.fetchrow("SELECT name, plan FROM tenants WHERE id=$1", tid)
    if not tenant:
        raise HTTPException(404)

    await _check_limit(db, tid, tenant["plan"], "video")

    enhanced = ai_creative.enhance_video_prompt(body.prompt, tenant["name"])

    row = await db.fetchrow(
        """INSERT INTO creative_assets (tenant_id, type, status, prompt, style, aspect_ratio, thumbnail_url)
           VALUES ($1,'video','processing',$2,$3,$4,$5) RETURNING id""",
        tid, body.prompt, body.style, body.aspect_ratio, body.image_url,
    )
    asset_id = row["id"]

    try:
        job = await ai_creative.submit_video(enhanced, body.image_url, body.duration, body.aspect_ratio)
        await db.execute(
            "UPDATE creative_assets SET fal_request_id=$1, fal_status_url=$2 WHERE id=$3",
            job["request_id"], job["status_url"], asset_id,
        )
        return {"id": asset_id, "status": "processing", "request_id": job["request_id"]}
    except Exception as e:
        await db.execute(
            "UPDATE creative_assets SET status='failed', error_message=$1 WHERE id=$2",
            str(e), asset_id,
        )
        raise HTTPException(502, f"Video generation failed: {e}")


# ── GET video status ──────────────────────────────────────────────────────────

@router.get("/video/{asset_id}/status")
async def video_status(asset_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    row = await db.fetchrow(
        "SELECT * FROM creative_assets WHERE id=$1 AND tenant_id=$2",
        asset_id, current_user["tenant_id"],
    )
    if not row:
        raise HTTPException(404)
    if row["status"] in ("completed", "failed"):
        return {"id": asset_id, "status": row["status"], "url": row["url"], "error": row["error_message"]}
    if not row["fal_status_url"]:
        return {"id": asset_id, "status": row["status"]}

    try:
        result = await ai_creative.poll_video_status(row["fal_status_url"])
        status = result["status"]
        if status == "COMPLETED" and result.get("video_url"):
            await db.execute(
                "UPDATE creative_assets SET status='completed', url=$1 WHERE id=$2",
                result["video_url"], asset_id,
            )
            return {"id": asset_id, "status": "completed", "url": result["video_url"]}
        elif status == "FAILED":
            await db.execute(
                "UPDATE creative_assets SET status='failed', error_message='Generation failed' WHERE id=$1",
                asset_id,
            )
            return {"id": asset_id, "status": "failed"}
        return {"id": asset_id, "status": "processing"}
    except Exception as e:
        log.warning("Video status poll error: %s", e)
        return {"id": asset_id, "status": "processing"}


# ── DELETE asset ──────────────────────────────────────────────────────────────

@router.delete("/{asset_id}", status_code=204)
async def delete_asset(asset_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM creative_assets WHERE id=$1 AND tenant_id=$2",
        asset_id, current_user["tenant_id"],
    )
