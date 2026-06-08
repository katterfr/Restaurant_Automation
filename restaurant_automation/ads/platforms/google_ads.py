"""
ads/platforms/google_ads.py — Google Ads campaign manager via Google Ads API v17.

Creates and manages:
  - Performance Max campaigns (best for restaurants — auto-optimizes across Search, Display, YouTube, Maps)
  - Search campaigns with responsive search ads
  - Display / Discovery campaigns with image assets
  - Budget, targeting, audience, and asset management
  - Performance reporting

Docs: https://developers.google.com/google-ads/api/docs/start

Required .env:
  GOOGLE_ADS_DEVELOPER_TOKEN  — Developer token from Google Ads API Center
  GOOGLE_ADS_CLIENT_ID        — OAuth2 client ID
  GOOGLE_ADS_CLIENT_SECRET    — OAuth2 client secret
  GOOGLE_ADS_REFRESH_TOKEN    — OAuth2 refresh token (from OAuth flow)
  GOOGLE_ADS_CUSTOMER_ID      — 10-digit Google Ads customer ID (no dashes)
  GOOGLE_ADS_LOGIN_CUSTOMER_ID — Manager account ID (if using MCC)
"""
from __future__ import annotations
import asyncio
import base64
import logging
from pathlib import Path
from typing import Optional
import httpx
from orchestrator.config import settings

log = logging.getLogger(__name__)

TOKEN_URL  = "https://oauth2.googleapis.com/token"
ADS_BASE   = "https://googleads.googleapis.com/v17"
_token_cache: dict = {}


def _configured() -> bool:
    return bool(
        settings.google_ads_developer_token
        and settings.google_ads_client_id
        and settings.google_ads_customer_id
    )


# ── OAuth2 ───────────────────────────────────────────────────────────────────

async def _get_access_token() -> Optional[str]:
    """Refresh and cache the Google Ads OAuth2 access token."""
    import time as t
    if _token_cache.get("expires_at", 0) > t.time() + 30:
        return _token_cache["token"]

    if not (settings.google_ads_client_id and settings.google_ads_client_secret
            and settings.google_ads_refresh_token):
        log.warning("Google Ads OAuth credentials incomplete")
        return None

    async with httpx.AsyncClient(timeout=15) as c:
        resp = await c.post(TOKEN_URL, data={
            "client_id":     settings.google_ads_client_id,
            "client_secret": settings.google_ads_client_secret,
            "refresh_token": settings.google_ads_refresh_token,
            "grant_type":    "refresh_token",
        })

    if resp.status_code == 200:
        body = resp.json()
        import time as t2
        _token_cache["token"]      = body["access_token"]
        _token_cache["expires_at"] = t2.time() + body.get("expires_in", 3600)
        return _token_cache["token"]

    log.warning("Google Ads token refresh failed: %d %s", resp.status_code, resp.text[:200])
    return None


async def _headers() -> Optional[dict]:
    token = await _get_access_token()
    if not token:
        return None
    h = {
        "Authorization":              f"Bearer {token}",
        "developer-token":            settings.google_ads_developer_token or "",
        "Content-Type":               "application/json",
    }
    if settings.google_ads_login_customer_id:
        h["login-customer-id"] = settings.google_ads_login_customer_id
    return h


def _customer_url(resource_path: str = "") -> str:
    cid = (settings.google_ads_customer_id or "").replace("-", "")
    return f"{ADS_BASE}/customers/{cid}/{resource_path}"


async def _mutate(resource: str, operations: list[dict]) -> dict:
    """Send a mutate request to Google Ads API."""
    headers = await _headers()
    if not headers:
        return {"error": "auth_failed"}

    url = _customer_url(f"{resource}:mutate")
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(url, json={"operations": operations}, headers=headers)

    if resp.status_code == 200:
        return resp.json()
    log.warning("GOOGLE ADS MUTATE %s FAILED | %d | %s", resource, resp.status_code, resp.text[:300])
    return {"error": resp.text[:300]}


async def _query(gaql: str) -> list[dict]:
    """Execute a GAQL query and return rows."""
    headers = await _headers()
    if not headers:
        return []
    url = _customer_url("googleAds:searchStream")
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(url, json={"query": gaql}, headers=headers)
    if resp.status_code == 200:
        rows = []
        for chunk in resp.json():
            rows.extend(chunk.get("results", []))
        return rows
    return []


# ── Budget ────────────────────────────────────────────────────────────────────

async def create_budget(
    name: str,
    daily_budget_dollars: float = 10.0,
    delivery_method: str = "STANDARD",
) -> Optional[str]:
    """Create a campaign budget. Returns resource name."""
    result = await _mutate("campaignBudgets", [{
        "create": {
            "name":            name,
            "amountMicros":    int(daily_budget_dollars * 1_000_000),
            "deliveryMethod":  delivery_method,
            "explicitlyShared": False,
        }
    }])
    rn = result.get("results", [{}])[0].get("resourceName")
    if rn:
        log.info("GOOGLE ADS BUDGET | %s | $%.2f/day", rn, daily_budget_dollars)
    return rn


