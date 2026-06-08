"""
ads/platforms/tiktok_ads.py — TikTok for Business Ads API.

Creates and manages:
  - TopView, In-Feed, and Spark Ads campaigns
  - Image and video ad creatives
  - Audience targeting (interest, behavior, lookalike)
  - Campaign budget and scheduling

Docs: https://ads.tiktok.com/marketing_api/docs

Required .env:
  TIKTOK_ADS_APP_ID          — App ID from TikTok for Business
  TIKTOK_ADS_SECRET          — App secret
  TIKTOK_ADS_ACCESS_TOKEN    — Long-lived advertiser access token
  TIKTOK_ADS_ADVERTISER_ID   — Advertiser account ID
"""
from __future__ import annotations
import base64
import logging
from pathlib import Path
from typing import Optional
import httpx
from orchestrator.config import settings

log = logging.getLogger(__name__)
API_BASE = "https://business-api.tiktok.com/open_api/v1.3"


def _configured() -> bool:
    return bool(settings.tiktok_ads_access_token and settings.tiktok_ads_advertiser_id)


def _headers() -> dict:
    return {
        "Access-Token": settings.tiktok_ads_access_token or "",
        "Content-Type": "application/json",
    }


async def _post(endpoint: str, payload: dict) -> dict:
    url = f"{API_BASE}/{endpoint}/"
    payload["advertiser_id"] = settings.tiktok_ads_advertiser_id
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(url, json=payload, headers=_headers())
    if resp.status_code == 200:
        body = resp.json()
        if body.get("code") == 0:
            return body.get("data", {})
        log.warning("TIKTOK ADS API ERROR | code=%s | msg=%s", body.get("code"), body.get("message"))
        return {"error": body.get("message")}
    log.warning("TIKTOK ADS HTTP FAILED | %d | %s", resp.status_code, resp.text[:200])
    return {"error": resp.text[:200]}


# ── Campaign ──────────────────────────────────────────────────────────────────

async def create_campaign(
    name: str,
    objective: str = "TRAFFIC",       # TRAFFIC | REACH | VIDEO_VIEWS | CONVERSIONS
    budget_mode: str = "BUDGET_MODE_DAY",
    budget: float = 20.0,
    status: str = "DISABLE",          # DISABLE = paused
) -> dict:
    result = await _post("campaign/create", {
        "campaign_name":  name,
        "objective_type": objective,
        "budget_mode":    budget_mode,
        "budget":         budget,
        "operation_status": status,
    })
    if "campaign_id" in result:
        log.info("TIKTOK CAMPAIGN CREATED | id=%s", result["campaign_id"])
    return result


# ── Ad Group ──────────────────────────────────────────────────────────────────

async def create_ad_group(
    campaign_id: str,
    name: str,
    daily_budget: float = 20.0,
    placements: list[str] | None = None,
    interests: list[dict] | None = None,
    age_groups: list[str] | None = None,
    status: str = "DISABLE",
) -> dict:
    payload = {
        "campaign_id":       campaign_id,
        "adgroup_name":      name,
        "placement_type":    "PLACEMENT_TYPE_NORMAL",
        "placements":        placements or ["PLACEMENT_TIKTOK"],
        "budget_mode":       "BUDGET_MODE_DAY",
        "budget":            daily_budget,
        "schedule_type":     "SCHEDULE_START_END",
        "optimization_goal": "CLICK",
        "bid_type":          "BID_TYPE_NO_BID",
        "billing_event":     "CPC",
        "operation_status":  status,
        "targeting": {
            "age":        age_groups or ["AGE_18_24", "AGE_25_34", "AGE_35_44"],
            "gender":     "GENDER_UNLIMITED",
            "languages":  ["en"],
            "interest_category": interests or [
                {"id": "1000000", "name": "Food & Beverages"},
                {"id": "1000001", "name": "Restaurants & Dining"},
            ],
        },
    }
    result = await _post("adgroup/create", payload)
    if "adgroup_id" in result:
        log.info("TIKTOK AD GROUP CREATED | id=%s", result["adgroup_id"])
    return result


# ── Image Upload ──────────────────────────────────────────────────────────────

async def upload_image(image_path: str) -> Optional[str]:
    """Upload image to TikTok Ads library. Returns image_id."""
    p = Path(image_path)
    if not p.exists():
        return None

    url = f"{API_BASE}/file/image/ad/upload/"
    b64 = base64.b64encode(p.read_bytes()).decode()

    async with httpx.AsyncClient(timeout=60) as c:
        resp = await c.post(url,
                            json={
                                "advertiser_id": settings.tiktok_ads_advertiser_id,
                                "upload_type":   "UPLOAD_BY_FILE",
                                "image_file":    b64,
                                "image_signature": "auto",
                            },
                            headers=_headers())

    if resp.status_code == 200:
        data = resp.json().get("data", {})
        image_id = data.get("image_id", "")
        log.info("TIKTOK IMAGE UPLOADED | id=%s", image_id)
        return image_id
    log.warning("TIKTOK IMAGE UPLOAD FAILED | %d | %s", resp.status_code, resp.text[:200])
    return None


