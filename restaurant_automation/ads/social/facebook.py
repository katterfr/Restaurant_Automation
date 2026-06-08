"""
ads/social/facebook.py — Facebook & Instagram organic posting via Meta Graph API.

Handles:
  - Facebook Page text + photo posts
  - Instagram Feed photo + carousel posts
  - Instagram Stories (via container API)
  - Facebook Reels (video) placeholder

Docs:
  https://developers.facebook.com/docs/graph-api/
  https://developers.facebook.com/docs/instagram-api/

Required credentials (set in .env):
  META_ACCESS_TOKEN       — Page access token (long-lived)
  META_PAGE_ID            — Facebook Page ID
  META_INSTAGRAM_ACCOUNT_ID — Instagram Business Account ID
"""
from __future__ import annotations
import logging
from pathlib import Path
from typing import Optional
import httpx
from orchestrator.config import settings

log = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.facebook.com/v19.0"


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.meta_access_token}"}


def _configured() -> bool:
    return bool(settings.meta_access_token and settings.meta_page_id)


# ── Facebook Page ─────────────────────────────────────────────────────────────

async def post_facebook_text(text: str) -> dict:
    """Post a text-only update to the Facebook Page."""
    if not _configured():
        log.debug("Facebook not configured — skipping")
        return {"skipped": True, "reason": "not_configured"}

    url = f"{GRAPH_BASE}/{settings.meta_page_id}/feed"
    async with httpx.AsyncClient(timeout=20) as c:
        resp = await c.post(url, data={"message": text, "access_token": settings.meta_access_token})

    if resp.status_code == 200:
        post_id = resp.json().get("id", "")
        log.info("FACEBOOK POST | id=%s", post_id)
        return {"platform": "facebook", "post_id": post_id, "status": "published"}
    log.warning("FACEBOOK POST FAILED | %d | %s", resp.status_code, resp.text[:200])
    return {"platform": "facebook", "status": "failed", "error": resp.text[:200]}


async def post_facebook_photo(
    image_path: str,
    caption: str,
    link: str = "",
) -> dict:
    """Post a photo to the Facebook Page feed."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    p = Path(image_path)
    if not p.exists():
        return {"platform": "facebook", "status": "failed", "error": "image_not_found"}

    url = f"{GRAPH_BASE}/{settings.meta_page_id}/photos"

    # Upload image as bytes
    async with httpx.AsyncClient(timeout=60) as c:
        files = {"source": (p.name, p.read_bytes(), "image/png")}
        data  = {
            "caption":      caption,
            "access_token": settings.meta_access_token,
        }
        if link:
            data["link"] = link
        resp = await c.post(url, data=data, files=files)

    if resp.status_code == 200:
        post_id = resp.json().get("post_id", resp.json().get("id", ""))
        log.info("FACEBOOK PHOTO | id=%s", post_id)
        return {"platform": "facebook", "post_id": post_id, "status": "published"}
    log.warning("FACEBOOK PHOTO FAILED | %d | %s", resp.status_code, resp.text[:200])
    return {"platform": "facebook", "status": "failed", "error": resp.text[:200]}


async def post_facebook_full(
    copy: "PlatformCopy",  # noqa: F821
    image_path: Optional[str] = None,
) -> dict:
    """Post the full ad package to Facebook (photo if image available, text fallback)."""
    caption = copy.full_post()
    if image_path and Path(image_path).exists():
        return await post_facebook_photo(image_path, caption)
    return await post_facebook_text(caption)


# ── Instagram ────────────────────────────────────────────────────────────────

async def _upload_instagram_container(
    image_path: str,
    caption: str,
    media_type: str = "IMAGE",
) -> Optional[str]:
    """Step 1: Create an Instagram media container. Returns container ID."""
    if not settings.meta_instagram_account_id:
        return None

    p = Path(image_path)
    if not p.exists():
        return None

    # Instagram requires a publicly accessible image URL.
    # In production, upload to S3/CDN first and pass the URL.
    # Here we use a two-step approach: upload to FB as unpublished, get URL.
    # For simplicity, we use the image_url approach if CDN is configured.
    image_url = f"{settings.cdn_base_url}/{p.name}" if settings.cdn_base_url else None
    if not image_url:
        log.warning("CDN_BASE_URL not set — Instagram requires a public image URL. Skipping.")
        return None

    url = f"{GRAPH_BASE}/{settings.meta_instagram_account_id}/media"
    params = {
        "image_url":    image_url,
        "caption":      caption,
        "media_type":   media_type,
        "access_token": settings.meta_access_token,
    }

    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(url, data=params)

    if resp.status_code == 200:
        return resp.json().get("id")
    log.warning("IG CONTAINER FAILED | %d | %s", resp.status_code, resp.text[:200])
    return None


async def _publish_instagram_container(container_id: str) -> dict:
    """Step 2: Publish an Instagram media container."""
    url = f"{GRAPH_BASE}/{settings.meta_instagram_account_id}/media_publish"
    async with httpx.AsyncClient(timeout=20) as c:
        resp = await c.post(url, data={
            "creation_id":  container_id,
            "access_token": settings.meta_access_token,
        })

    if resp.status_code == 200:
        media_id = resp.json().get("id", "")
        log.info("INSTAGRAM PUBLISHED | media_id=%s", media_id)
        return {"platform": "instagram", "media_id": media_id, "status": "published"}
    return {"platform": "instagram", "status": "failed", "error": resp.text[:200]}


async def post_instagram_photo(image_path: str, caption: str) -> dict:
    """Publish a photo to Instagram Feed."""
    if not _configured() or not settings.meta_instagram_account_id:
        return {"skipped": True, "reason": "not_configured"}

    container_id = await _upload_instagram_container(image_path, caption)
    if not container_id:
        return {"platform": "instagram", "status": "failed", "error": "container_upload_failed"}

    return await _publish_instagram_container(container_id)


async def post_instagram_story(image_path: str) -> dict:
    """Publish an image to Instagram Stories."""
    if not _configured() or not settings.meta_instagram_account_id:
        return {"skipped": True, "reason": "not_configured"}

    container_id = await _upload_instagram_container(image_path, "", "IMAGE")
    if not container_id:
        return {"platform": "instagram_story", "status": "failed", "error": "container_upload_failed"}

    url = f"{GRAPH_BASE}/{settings.meta_instagram_account_id}/media_publish"
    async with httpx.AsyncClient(timeout=20) as c:
        resp = await c.post(url, data={
            "creation_id":  container_id,
            "access_token": settings.meta_access_token,
        })

    if resp.status_code == 200:
        return {"platform": "instagram_story", "status": "published", "media_id": resp.json().get("id")}
    return {"platform": "instagram_story", "status": "failed", "error": resp.text[:200]}


async def post_instagram_full(copy: "PlatformCopy", image_path: Optional[str] = None) -> dict:  # noqa: F821
    """Post the full ad to Instagram feed, and optionally a Story."""
    caption   = copy.full_post()
    feed_res  = await post_instagram_photo(image_path or "", caption)
    story_res = {}
    # Post portrait image to Stories if available
    if image_path:
        portrait_path = image_path.replace("_square.", "_portrait.")
        if Path(portrait_path).exists():
            story_res = await post_instagram_story(portrait_path)
    return {"feed": feed_res, "story": story_res}