# ── Performance Max Campaign ──────────────────────────────────────────────────

async def create_performance_max_campaign(
    name: str,
    budget_resource: str,
    target_roas: float = 4.0,      # $4 revenue per $1 spend
    geo_target_ids: list[str] | None = None,
    status: str = "PAUSED",
) -> Optional[str]:
    """
    Create a Performance Max campaign — Google's best format for local restaurants.
    Automatically serves across Search, Display, YouTube, Gmail, Maps, Shopping.
    """
    payload = {
        "name":             name,
        "campaignBudget":   budget_resource,
        "advertisingChannelType": "PERFORMANCE_MAX",
        "status":           status,
        "biddingStrategyType": "TARGET_ROAS",
        "targetRoas":       {"targetRoas": target_roas},
    }
    if geo_target_ids:
        payload["geoTargetTypeSetting"] = {
            "positiveGeoTargetType": "PRESENCE_OR_INTEREST"
        }

    result = await _mutate("campaigns", [{"create": payload}])
    rn = result.get("results", [{}])[0].get("resourceName")
    if rn:
        log.info("GOOGLE ADS PMAX CAMPAIGN | %s", rn)
    return rn


# ── Asset Group (Performance Max) ────────────────────────────────────────────

async def create_asset_group(
    campaign_resource: str,
    name: str,
    headlines: list[str],
    descriptions: list[str],
    final_url: str,
    business_name: str,
) -> Optional[str]:
    """Create an asset group for a Performance Max campaign."""
    # Ensure required minimums: 3 headlines, 2 descriptions
    while len(headlines)    < 3:
        headlines.append(headlines[-1])
    while len(descriptions) < 2:
        descriptions.append(descriptions[-1])

    operations = [{
        "create": {
            "campaign":    campaign_resource,
            "name":        name,
            "finalUrls":   [final_url],
            "status":      "ENABLED",
            "headlines":   [{"text": h[:30]} for h in headlines[:15]],
            "descriptions":[{"text": d[:90]} for d in descriptions[:4]],
            "businessName": business_name[:25],
        }
    }]
    result = await _mutate("assetGroups", operations)
    rn = result.get("results", [{}])[0].get("resourceName")
    if rn:
        log.info("GOOGLE ADS ASSET GROUP | %s", rn)
    return rn


# ── Image Asset ───────────────────────────────────────────────────────────────

async def upload_image_asset(image_path: str, name: str) -> Optional[str]:
    """Upload an image as a Google Ads asset. Returns asset resource name."""
    p = Path(image_path)
    if not p.exists():
        return None
    b64 = base64.b64encode(p.read_bytes()).decode()
    result = await _mutate("assets", [{
        "create": {
            "name":       name,
            "type":       "IMAGE",
            "imageAsset": {"data": b64},
        }
    }])
    rn = result.get("results", [{}])[0].get("resourceName")
    if rn:
        log.info("GOOGLE ADS IMAGE ASSET | %s | %s", rn, name)
    return rn


# ── Search Campaign ──────────────────────────────────────────────────────────

async def create_search_campaign(
    name: str,
    budget_resource: str,
    keywords: list[str],
    final_url: str,
    headlines: list[str],
    descriptions: list[str],
    status: str = "PAUSED",
) -> dict:
    """Create a Search campaign with a Responsive Search Ad."""
    # Create campaign
    campaign_result = await _mutate("campaigns", [{
        "create": {
            "name":                       name,
            "campaignBudget":             budget_resource,
            "advertisingChannelType":     "SEARCH",
            "status":                     status,
            "biddingStrategyType":        "MAXIMIZE_CLICKS",
            "networkSettings": {
                "targetGoogleSearch":        True,
                "targetSearchNetwork":       True,
                "targetContentNetwork":      False,
            },
        }
    }])
    campaign_rn = campaign_result.get("results", [{}])[0].get("resourceName", "")

    # Create Ad Group
    cid = (settings.google_ads_customer_id or "").replace("-", "")
    ag_result = await _mutate("adGroups", [{
        "create": {
            "name":     f"{name} — Ad Group",
            "campaign": campaign_rn,
            "status":   "ENABLED",
        }
    }])
    ag_rn = ag_result.get("results", [{}])[0].get("resourceName", "")

    # Add keywords
    kw_ops = [{"create": {
        "adGroup":     ag_rn,
        "status":      "ENABLED",
        "keyword":     {"text": kw, "matchType": "PHRASE"},
    }} for kw in keywords[:20]]
    if kw_ops:
        await _mutate("adGroupCriteria", kw_ops)

    # Create Responsive Search Ad
    rsa_result = await _mutate("adGroupAds", [{
        "create": {
            "adGroup": ag_rn,
            "status":  "ENABLED",
            "ad": {
                "responsiveSearchAd": {
                    "headlines":     [{"text": h[:30], "pinnedField": None} for h in headlines[:15]],
                    "descriptions":  [{"text": d[:90]} for d in descriptions[:4]],
                },
                "finalUrls": [final_url],
            },
        }
    }])

    log.info("GOOGLE SEARCH CAMPAIGN | campaign=%s | ad_group=%s", campaign_rn, ag_rn)
    return {
        "platform":    "google_ads",
        "type":        "search",
        "campaign":    campaign_rn,
        "ad_group":    ag_rn,
        "status":      status,
    }


