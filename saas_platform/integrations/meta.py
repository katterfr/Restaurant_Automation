import os
import httpx

GRAPH = "https://graph.facebook.com/v19.0"
OAUTH = "https://www.facebook.com/v19.0/dialog/oauth"


def is_configured() -> bool:
    return bool(os.getenv("META_APP_ID") and os.getenv("META_APP_SECRET"))


def oauth_start_url(redirect_uri: str, state: str) -> str:
    return (
        f"{OAUTH}?client_id={os.getenv('META_APP_ID')}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=ads_management,ads_read,business_management"
        f"&state={state}&response_type=code"
    )


async def exchange_code(code: str, redirect_uri: str) -> dict:
    params = {
        "client_id": os.getenv("META_APP_ID"),
        "client_secret": os.getenv("META_APP_SECRET"),
        "code": code,
        "redirect_uri": redirect_uri,
    }
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{GRAPH}/oauth/access_token", params=params)
        r.raise_for_status()
        short = r.json()
        # Upgrade to 60-day long-lived token
        r2 = await c.get(f"{GRAPH}/oauth/access_token", params={
            "grant_type": "fb_exchange_token",
            "client_id": os.getenv("META_APP_ID"),
            "client_secret": os.getenv("META_APP_SECRET"),
            "fb_exchange_token": short["access_token"],
        })
        r2.raise_for_status()
        return r2.json()  # {access_token, token_type, expires_in}


async def get_ad_accounts(access_token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{GRAPH}/me/adaccounts", params={
            "access_token": access_token,
            "fields": "id,name,currency,account_status",
        })
        r.raise_for_status()
        return r.json().get("data", [])


async def deploy_campaign(access_token: str, ad_account_id: str, campaign: dict) -> str:
    """Creates campaign → ad set → creative → ad. Returns Meta campaign ID."""
    token_param = {"access_token": access_token}

    async with httpx.AsyncClient(timeout=30) as c:
        # 1 — Campaign
        r = await c.post(f"{GRAPH}/{ad_account_id}/campaigns", params=token_param, json={
            "name": campaign["headline"],
            "objective": "OUTCOME_AWARENESS",
            "status": "ACTIVE",
            "special_ad_categories": [],
        })
        r.raise_for_status()
        camp_id = r.json()["id"]

        # 2 — Ad Set
        targeting: dict = {"age_min": 18, "age_max": 65}
        if campaign.get("location"):
            targeting["geo_locations"] = {
                "custom_locations": [{
                    "address_string": campaign["location"],
                    "radius": campaign.get("radius_miles", 10),
                    "distance_unit": "mile",
                }],
                "location_types": ["home", "recent"],
            }
        else:
            targeting["geo_locations"] = {"countries": ["US"]}

        adset_body: dict = {
            "campaign_id": camp_id,
            "name": f"{campaign['headline']} – Set",
            "daily_budget": int(float(campaign.get("budget_daily", 10)) * 100),
            "billing_event": "IMPRESSIONS",
            "optimization_goal": "REACH",
            "targeting": targeting,
            "status": "ACTIVE",
        }
        if campaign.get("start_date"):
            adset_body["start_time"] = campaign["start_date"]
        if campaign.get("end_date"):
            adset_body["end_time"] = campaign["end_date"]

        r = await c.post(f"{GRAPH}/{ad_account_id}/adsets", params=token_param, json=adset_body)
        r.raise_for_status()
        adset_id = r.json()["id"]

        # 3 — Creative
        link_data: dict = {
            "link": campaign.get("destination_url", ""),
            "message": campaign.get("body", ""),
            "name": campaign["headline"],
            "call_to_action": {
                "type": campaign.get("cta", "LEARN_MORE"),
                "value": {"link": campaign.get("destination_url", "")},
            },
        }
        if campaign.get("image_url"):
            link_data["picture"] = campaign["image_url"]

        creative_body: dict = {
            "name": f"{campaign['headline']} – Creative",
            "object_story_spec": {"link_data": link_data},
        }
        if campaign.get("page_id"):
            creative_body["object_story_spec"]["page_id"] = campaign["page_id"]

        r = await c.post(f"{GRAPH}/{ad_account_id}/adcreatives", params=token_param, json=creative_body)
        r.raise_for_status()
        creative_id = r.json()["id"]

        # 4 — Ad
        r = await c.post(f"{GRAPH}/{ad_account_id}/ads", params=token_param, json={
            "name": campaign["headline"],
            "adset_id": adset_id,
            "creative": {"creative_id": creative_id},
            "status": "ACTIVE",
        })
        r.raise_for_status()
        return camp_id
