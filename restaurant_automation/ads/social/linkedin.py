"""
ads/social/linkedin.py — LinkedIn organic posting via LinkedIn Marketing API v2.

Handles:
  - Text posts on LinkedIn Company Page
  - Image posts (UGC Posts with uploaded media)
  - Article shares

Docs: https://learn.microsoft.com/en-us/linkedin/marketing/

Required .env:
  LINKEDIN_ACCESS_TOKEN   — OAuth2 access token
  LINKEDIN_ORGANIZATION_ID — LinkedIn organization URN (urn:li:organization:XXXXXXX)
"""
from __future__ import annotations
import logging
from pathlib import Path
from typing import Optional
import httpx
from orchestrator.config import settings

log = logging.getLogger(__name__)
API_BASE = "https://api.linkedin.com/v2"


def _headers(content_type: str = "application/json") -> dict:
    return {
        "Authorization":             f"Bearer {settings.linkedin_access_token}",
        "Content-Type":              content_type,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version":          "202401",
    }


def _configured() -> bool:
    return bool(settings.linkedin_access_token and settings.linkedin_organization_id)


def _org_urn() -> str:
    oid = settings.linkedin_organization_id or ""
    return oid if oid.startswith("urn:") else f"urn:li:organization:{oid}"


# ── Media upload ──────────────────────────────────────────────────────────────

async def _register_upload(image_path: str) -> Optional[tuple[str, str]]:
    """Register image upload with LinkedIn. Returns (upload_url, asset_urn)."""
    url = f"{API_BASE}/assets?action=registerUpload"
    payload = {
        "registerUploadRequest": {
            "recipes":     ["urn:li:digitalmediaRecipe:feedshare-image"],
            "owner":       _org_urn(),
            "serviceRelationships": [
                {"relationshipType": "OWNER", "identifier": "urn:li:userGeneratedContent"}
            ],
        }
    }
    async with httpx.AsyncClient(timeout=20) as c:
        resp = await c.post(url, json=payload, headers=_headers())

    if resp.status_code == 200:
        data = resp.json()
        upload_url = data["value"]["uploadMechanism"][
            "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ]["uploadUrl"]
        asset_urn = data["value"]["asset"]
        return upload_url, asset_urn
    log.warning("LINKEDIN REGISTER UPLOAD FAILED | %d | %s", resp.status_code, resp.text[:200])
    return None


async def _upload_image(upload_url: str, image_path: str) -> bool:
    """Upload image bytes to LinkedIn upload URL."""
    p = Path(image_path)
    if not p.exists():
        return False
    async with httpx.AsyncClient(timeout=60) as c:
        resp = await c.put(
            upload_url,
            content=p.read_bytes(),
            headers={"Content-Type": "image/png",
                     "Authorization": f"Bearer {settings.linkedin_access_token}"},
        )
    return resp.status_code in (200, 201)


# ── Post creation ─────────────────────────────────────────────────────────────

async def post_linkedin_text(text: str) -> dict:
    """Post a text-only update to the LinkedIn Company Page."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    url = f"{API_BASE}/ugcPosts"
    payload = {
        "author":             _org_urn(),
        "lifecycleState":     "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary":    {"text": text},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        },
    }

    async with httpx.AsyncClient(timeout=20) as c:
        resp = await c.post(url, json=payload, headers=_headers())

    if resp.status_code in (200, 201):
        post_id = resp.headers.get("x-restli-id", "")
        log.info("LINKEDIN TEXT POST | id=%s", post_id)
        return {"platform": "linkedin", "post_id": post_id, "status": "published"}
    log.warning("LINKEDIN TEXT FAILED | %d | %s", resp.status_code, resp.text[:200])
    return {"platform": "linkedin", "status": "failed", "error": resp.text[:200]}


async def post_linkedin_photo(image_path: str, text: str) -> dict:
    """Post an image with caption to LinkedIn Company Page."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    # Step 1: Register upload
    result = await _register_upload(image_path)
    if not result:
        return {"platform": "linkedin", "status": "failed", "error": "register_upload_failed"}
    upload_url, asset_urn = result

    # Step 2: Upload image bytes
    ok = await _upload_image(upload_url, image_path)
    if not ok:
        return {"platform": "linkedin", "status": "failed", "error": "image_upload_failed"}

    # Step 3: Create post with media
    url = f"{API_BASE}/ugcPosts"
    payload = {
        "author":         _org_urn(),
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary":    {"text": text},
                "shareMediaCategory": "IMAGE",
                "media": [
                    {
                        "status":      "READY",
                        "description": {"text": text[:200]},
                        "media":       asset_urn,
                        "title":       {"text": settings.restaurant_name},
                    }
                ],
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }

    async with httpx.AsyncClient(timeout=20) as c:
        resp = await c.post(url, json=payload, headers=_headers())

    if resp.status_code in (200, 201):
        post_id = resp.headers.get("x-restli-id", "")
        log.info("LINKEDIN PHOTO POST | id=%s", post_id)
        return {"platform": "linkedin", "post_id": post_id, "status": "published"}
    log.warning("LINKEDIN PHOTO FAILED | %d | %s", resp.status_code, resp.text[:200])
    return {"platform": "linkedin", "status": "failed", "error": resp.text[:200]}


async def post_linkedin_full(copy: "PlatformCopy", image_path: Optional[str] = None) -> dict:  # noqa: F821
    text = copy.full_post()
    if image_path and Path(image_path).exists():
        return await post_linkedin_photo(image_path, text)
    return await post_linkedin_text(text)
