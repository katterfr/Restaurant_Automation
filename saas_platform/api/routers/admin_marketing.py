"""
Admin marketing endpoints — platform-level social posts, ads, and creative studio for CarefulServer.
All records use tenant_id=0 to distinguish from tenant data.
OAuth connect URLs embed tenant_id=0 in the signed state; the ads.py callback redirects
back to /marketing when it detects tenant_id=0.
"""
import base64
import hmac
import hashlib
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from db.database import get_db
from api.routers.auth import get_current_user
from core.config import settings
from core.encryption import decrypt_data
from integrations import meta as meta_api
from integrations import google_ads as google_api
from integrations import tiktok as tiktok_api
from integrations import snapchat as snapchat_api
from integrations import pinterest as pinterest_api
from integrations import youtube as youtube_api
from integrations import ai_creative

log = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/marketing", tags=["admin-marketing"])

PLATFORM_TID = 0  # tenant_id used for all CarefulServer platform-level records

AD_PLATFORMS = {
    "meta":      meta_api,
    "google":    google_api,
    "tiktok":    tiktok_api,
    "snapchat":  snapchat_api,
    "pinterest": pinterest_api,
    "youtube":   youtube_api,
}
SOCIAL_PLATFORMS = {"meta", "tiktok_content", "youtube"}


