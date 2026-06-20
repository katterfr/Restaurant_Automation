import os
from typing import Optional
import httpx

# Business API — for ads campaigns
_BIZ_OAUTH   = "https://www.tiktok.com/v2/auth/authorize/"
_BIZ_TOKEN   = "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/"
_BIZ_API     = "https://business-api.tiktok.com/open_api/v1.3"

# Login Kit / Content Posting API — for organic posts
_CONTENT_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/"
_CONTENT_API   = "https://open.tiktokapis.com"


def is_configured() -> bool:
    return bool(os.getenv("TIKTOK_APP_ID") and os.getenv("TIKTOK_APP_SECRET"))


# ─── Business OAuth (ads) ────────────────────────────────────────────────────

def oauth_start_url(redirect_uri: str, state: str) -> str:
    return (
        f"{_BIZ_OAUTH}?client_key={os.getenv('TIKTOK_APP_ID')}"
        f"&response_type=code"
        f"&scope=advertiser.show,ad.create,campaign.create,adgroup.create"
        f"&redirect_uri={redirect_uri}&state={state}"
    )


async def exchange_code(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(_BIZ_TOKEN, json={
            "app_id": os.getenv("TIKTOK_APP_ID"),
            "secret": os.getenv("TIKTOK_APP_SECRET"),
            "auth_code": code,
            "grant_type": "authorization_code",
        })
        r.raise_for_status()
        d = r.json()
    if d.get("code") != 0:
        raise ValueError(d.get("message", "TikTok OAuth failed"))
    return d["data"]


# ─── Content OAuth (organic posts) ───────────────────────────────────────────

def content_oauth_url(redirect_uri: str, state: str) -> str:
    """OAuth URL for TikTok Login Kit — grants video.publish scope."""
    return (
        f"{_BIZ_OAUTH}?client_key={os.getenv('TIKTOK_APP_ID')}"
        f"&response_type=code"
        f"&scope=video.publish,user.info.basic"
        f"&redirect_uri={redirect_uri}&state={state}"
    )


async def content_exchange_code(code: str, redirect_uri: str) -> dict:
    """Exchange auth code for a Login Kit user access token."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(_CONTENT_TOKEN, data={
            "client_key": os.getenv("TIKTOK_APP_ID"),
            "client_secret": os.getenv("TIKTOK_APP_SECRET"),
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        r.raise_for_status()
        d = r.json()
    if d.get("error"):
        raise ValueError(d.get("error_description", "TikTok content OAuth failed"))
    return d


# ─── Organic content posting ─────────────────────────────────────────────────

async def create_post(
    access_token: str,
    _unused: str,
    content: str,
    image_url: Optional[str] = None,
    video_url: Optional[str] = None,
) -> str:
    """Post organic content via TikTok Content Posting API. Returns publish_id."""
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60) as c:
        if video_url:
            body = {
                "post_info": {
                    "title": content[:150],
                    "privacy_level": "PUBLIC_TO_EVERYONE",
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False,
                },
                "source_info": {
                    "source": "PULL_FROM_URL",
                    "video_url": video_url,
                },
                "post_mode": "DIRECT_POST",
                "media_type": "VIDEO",
            }
            r = await c.post(f"{_CONTENT_API}/v2/post/publish/video/init/", headers=headers, json=body)
        else:
            body = {
                "post_info": {
                    "title": content[:150],
                    "privacy_level": "PUBLIC_TO_EVERYONE",
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False,
                },
                "source_info": {
                    "source": "PULL_FROM_URL",
                    "photo_images": [image_url] if image_url else [],
                    "photo_cover_index": 0,
                },
                "post_mode": "DIRECT_POST",
                "media_type": "PHOTO",
            }
            r = await c.post(f"{_CONTENT_API}/v2/post/publish/content/init/", headers=headers, json=body)

        r.raise_for_status()
        d = r.json()
        err = d.get("error", {})
        if err.get("code", "ok") != "ok":
            raise ValueError(err.get("message", "TikTok post failed"))
        return d["data"]["publish_id"]


# ─── Ads campaigns ───────────────────────────────────────────────────────────

async def deploy_campaign(access_token: str, advertiser_id: str, campaign: dict) -> str:
    """Creates campaign → ad group → ad. Returns TikTok campaign ID."""
    headers = {"Access-Token": access_token, "Content-Type": "application/json"}
    budget = float(campaign.get("budget_daily", 10))

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{_BIZ_API}/campaign/create/", headers=headers, json={
            "advertiser_id": advertiser_id,
            "campaign_name": campaign["headline"],
            "objective_type": "REACH",
            "budget_mode": "BUDGET_MODE_DAY",
            "budget": budget,
        })
        r.raise_for_status()
        d = r.json()
        if d.get("code") != 0:
            raise ValueError(d.get("message", "Campaign create failed"))
        camp_id = d["data"]["campaign_id"]

        adgroup_body: dict = {
            "advertiser_id": advertiser_id,
            "campaign_id": camp_id,
            "adgroup_name": f"{campaign['headline']} – Group",
            "placement_type": "PLACEMENT_TYPE_AUTOMATIC",
            "budget_mode": "BUDGET_MODE_DAY",
            "budget": budget,
            "schedule_type": "SCHEDULE_FROM_NOW",
            "optimization_goal": "REACH",
            "billing_event": "CPM",
            "bid_type": "BID_TYPE_NO_BID",
            "age_groups": ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"],
        }
        if campaign.get("location"):
            adgroup_body["location_ids"] = [campaign["location"]]

        r = await c.post(f"{_BIZ_API}/adgroup/create/", headers=headers, json=adgroup_body)
        r.raise_for_status()
        d = r.json()
        if d.get("code") != 0:
            raise ValueError(d.get("message", "Ad group create failed"))
        adgroup_id = d["data"]["adgroup_id"]

        ad_body: dict = {
            "advertiser_id": advertiser_id,
            "adgroup_id": adgroup_id,
            "ad_name": campaign["headline"],
            "ad_format": "SINGLE_IMAGE",
            "ad_text": (campaign.get("body") or campaign["headline"])[:100],
            "call_to_action": campaign.get("cta", "LEARN_MORE"),
            "landing_page_url": campaign.get("destination_url", ""),
        }
        if campaign.get("image_url"):
            ad_body["image_ids"] = [campaign["image_url"]]

        r = await c.post(f"{_BIZ_API}/ad/create/", headers=headers, json=ad_body)
        r.raise_for_status()
        d = r.json()
        if d.get("code") != 0:
            raise ValueError(d.get("message", "Ad create failed"))
        return str(camp_id)
