import os
from typing import Optional
import httpx

GRAPH = "https://graph.facebook.com/v19.0"
OAUTH = "https://www.facebook.com/v19.0/dialog/oauth"

# Social scopes — for connecting Facebook Pages + Instagram for posting.
# These require App Review but NOT business_management/ads_management.
_SOCIAL_SCOPES = ",".join([
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
])

# Ads scopes — for running paid campaigns. Requires Advanced Access from Meta.
_ADS_SCOPES = ",".join([
    "pages_show_list",
    "pages_manage_posts",
    "business_management",
    "ads_management",
    "ads_read",
])

# Legacy combined (kept for backward compatibility)
_SCOPES = _ADS_SCOPES


def is_configured() -> bool:
    return bool(os.getenv("META_APP_ID") and os.getenv("META_APP_SECRET"))


def oauth_start_url(redirect_uri: str, state: str, source: str = "ads") -> str:
    scopes = _SOCIAL_SCOPES if source == "social" else _ADS_SCOPES
    return (
        f"{OAUTH}?client_id={os.getenv('META_APP_ID')}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={scopes}"
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
        r2 = await c.get(f"{GRAPH}/oauth/access_token", params={
            "grant_type": "fb_exchange_token",
            "client_id": os.getenv("META_APP_ID"),
            "client_secret": os.getenv("META_APP_SECRET"),
            "fb_exchange_token": short["access_token"],
        })
        r2.raise_for_status()
        return r2.json()


async def get_ad_accounts(access_token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{GRAPH}/me/adaccounts", params={
            "access_token": access_token,
            "fields": "id,name,currency,account_status",
        })
        r.raise_for_status()
        return r.json().get("data", [])


async def get_pages(access_token: str) -> list[dict]:
    """Return Facebook pages the user manages, each with its page access token."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{GRAPH}/me/accounts", params={
            "access_token": access_token,
            "fields": "id,name,access_token,instagram_business_account",
        })
        r.raise_for_status()
        return r.json().get("data", [])


async def get_ig_account_id(page_access_token: str, page_id: str) -> str | None:
    """Return the Instagram business account ID linked to a Facebook page."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{GRAPH}/{page_id}", params={
            "access_token": page_access_token,
            "fields": "instagram_business_account",
        })
        r.raise_for_status()
        ig = r.json().get("instagram_business_account", {})
        return ig.get("id")


async def create_page_post(
    access_token: str,
    page_id: str,
    content: str,
    image_url: Optional[str] = None,
    video_url: Optional[str] = None,
    link_url: Optional[str] = None,
) -> str:
    """Post to a Facebook Page. Returns the post ID."""
    if not page_id:
        raise ValueError("page_id is required. Re-connect your Meta account.")
    async with httpx.AsyncClient(timeout=60) as c:
        if video_url:
            r = await c.post(f"{GRAPH}/{page_id}/videos", params={"access_token": access_token}, json={
                "file_url": video_url,
                "description": content,
                "published": True,
            })
        elif image_url:
            r = await c.post(f"{GRAPH}/{page_id}/photos", params={"access_token": access_token}, json={
                "url": image_url,
                "caption": content,
                "published": True,
            })
        else:
            body: dict = {"message": content, "access_token": access_token}
            if link_url:
                body["link"] = link_url
            r = await c.post(f"{GRAPH}/{page_id}/feed", json=body)
        r.raise_for_status()
        data = r.json()
        return data.get("post_id") or data.get("id", "")


async def create_ig_post(
    page_access_token: str,
    ig_user_id: str,
    caption: str,
    image_url: Optional[str] = None,
    video_url: Optional[str] = None,
    media_type: str = "feed",  # feed | reel | story
) -> str:
    """Publish to Instagram via Content Publishing API. Returns media ID."""
    if not ig_user_id:
        raise ValueError("Instagram account not linked to Meta page. Re-connect Meta account.")

    async with httpx.AsyncClient(timeout=60) as c:
        params: dict = {"access_token": page_access_token}

        if media_type == "reel":
            container_params = {**params, "media_type": "REELS", "video_url": video_url, "caption": caption, "share_to_feed": "true"}
        elif media_type == "story":
            container_params = {**params, "media_type": "STORIES"}
            if video_url:
                container_params["video_url"] = video_url
            else:
                container_params["image_url"] = image_url
        else:
            if video_url:
                container_params = {**params, "media_type": "VIDEO", "video_url": video_url, "caption": caption}
            else:
                container_params = {**params, "image_url": image_url, "caption": caption}

        r = await c.post(f"{GRAPH}/{ig_user_id}/media", params=container_params)
        r.raise_for_status()
        creation_id = r.json()["id"]

        r2 = await c.post(f"{GRAPH}/{ig_user_id}/media_publish", params={
            **params,
            "creation_id": creation_id,
        })
        r2.raise_for_status()
        return r2.json()["id"]


async def deploy_campaign(access_token: str, ad_account_id: str, campaign: dict) -> str:
    """Creates campaign → ad set → creative → ad. Returns Meta campaign ID."""
    token_param = {"access_token": access_token}

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{GRAPH}/{ad_account_id}/campaigns", params=token_param, json={
            "name": campaign["headline"],
            "objective": "OUTCOME_AWARENESS",
            "status": "ACTIVE",
            "special_ad_categories": [],
        })
        r.raise_for_status()
        camp_id = r.json()["id"]

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

        r = await c.post(f"{GRAPH}/{ad_account_id}/ads", params=token_param, json={
            "name": campaign["headline"],
            "adset_id": adset_id,
            "creative": {"creative_id": creative_id},
            "status": "ACTIVE",
        })
        r.raise_for_status()
        return camp_id
