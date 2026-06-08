"""
ads/social/twitter.py — Twitter/X posting via Twitter API v2.

Handles:
  - Text tweets
  - Photo tweets (media upload v1.1 → tweet v2)
  - Tweet threads (for longer ad copy)

Docs: https://developer.twitter.com/en/docs/twitter-api

Required .env:
  TWITTER_API_KEY, TWITTER_API_SECRET
  TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
  TWITTER_BEARER_TOKEN
"""
from __future__ import annotations
import base64
import hashlib
import hmac
import logging
import time
import urllib.parse
import uuid
from pathlib import Path
from typing import Optional
import httpx
from orchestrator.config import settings

log = logging.getLogger(__name__)

UPLOAD_URL  = "https://upload.twitter.com/1.1/media/upload.json"
TWEET_URL   = "https://api.twitter.com/2/tweets"
MAX_CHARS   = 280


def _configured() -> bool:
    return bool(settings.twitter_api_key and settings.twitter_access_token)


# ── OAuth 1.0a signing ───────────────────────────────────────────────────────

def _oauth_header(method: str, url: str, params: dict) -> str:
    """Build OAuth 1.0a Authorization header."""
    oauth_params = {
        "oauth_consumer_key":     settings.twitter_api_key,
        "oauth_nonce":            uuid.uuid4().hex,
        "oauth_signature_method": "HMAC-SHA256",
        "oauth_timestamp":        str(int(time.time())),
        "oauth_token":            settings.twitter_access_token,
        "oauth_version":          "1.0",
    }

    all_params = {**params, **oauth_params}
    sorted_params = "&".join(
        f"{urllib.parse.quote(str(k), safe='')}={urllib.parse.quote(str(v), safe='')}"
        for k, v in sorted(all_params.items())
    )
    base_string = "&".join([
        method.upper(),
        urllib.parse.quote(url, safe=""),
        urllib.parse.quote(sorted_params, safe=""),
    ])

    signing_key = (
        urllib.parse.quote(settings.twitter_api_secret or "", safe="") + "&" +
        urllib.parse.quote(settings.twitter_access_secret or "", safe="")
    )
    signature = base64.b64encode(
        hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha256).digest()
    ).decode()

    oauth_params["oauth_signature"] = signature
    header = "OAuth " + ", ".join(
        f'{urllib.parse.quote(str(k), safe="")}="{urllib.parse.quote(str(v), safe="")}"'
        for k, v in sorted(oauth_params.items())
    )
    return header


# ── Media upload ─────────────────────────────────────────────────────────────

async def _upload_media(image_path: str) -> Optional[str]:
    """Upload image to Twitter media server. Returns media_id string."""
    p = Path(image_path)
    if not p.exists():
        return None

    image_bytes = p.read_bytes()
    b64_image   = base64.b64encode(image_bytes).decode()

    params = {"media_data": b64_image}
    auth   = _oauth_header("POST", UPLOAD_URL, {})

    async with httpx.AsyncClient(timeout=60) as c:
        resp = await c.post(UPLOAD_URL,
                            data={"media_data": b64_image},
                            headers={"Authorization": auth})

    if resp.status_code == 200:
        media_id = resp.json().get("media_id_string", "")
        log.info("TWITTER MEDIA UPLOAD | media_id=%s | size=%dKB",
                 media_id, len(image_bytes) // 1024)
        return media_id
    log.warning("TWITTER MEDIA UPLOAD FAILED | %d | %s", resp.status_code, resp.text[:200])
    return None


# ── Tweet posting ─────────────────────────────────────────────────────────────

async def _post_tweet(text: str, media_ids: list[str] | None = None) -> dict:
    """Post a tweet via API v2. Returns result dict."""
    payload: dict = {"text": text[:MAX_CHARS]}
    if media_ids:
        payload["media"] = {"media_ids": media_ids}

    auth = _oauth_header("POST", TWEET_URL, {})
    async with httpx.AsyncClient(timeout=20) as c:
        resp = await c.post(TWEET_URL,
                            json=payload,
                            headers={
                                "Authorization":  auth,
                                "Content-Type":   "application/json",
                            })

    if resp.status_code in (200, 201):
        tweet_id = resp.json().get("data", {}).get("id", "")
        tweet_url = f"https://twitter.com/i/web/status/{tweet_id}"
        log.info("TWITTER POST | id=%s | url=%s", tweet_id, tweet_url)
        return {"platform": "twitter", "tweet_id": tweet_id,
                "url": tweet_url, "status": "published"}
    log.warning("TWITTER POST FAILED | %d | %s", resp.status_code, resp.text[:200])
    return {"platform": "twitter", "status": "failed", "error": resp.text[:200]}


async def post_twitter_text(text: str) -> dict:
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}
    return await _post_tweet(text)


async def post_twitter_photo(image_path: str, caption: str) -> dict:
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    media_id = await _upload_media(image_path)
    return await _post_tweet(caption[:MAX_CHARS], media_ids=[media_id] if media_id else None)


async def post_twitter_thread(texts: list[str]) -> list[dict]:
    """Post a tweet thread. Each element in texts becomes one tweet."""
    if not _configured():
        return [{"skipped": True, "reason": "not_configured"}]

    results  = []
    reply_to = None
    for text in texts:
        payload: dict = {"text": text[:MAX_CHARS]}
        if reply_to:
            payload["reply"] = {"in_reply_to_tweet_id": reply_to}
        auth = _oauth_header("POST", TWEET_URL, {})
        async with httpx.AsyncClient(timeout=20) as c:
            resp = await c.post(TWEET_URL, json=payload,
                                headers={"Authorization": auth,
                                         "Content-Type": "application/json"})
        if resp.status_code in (200, 201):
            tweet_id = resp.json().get("data", {}).get("id", "")
            results.append({"tweet_id": tweet_id, "status": "published"})
            reply_to = tweet_id
        else:
            results.append({"status": "failed", "error": resp.text[:100]})
            break
    return results


async def post_twitter_full(copy: "PlatformCopy", image_path: Optional[str] = None) -> dict:  # noqa: F821
    full = copy.full_post()
    if len(full) <= MAX_CHARS:
        return await post_twitter_photo(image_path or "", full) if image_path else await post_twitter_text(full)

    # Auto-split into thread if over limit
    parts = [copy.headline, copy.body[:240], copy.cta + " " + " ".join(f"#{h}" for h in copy.hashtags[:3])]
    thread = await post_twitter_thread(parts)
    return {"platform": "twitter", "thread": thread, "status": "published"}
