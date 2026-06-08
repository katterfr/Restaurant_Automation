"""
ads/platforms/meta_ads.py — Meta Ads (Facebook + Instagram) paid campaign manager.

Creates and manages:
  - Ad Accounts, Campaigns, Ad Sets, Ads via Meta Marketing API
  - Automatic audience targeting (location, interest, lookalike)
  - Budget and schedule management
  - Performance metric retrieval

Docs: https://developers.facebook.com/docs/marketing-apis/

Required .env:
  META_AD_ACCOUNT_ID    — Ad Account ID (act_XXXXXXXXXX)
  META_ACCESS_TOKEN     — System user access token with ads_management scope
  META_PAGE_ID          — Facebook Page ID (for ad creative)
  META_PIXEL_ID         — Meta Pixel ID for conversion tracking (optional)
"""
from __future__ import annotations
import logging
from pathlib import Path
from typing import Optional
import httpx
from orchestrator.config import settings

log = logging.getLogger(__name__)
GRAPH_BASE = "https://graph.facebook.com/v19.0"


def _configured() -> bool:
    return bool(settings.meta_ad_account_id and settings.meta_access_token)


def _ad_account() -> str:
    aid = settings.meta_ad_account_id or ""
    return aid if aid.startswith("act_") else f"act_{aid}"


async def _graph(method: str, endpoint: str, payload: dict) -> dict:
    """Generic Meta Graph API call."""
    url = f"{GRAPH_BASE}/{endpoint}"
    params = {"access_token": settings.meta_access_token}
    async with httpx.AsyncClient(timeout=30) as c:
        if method == "POST":
            resp = await c.post(url, json={**payload, **params})
        else:
            resp = await c.get(url, params={**payload, **params})

    if resp.status_code in (200, 201):
        return resp.json()
    log.warning("META API %s %s FAILED | %d | %s", method, endpoint, resp.status_code, resp.text[:300])
    return {"error": resp.text[:300], "status_code": resp.status_code}


# ── Campaign ──────────────────────────────────────────────────────────────────

async def create_campaign(
    name: str,
    objective: str = "OUTCOME_TRAFFIC",   # OUTCOME_TRAFFIC | OUTCOME_AWARENESS | OUTCOME_SALES
    daily_budget_cents: int = 1000,        # $10.00/day
    status: str = "PAUSED",
) -> dict:
    """Create a new Meta Ads campaign."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    result = await _graph("POST", f"{_ad_account()}/campaigns", {
        "name":          name,
        "objective":     objective,
        "status":        status,
        "special_ad_categories": [],
    })
    if "id" in result:
        log.info("META CAMPAIGN CREATED | id=%s | name=%s", result["id"], name)
    return result


# ── Ad Set ────────────────────────────────────────────────────────────────────

async def create_ad_set(
    campaign_id: str,
    name: str,
    daily_budget_cents: int = 1000,
    targeting: dict | None = None,
    placements: list[str] | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
) -> dict:
    """Create an Ad Set under a campaign."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    default_targeting = {
        "age_min":           18,
        "age_max":           65,
        "genders":           [1, 2],
        "geo_locations":     {"countries": ["US"]},
        "flexible_spec": [
            {"interests": [
                {"id": "6003139266461", "name": "Food"},
                {"id": "6003348604581", "name": "Restaurants"},
            ]}
        ],
    }

    default_placements = {
        "facebook_positions":  ["feed", "story"],
        "instagram_positions": ["stream", "story", "reels"],
        "publisher_platforms": ["facebook", "instagram"],
        "device_platforms":    ["mobile", "desktop"],
    }

    payload = {
        "campaign_id":       campaign_id,
        "name":              name,
        "daily_budget":      daily_budget_cents,
        "billing_event":     "IMPRESSIONS",
        "optimization_goal": "REACH",
        "targeting":         targeting or default_targeting,
        "status":            "PAUSED",
        **default_placements,
    }
    if start_time:
        payload["start_time"] = start_time
    if end_time:
        payload["end_time"] = end_time

    result = await _graph("POST", f"{_ad_account()}/adsets", payload)
    if "id" in result:
        log.info("META AD SET CREATED | id=%s | name=%s", result["id"], name)
    return result


# ── Ad Creative ──────────────────────────────────────────────────────────────