# ── Ad Creative ───────────────────────────────────────────────────────────────

async def create_image_ad(
    ad_group_id: str,
    name: str,
    image_id: str,
    headline: str,
    call_to_action: str = "ORDER_NOW",
    landing_url: str = "",
    status: str = "DISABLE",
) -> dict:
    payload = {
        "adgroup_id":       ad_group_id,
        "ad_name":          name,
        "ad_format":        "SINGLE_IMAGE",
        "operation_status": status,
        "creatives": [{
            "image_ids":       [image_id],
            "ad_text":         headline[:100],
            "call_to_action":  call_to_action,
            "landing_page_url": landing_url,
        }],
    }
    result = await _post("ad/create", payload)
    if "ad_id" in result:
        log.info("TIKTOK AD CREATED | id=%s | name=%s", result["ad_id"], name)
    return result


# ── Full campaign launcher ─────────────────────────────────────────────────────

async def launch_tiktok_campaign(
    ad_package: "AdPackage",   # noqa: F821
    daily_budget_dollars: float = 20.0,
    website_url: str = "",
    auto_activate: bool = False,
) -> dict:
    """One-shot launcher from an AdPackage."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    status = "ENABLE" if auto_activate else "DISABLE"
    copy   = ad_package.platform_copy.get("tiktok")
    if not copy:
        return {"error": "no_tiktok_copy_in_package"}

    final_url = website_url or settings.website_api_url or ""

    # Create campaign
    campaign = await create_campaign(
        name=f"{ad_package.item_name} — TikTok",
        objective="TRAFFIC",
        budget=daily_budget_dollars * 7,   # weekly budget
        status=status,
    )
    if "error" in campaign:
        return {"step": "campaign", **campaign}

    # Create ad group
    ad_group = await create_ad_group(
        campaign_id=campaign["campaign_id"],
        name=f"{ad_package.item_name} — TikTok Feed",
        daily_budget=daily_budget_dollars,
        status=status,
    )
    if "error" in ad_group:
        return {"step": "ad_group", **ad_group}

    # Upload portrait image (9:16 — best for TikTok)
    portrait_img = next(
        (img.local_path for img in ad_package.images if img.format == "portrait"), None
    ) or next((img.local_path for img in ad_package.images), None)

    image_id = await upload_image(portrait_img) if portrait_img else None
    if not image_id:
        return {"step": "image_upload", "error": "upload_failed"}

    # Create ad
    ad = await create_image_ad(
        ad_group_id=ad_group["adgroup_id"],
        name=f"{ad_package.item_name} — Ad",
        image_id=image_id,
        headline=copy.headline[:100],
        call_to_action="ORDER_NOW",
        landing_url=final_url,
        status=status,
    )

    log.info("TIKTOK CAMPAIGN LAUNCHED | campaign=%s | ad=%s | budget=$%.2f/day",
             campaign.get("campaign_id"), ad.get("ad_id"), daily_budget_dollars)

    return {
        "platform":    "tiktok_ads",
        "ad_id":       ad_package.ad_id,
        "campaign_id": campaign.get("campaign_id"),
        "ad_group_id": ad_group.get("adgroup_id"),
        "ad_db_id":    ad.get("ad_id"),
        "status":      status,
        "budget_per_day": daily_budget_dollars,
    }


# ── Reporting ─────────────────────────────────────────────────────────────────

async def get_campaign_performance(days: int = 7) -> list[dict]:
    """Fetch campaign performance report."""
    if not _configured():
        return []

    from datetime import date, timedelta
    end_date   = date.today().isoformat()
    start_date = (date.today() - timedelta(days=days)).isoformat()

    url = f"{API_BASE}/report/integrated/get/"
    payload = {
        "advertiser_id": settings.tiktok_ads_advertiser_id,
        "report_type":   "BASIC",
        "dimensions":    ["campaign_id", "stat_time_day"],
        "metrics":       ["spend", "impressions", "clicks", "ctr", "cpc", "conversions"],
        "start_date":    start_date,
        "end_date":      end_date,
        "page_size":     50,
    }
    async with httpx.AsyncClient(timeout=20) as c:
        resp = await c.get(url, params={
            **payload,
            "dimensions": '["campaign_id","stat_time_day"]',
            "metrics":    '["spend","impressions","clicks","ctr","cpc"]',
        }, headers=_headers())

    if resp.status_code == 200:
        rows = resp.json().get("data", {}).get("list", [])
        return [{"campaign_id": r.get("dimensions", {}).get("campaign_id"),
                 **r.get("metrics", {})} for r in rows]
    return []