def _require_admin(current_user=Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return current_user


def _sign_state(tenant_id: int, source: str = "admin") -> str:
    payload = f"{tenant_id}|{source}"
    sig = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()


def _callback_uri(platform: str) -> str:
    return f"{settings.saas_api_url}/ads/connect/{platform}/callback"


# ─── Platform connection status ───────────────────────────────────────────────

@router.get("/status")
async def platform_status(current_user=Depends(_require_admin), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT platform, ad_account_id, connected_at FROM platform_connections WHERE tenant_id=$1",
        PLATFORM_TID,
    )
    connected = {r["platform"]: dict(r) for r in rows}

    ad_result = {}
    for p, mod in AD_PLATFORMS.items():
        ad_result[p] = {
            "configured": mod.is_configured(),
            "connected": p in connected,
            "ad_account_id": connected.get(p, {}).get("ad_account_id") or None,
            "connected_at": str(connected[p]["connected_at"]) if p in connected else None,
        }

    social_result = {}
    for p in SOCIAL_PLATFORMS:
        social_result[p] = {
            "connected": p in connected,
            "connected_at": str(connected[p]["connected_at"]) if p in connected else None,
        }

    return {"ads": ad_result, "social": social_result}


# ─── Connect / Disconnect ─────────────────────────────────────────────────────

@router.get("/connect/{platform}/url")
async def get_connect_url(
    platform: str,
    source: str = Query("admin"),
    current_user=Depends(_require_admin),
):
    state = _sign_state(PLATFORM_TID, source)
    if platform == "tiktok_content":
        if not tiktok_api.is_configured():
            raise HTTPException(400, "TikTok credentials not configured")
        return {"oauth_url": tiktok_api.content_oauth_url(_callback_uri(platform), state)}
    if platform not in AD_PLATFORMS:
        raise HTTPException(404, "Unknown platform")
    mod = AD_PLATFORMS[platform]
    if not mod.is_configured():
        raise HTTPException(400, f"{platform.title()} credentials not yet configured — add API keys in Railway")
    if platform == "meta":
        return {"oauth_url": mod.oauth_start_url(_callback_uri(platform), state, source=source)}
    return {"oauth_url": mod.oauth_start_url(_callback_uri(platform), state)}


@router.delete("/connect/{platform}", status_code=200)
async def disconnect_platform(
    platform: str,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    await db.execute(
        "DELETE FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
        PLATFORM_TID, platform,
    )
    return {"ok": True}


# ─── Social posts ─────────────────────────────────────────────────────────────

@router.get("/social/posts")
async def list_social_posts(current_user=Depends(_require_admin), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM social_posts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
        PLATFORM_TID,
    )
    return [dict(r) for r in rows]


class AdminPostCreate(BaseModel):
    platforms: list[str]
    content: str
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    link_url: Optional[str] = None
    media_type: str = "feed"


def _parse_meta_conn(conn) -> tuple[str, str, str]:
    raw = decrypt_data(conn.get("refresh_token") or "")
    parts = raw.split(":", 2)
    if len(parts) == 3:
        return parts[0], parts[1], parts[2]
    return conn.get("ad_account_id", ""), decrypt_data(conn.get("access_token", "")), ""


@router.post("/social/posts", status_code=201)
async def create_social_post(
    body: AdminPostCreate,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    row = await db.fetchrow(
        """INSERT INTO social_posts (tenant_id, platforms, content, image_url, link_url, status)
           VALUES ($1,$2,$3,$4,$5,'publishing') RETURNING id""",
        PLATFORM_TID, json.dumps(body.platforms),
        body.content, body.image_url or body.video_url, body.link_url,
    )
    post_id = row["id"]
    results: dict = {}

    for platform in body.platforms:
        conn = await db.fetchrow(
            "SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
            PLATFORM_TID, platform,
        )
        if not conn:
            results[platform] = {"status": "not_connected"}
            continue
        if platform not in SOCIAL_PLATFORMS:
            results[platform] = {"status": "not_supported"}
            continue

        try:
            if platform == "meta":
                page_id, page_token, ig_id = _parse_meta_conn(conn)
                if ig_id and (body.image_url or body.video_url):
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
                    decrypt_data(conn["access_token"]), conn["ad_account_id"] or "",
                    body.content, image_url=body.image_url, video_url=body.video_url,
                )

            elif platform == "youtube":
                pid = await youtube_api.create_post(
                    decrypt_data(conn["access_token"]), conn["ad_account_id"] or "",
                    body.content, body.video_url or body.image_url,
                )

            results[platform] = {"status": "published", "id": pid}

        except Exception as e:
            log.error("Admin social post failed [%s]: %s", platform, e)
            results[platform] = {"status": "failed", "error": str(e)[:200]}

    ok = [r for r in results.values() if r["status"] == "published"]
    final_status = "published" if ok else ("partial" if 0 < len(ok) < len(body.platforms) else "failed")

    await db.execute(
        "UPDATE social_posts SET status=$1, platform_results=$2 WHERE id=$3",
        final_status, json.dumps(results), post_id,
    )
    return {"id": post_id, "status": final_status, "results": results}


@router.delete("/social/posts/{post_id}", status_code=204)
async def delete_social_post(post_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM social_posts WHERE id=$1 AND tenant_id=$2",
        post_id, PLATFORM_TID,
    )


# ─── Ad campaigns ─────────────────────────────────────────────────────────────

@router.get("/ads/campaigns")
async def list_campaigns(current_user=Depends(_require_admin), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM ad_campaigns WHERE tenant_id=$1 ORDER BY created_at DESC",
        PLATFORM_TID,
    )
    return [dict(r) for r in rows]


class AdminCampaignCreate(BaseModel):
    platforms: list[str]
    headline: str
    body: str
    image_url: Optional[str] = None
    destination_url: Optional[str] = None
    cta: str = "LEARN_MORE"
    budget_daily: float = 10.0
    location: Optional[str] = None
    radius_miles: int = 10
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@router.post("/ads/campaigns", status_code=201)
async def create_campaigns(
    body: AdminCampaignCreate,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    results = []
    for platform in body.platforms:
        if platform not in AD_PLATFORMS:
            results.append({"platform": platform, "status": "error", "error": "Unknown platform"})
            continue

        mod = AD_PLATFORMS[platform]
        conn = await db.fetchrow(
            "SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
            PLATFORM_TID, platform,
        )

        if not mod.is_configured() or not conn:
            status = "not_configured" if not mod.is_configured() else "not_connected"
            row = await db.fetchrow(
                """INSERT INTO ad_campaigns
                   (tenant_id,platform,status,headline,body,image_url,destination_url,
                    cta,budget_daily,location,radius_miles,start_date,end_date,error_message)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id""",
                PLATFORM_TID, platform, status, body.headline, body.body, body.image_url,
                body.destination_url, body.cta, body.budget_daily, body.location,
                body.radius_miles, body.start_date, body.end_date,
                "Platform not configured" if not mod.is_configured() else "Platform not connected",
            )
            results.append({"platform": platform, "id": row["id"], "status": status})
            continue

        try:
            campaign_id = await mod.create_campaign(
                access_token=decrypt_data(conn["access_token"]),
                ad_account_id=conn["ad_account_id"] or "",
                headline=body.headline,
                body=body.body,
                image_url=body.image_url,
                destination_url=body.destination_url,
                cta=body.cta,
                budget_daily=body.budget_daily,
                location=body.location,
                radius_miles=body.radius_miles,
            )
            row = await db.fetchrow(
                """INSERT INTO ad_campaigns
                   (tenant_id,platform,status,headline,body,image_url,destination_url,
                    cta,budget_daily,location,radius_miles,start_date,end_date,platform_campaign_id)
                   VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id""",
                PLATFORM_TID, platform, body.headline, body.body, body.image_url,
                body.destination_url, body.cta, body.budget_daily, body.location,
                body.radius_miles, body.start_date, body.end_date, str(campaign_id),
            )
            results.append({"platform": platform, "id": row["id"], "status": "active", "campaign_id": campaign_id})
        except Exception as e:
            log.error("Admin campaign failed [%s]: %s", platform, e)
            row = await db.fetchrow(
                """INSERT INTO ad_campaigns
                   (tenant_id,platform,status,headline,body,image_url,destination_url,
                    cta,budget_daily,location,radius_miles,start_date,end_date,error_message)
                   VALUES ($1,$2,'failed',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id""",
                PLATFORM_TID, platform, body.headline, body.body, body.image_url,
                body.destination_url, body.cta, body.budget_daily, body.location,
                body.radius_miles, body.start_date, body.end_date, str(e)[:300],
            )
            results.append({"platform": platform, "id": row["id"], "status": "failed", "error": str(e)[:200]})

    return results


@router.delete("/ads/campaigns/{campaign_id}", status_code=204)
async def cancel_campaign(campaign_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    await db.execute(
        "UPDATE ad_campaigns SET status='cancelled' WHERE id=$1 AND tenant_id=$2",
        campaign_id, PLATFORM_TID,
    )


# ─── Creative studio ──────────────────────────────────────────────────────────

@router.get("/creative/library")
async def get_creative_library(current_user=Depends(_require_admin), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM creative_assets WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
        PLATFORM_TID,
    )
    usage = await db.fetchrow(
        """SELECT
             COUNT(*) FILTER (WHERE type='image' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())) AS images_used,
             COUNT(*) FILTER (WHERE type='video' AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())) AS videos_used
           FROM creative_assets WHERE tenant_id=$1 AND status IN ('completed','processing','pending')""",
        PLATFORM_TID,
    )
    return {
        "configured": ai_creative.is_configured(),
        "assets": [dict(r) for r in rows],
        "usage": {
            "images": {"used": usage["images_used"], "limit": 999},
            "videos": {"used": usage["videos_used"], "limit": 999},
        },
    }


class AdminImageRequest(BaseModel):
    prompt: str
    style: str = "photorealistic"
    aspect_ratio: str = "1:1"


@router.post("/creative/image")
async def generate_image(body: AdminImageRequest, current_user=Depends(_require_admin), db=Depends(get_db)):
    if not ai_creative.is_configured():
        raise HTTPException(503, "REPLICATE_API_TOKEN not configured")

    enhanced = ai_creative.enhance_image_prompt(body.prompt, "CarefulServer", body.style)

    row = await db.fetchrow(
        """INSERT INTO creative_assets (tenant_id, type, status, prompt, style, aspect_ratio)
           VALUES ($1,'image','processing',$2,$3,$4) RETURNING id""",
        PLATFORM_TID, body.prompt, body.style, body.aspect_ratio,
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


class AdminVideoRequest(BaseModel):
    prompt: str
    image_url: Optional[str] = None
    duration: int = 5
    aspect_ratio: str = "16:9"
    style: str = "cinematic"


@router.post("/creative/video")
async def generate_video(body: AdminVideoRequest, current_user=Depends(_require_admin), db=Depends(get_db)):
    if not ai_creative.is_configured():
        raise HTTPException(503, "REPLICATE_API_TOKEN not configured")

    enhanced = ai_creative.enhance_video_prompt(body.prompt, "CarefulServer")

    row = await db.fetchrow(
        """INSERT INTO creative_assets (tenant_id, type, status, prompt, style, aspect_ratio, thumbnail_url)
           VALUES ($1,'video','processing',$2,$3,$4,$5) RETURNING id""",
        PLATFORM_TID, body.prompt, body.style, body.aspect_ratio, body.image_url,
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


@router.get("/creative/{asset_id}/status")
async def video_status(asset_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    row = await db.fetchrow(
        "SELECT * FROM creative_assets WHERE id=$1 AND tenant_id=$2", asset_id, PLATFORM_TID,
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
    except Exception as e:
        log.warning("Admin creative poll error: %s", e)

    return {"id": asset_id, "status": "processing"}


@router.delete("/creative/{asset_id}", status_code=204)
async def delete_asset(asset_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM creative_assets WHERE id=$1 AND tenant_id=$2", asset_id, PLATFORM_TID,
    )
