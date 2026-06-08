"""
ads/social/tiktok.py — TikTok organic posting via TikTok Content Posting API.

Handles:
  - Photo posts (image + caption)
  - Video posts (for future video ad generation)
  - Direct post to TikTok profile

Docs: https://developers.tiktok.com/doc/content-posting-api-get-started

Required .env:
  TIKTOK_ACCESS_TOKEN     — OAuth2 user access token
  TIKTOK_OPEN_ID          — TikTok Open ID for the authenticated user
"""
from __future__ import annotations
import logging
from pathlib import Path
from typing import Optional
import httpx
from orchestrator.config import settings

log = logging.getLogger(__name__)
API_BASE = "https://open.tiktokapis.com/v2"
MAX_CAPTION = 2200


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.tiktok_access_token}",
        "Content-Type":  "application/json; charset=UTF-8",
    }


def _configured() -> bool:
    return bool(settings.tiktok_access_token and settings.tiktok_open_id)


# ── Photo post ─────────────────────────────────────────────────────────────────

async def _initialize_photo_post(caption: str, image_paths: list[str]) -> Optional[dict]:
    """
    Step 1: Initialize a photo post. Returns publish_id and upload URLs.
    TikTok requires images hosted via their upload URLs.
    """
    url = f"{API_BASE}/post/publish/content/init/"
    payload = {
        "post_info": {
            "title":           caption[:MAX_CAPTION],
            "privacy_level":   "PUBLIC_TO_EVERYONE",
            "disable_duet":    False,
            "disable_comment": False,
            "disable_stitch":  False,
        },
        "source_info": {
            "source":       "FILE_UPLOAD",
            "photo_count":  len(image_paths),
            "photo_images": [],   # Will be filled from upload URLs
        },
        "post_mode":    "DIRECT_POST",
        "media_type":   "PHOTO",
    }

    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(url, json=payload, headers=_headers())

    if resp.status_code == 200:
        return resp.json().get("data", {})
    log.warning("TIKTOK INIT FAILED | %d | %s", resp.status_code, resp.text[:200])
    return None


async def _upload_tiktok_image(upload_url: str, image_path: str) -> bool:
    """Upload image bytes to TikTok's upload URL."""
    p = Path(image_path)
    if not p.exists():
        return False
    async with httpx.AsyncClient(timeout=60) as c:
        resp = await c.put(
            upload_url,
            content=p.read_bytes(),
            headers={"Content-Type": "image/jpeg"},
        )
    return resp.status_code in (200, 201)


async def post_tiktok_photo(image_path: str, caption: str) -> dict:
    """Post an image to TikTok."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    # TikTok requires a public image URL when using URL-based upload.
    # If CDN is configured, use URL method; else skip.
    if not settings.cdn_base_url:
        log.warning("TIKTOK: CDN_BASE_URL not set — TikTok requires public image URL. Skipping.")
        return {"platform": "tiktok", "status": "skipped", "reason": "cdn_not_configured"}

    p = Path(image_path)
    if not p.exists():
        return {"platform": "tiktok", "status": "failed", "error": "image_not_found"}

    image_url = f"{settings.cdn_base_url.rstrip('/')}/{p.name}"

    url = f"{API_BASE}/post/publish/content/init/"
    payload = {
        "post_info": {
            "title":          caption[:MAX_CAPTION],
            "privacy_level":  "PUBLIC_TO_EVERYONE",
            "disable_duet":   False,
            "disable_comment": False,
            "disable_stitch": False,
        },
        "source_info": {
            "source":       "PULL_FROM_URL",
            "photo_images": [image_url],
            "photo_cover_index": 0,
        },
        "post_mode":  "DIRECT_POST",
        "media_type": "PHOTO",
    }

    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(url, json=payload, headers=_headers())

    if resp.status_code == 200:
        data      = resp.json().get("data", {})
        publish_id = data.get("publish_id", "")
        log.info("TIKTOK PHOTO POST | publish_id=%s", publish_id)
        return {"platform": "tiktok", "publish_id": publish_id, "status": "published"}

    log.warning("TIKTOK PHOTO FAILED | %d | %s", resp.status_code, resp.text[:200])
    return {"platform": "tiktok", "status": "failed", "error": resp.text[:200]}


async def check_post_status(publish_id: str) -> dict:
    """Check the publish status of a TikTok post."""
    if not _configured():
        return {"skipped": True}

    url = f"{API_BASE}/post/publish/status/fetch/"
    async with httpx.AsyncClient(timeout=15) as c:
        resp = await c.post(url,
                            json={"publish_id": publish_id},
                            headers=_headers())

    if resp.status_code == 200:
        return resp.json().get("data", {})
    return {"status": "unknown"}


async def post_tiktok_full(copy: "PlatformCopy", image_path: Optional[str] = None) -> dict:  # noqa: F821
    caption = copy.full_post()
    # Use portrait/story image for TikTok (9:16 ratio)
    tiktok_image = image_path
    if image_path:
        portrait = image_path.replace("_square.", "_portrait.")
        if Path(portrait).exists():
            tiktok_image = portrait
    return await post_tiktok_photo(tiktok_image or "", caption)