async def create_image_ad_creative(
    name: str,
    headline: str,
    body: str,
    cta_type: str,
    image_path: str,
    link_url: str = "",
) -> dict:
    """Upload image + create an ad creative."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    # Upload image to Ad Account
    p = Path(image_path)
    if not p.exists():
        return {"error": "image_not_found"}

    upload_result = await _graph("POST", f"{_ad_account()}/adimages", {})
    # NOTE: image upload requires multipart/form-data — handled via direct call
    async with httpx.AsyncClient(timeout=60) as c:
        resp = await c.post(
            f"{GRAPH_BASE}/{_ad_account()}/adimages",
            data={"access_token": settings.meta_access_token},
            files={"filename": (p.name, p.read_bytes(), "image/png")},
        )
    if resp.status_code != 200:
        return {"error": f"image_upload_failed: {resp.text[:100]}"}

    img_data  = resp.json().get("images", {}).get(p.name, {})
    img_hash  = img_data.get("hash", "")

    # Create ad creative
    payload = {
        "name":  name,
        "object_story_spec": {
            "page_id": settings.meta_page_id,
            "link_data": {
                "image_hash":   img_hash,
                "message":      body,
                "name":         headline,
                "call_to_action": {"type": cta_type or "LEARN_MORE",
                                   "value": {"link": link_url or "https://example.com"}},
            },
        },
    }
    result = await _graph("POST", f"{_ad_account()}/adcreatives", payload)
    if "id" in result:
        log.info("META CREATIVE CREATED | id=%s | name=%s", result["id"], name)
    return result


# ── Ad ────────────────────────────────────────────────────────────────────────

async def create_ad(
    ad_set_id: str,
    creative_id: str,
    name: str,
    status: str = "PAUSED",
) -> dict:
    """Create an Ad linking an Ad Set to a Creative."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    result = await _graph("POST", f"{_ad_account()}/ads", {
        "name":       name,
        "adset_id":   ad_set_id,
        "creative":   {"creative_id": creative_id},
        "status":     status,
    })
    if "id" in result:
        log.info("META AD CREATED | id=%s | status=%s", result["id"], status)
    return result


# ── Full campaign launcher ─────────────────────────────────────────────────────

async def launch_meta_campaign(
    ad_package: "AdPackage",  # noqa: F821
    daily_budget_dollars: float = 10.0,
    objective: str = "OUTCOME_TRAFFIC",
    website_url: str = "",
    auto_activate: bool = False,
) -> dict:
    """
    One-shot launcher: creates Campaign → Ad Set → Creative → Ad
    from a pre-built AdPackage.
    Returns dict with all created IDs.
    """
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    budget_cents = int(daily_budget_dollars * 100)
    status       = "ACTIVE" if auto_activate else "PAUSED"
    copy         = ad_package.platform_copy.get("facebook")
    if not copy:
        return {"error": "no_facebook_copy_in_package"}

    # Find square image
    square_img = next((img.local_path for img in ad_package.images if img.format == "square"), None)

    campaign = await create_campaign(
        name=f"{ad_package.item_name} — {ad_package.promo_type}",
        objective=objective,
        daily_budget_cents=budget_cents,
        status=status,
    )
    if "error" in campaign:
        return {"step": "campaign", **campaign}

    ad_set = await create_ad_set(
        campaign_id=campaign["id"],
        name=f"{ad_package.item_name} — Audience",
        daily_budget_cents=budget_cents,
        status=status,
    )
    if "error" in ad_set:
        return {"step": "ad_set", **ad_set}

    creative = {}
    if square_img:
        creative = await create_image_ad_creative(
            name=f"{ad_package.item_name} — Creative",
            headline=copy.headline[:40],
            body=copy.body[:125],
            cta_type="ORDER_NOW",
            image_path=square_img,
            link_url=website_url or settings.website_api_url or "",
        )

    ad = await create_ad(
        ad_set_id=ad_set["id"],
        creative_id=creative.get("id", ""),
        name=f"{ad_package.item_name} — Ad",
        status=status,
    )

    log.info("META CAMPAIGN LAUNCHED | campaign=%s | ad=%s | budget=$%.2f/day",
             campaign.get("id"), ad.get("id"), daily_budget_dollars)

    return {
        "platform":    "meta_ads",
        "ad_id":       ad_package.ad_id,
        "campaign_id": campaign.get("id"),
        "ad_set_id":   ad_set.get("id"),
        "creative_id": creative.get("id"),
        "ad_db_id":    ad.get("id"),
        "status":      status,
        "budget_per_day": daily_budget_dollars,
    }


# ── Performance metrics ───────────────────────────────────────────────────────

async def get_campaign_insights(campaign_id: str, date_preset: str = "last_7d") -> dict:
    """Retrieve performance metrics for a campaign."""
    if not _configured():
        return {"skipped": True}
    return await _graph("GET", f"{campaign_id}/insights", {
        "fields":      "impressions,reach,clicks,spend,cpc,cpm,ctr,actions",
        "date_preset": date_preset,
    })