# ── Full launcher ─────────────────────────────────────────────────────────────

async def launch_google_campaign(
    ad_package: "AdPackage",   # noqa: F821
    daily_budget_dollars: float = 10.0,
    website_url: str = "",
    campaign_type: str = "performance_max",
    auto_activate: bool = False,
) -> dict:
    """One-shot launcher from an AdPackage."""
    if not _configured():
        return {"skipped": True, "reason": "not_configured"}

    status     = "ENABLED" if auto_activate else "PAUSED"
    copy       = ad_package.platform_copy.get("google_ads")
    if not copy:
        return {"error": "no_google_ads_copy_in_package"}

    final_url  = website_url or settings.website_api_url or "https://example.com"
    item_name  = ad_package.item_name

    # Create budget
    budget_rn = await create_budget(
        name=f"{item_name} Budget",
        daily_budget_dollars=daily_budget_dollars,
    )
    if not budget_rn:
        return {"error": "budget_creation_failed"}

    if campaign_type == "performance_max":
        # Upload images as assets
        asset_rns = []
        for img in ad_package.images:
            rn = await upload_image_asset(img.local_path, f"{item_name} {img.format}")
            if rn:
                asset_rns.append(rn)

        campaign_rn = await create_performance_max_campaign(
            name=f"{item_name} — PMax",
            budget_resource=budget_rn,
            status=status,
        )
        if not campaign_rn:
            return {"error": "campaign_creation_failed"}

        ag_rn = await create_asset_group(
            campaign_resource=campaign_rn,
            name=f"{item_name} Asset Group",
            headlines=[copy.headline] + [f"Order {item_name} Today", f"Try {item_name}"],
            descriptions=[copy.body[:90], copy.cta[:90]],
            final_url=final_url,
            business_name=settings.restaurant_name[:25],
        )

        log.info("GOOGLE PMAX LAUNCHED | campaign=%s | budget=$%.2f/day", campaign_rn, daily_budget_dollars)
        return {
            "platform":    "google_ads",
            "type":        "performance_max",
            "ad_id":       ad_package.ad_id,
            "campaign":    campaign_rn,
            "asset_group": ag_rn,
            "assets":      asset_rns,
            "status":      status,
            "budget_per_day": daily_budget_dollars,
        }

    else:
        # Search campaign
        keywords = [
            f"{settings.restaurant_name}",
            f"{item_name} near me",
            f"best {item_name}",
            f"order {item_name} online",
            f"food delivery {item_name}",
        ]
        return await create_search_campaign(
            name=f"{item_name} — Search",
            budget_resource=budget_rn,
            keywords=keywords,
            final_url=final_url,
            headlines=[copy.headline, f"Order {item_name} Online", settings.restaurant_name[:30]],
            descriptions=[copy.body[:90], copy.cta[:90]],
            status=status,
        )


# ── Reporting ─────────────────────────────────────────────────────────────────

async def get_campaign_performance(days: int = 7) -> list[dict]:
    """Fetch campaign performance for the last N days."""
    if not _configured():
        return []
    gaql = f"""
        SELECT
            campaign.name, campaign.status,
            metrics.impressions, metrics.clicks, metrics.cost_micros,
            metrics.conversions, metrics.ctr, metrics.average_cpc
        FROM campaign
        WHERE segments.date DURING LAST_{days}_DAYS
        ORDER BY metrics.impressions DESC
        LIMIT 50
    """
    rows = await _query(gaql)
    results = []
    for row in rows:
        m = row.get("metrics", {})
        results.append({
            "name":         row.get("campaign", {}).get("name", ""),
            "status":       row.get("campaign", {}).get("status", ""),
            "impressions":  m.get("impressions", 0),
            "clicks":       m.get("clicks", 0),
            "spend":        round(int(m.get("costMicros", 0)) / 1_000_000, 2),
            "conversions":  m.get("conversions", 0),
            "ctr":          round(float(m.get("ctr", 0)) * 100, 2),
            "avg_cpc":      round(int(m.get("averageCpc", 0)) / 1_000_000, 2),
        })
    return results
