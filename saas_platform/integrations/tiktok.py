import os
import httpx

OAUTH = "https://www.tiktok.com/v2/auth/authorize/"
TOKEN_URL = "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/"
API = "https://business-api.tiktok.com/open_api/v1.3"


def is_configured() -> bool:
    return bool(os.getenv("TIKTOK_APP_ID") and os.getenv("TIKTOK_APP_SECRET"))


def oauth_start_url(redirect_uri: str, state: str) -> str:
    return (
        f"{OAUTH}?client_key={os.getenv('TIKTOK_APP_ID')}"
        f"&response_type=code"
        f"&scope=advertiser.show,ad.create,campaign.create,adgroup.create"
        f"&redirect_uri={redirect_uri}&state={state}"
    )


async def exchange_code(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(TOKEN_URL, json={
            "app_id": os.getenv("TIKTOK_APP_ID"),
            "secret": os.getenv("TIKTOK_APP_SECRET"),
            "auth_code": code,
            "grant_type": "authorization_code",
        })
        r.raise_for_status()
        d = r.json()
    if d.get("code") != 0:
        raise ValueError(d.get("message", "TikTok OAuth failed"))
    return d["data"]  # {access_token, advertiser_ids, ...}


async def deploy_campaign(access_token: str, advertiser_id: str, campaign: dict) -> str:
    """Creates campaign → ad group → ad. Returns TikTok campaign ID."""
    headers = {"Access-Token": access_token, "Content-Type": "application/json"}
    budget = float(campaign.get("budget_daily", 10))

    async with httpx.AsyncClient(timeout=30) as c:
        # 1 — Campaign
        r = await c.post(f"{API}/campaign/create/", headers=headers, json={
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

        # 2 — Ad Group
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

        r = await c.post(f"{API}/adgroup/create/", headers=headers, json=adgroup_body)
        r.raise_for_status()
        d = r.json()
        if d.get("code") != 0:
            raise ValueError(d.get("message", "Ad group create failed"))
        adgroup_id = d["data"]["adgroup_id"]

        # 3 — Ad
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

        r = await c.post(f"{API}/ad/create/", headers=headers, json=ad_body)
        r.raise_for_status()
        d = r.json()
        if d.get("code") != 0:
            raise ValueError(d.get("message", "Ad create failed"))
        return str(camp_id)
