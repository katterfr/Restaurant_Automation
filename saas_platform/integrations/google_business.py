import os
import httpx

OAUTH = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1"
GBP_API = "https://mybusinessbusinessinformation.googleapis.com/v1"
POSTS_API = "https://mybusiness.googleapis.com/v4"

# Scopes needed for Business Profile management
GBP_SCOPES = "https://www.googleapis.com/auth/business.manage"


def is_configured() -> bool:
    return bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))


def oauth_start_url(redirect_uri: str, state: str) -> str:
    return (
        f"{OAUTH}?client_id={os.getenv('GOOGLE_CLIENT_ID')}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope={GBP_SCOPES}"
        f"&state={state}&access_type=offline&prompt=consent"
    )


async def exchange_code(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(TOKEN_URL, data={
            "code": code, "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "redirect_uri": redirect_uri, "grant_type": "authorization_code",
        })
        r.raise_for_status()
        return r.json()


async def refresh_token(refresh_tok: str) -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(TOKEN_URL, data={
            "refresh_token": refresh_tok, "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "grant_type": "refresh_token",
        })
        r.raise_for_status()
        return r.json()["access_token"]


async def list_accounts(access_token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{ACCOUNTS_API}/accounts",
                        headers={"Authorization": f"Bearer {access_token}"})
        r.raise_for_status()
        return r.json().get("accounts", [])


async def list_locations(access_token: str, account_name: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{GBP_API}/{account_name}/locations",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"readMask": "name,title,storefrontAddress,websiteUri,regularHours,phoneNumbers,profile"},
        )
        r.raise_for_status()
        return r.json().get("locations", [])


async def create_location(access_token: str, account_name: str, info: dict) -> dict:
    location = {
        "title": info.get("name", ""),
        "storefrontAddress": {
            "addressLines": [info.get("address_line1", "")],
            "locality": info.get("city", ""),
            "administrativeArea": info.get("state", ""),
            "postalCode": info.get("zip", ""),
            "regionCode": "US",
        },
        "phoneNumbers": {"primaryPhone": info.get("phone", "")},
        "websiteUri": info.get("website", ""),
        "profile": {"description": info.get("description", "")},
        "categories": {"primaryCategory": {"name": "categories/restaurant"}},
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{GBP_API}/{account_name}/locations",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=location,
            params={"requestId": f"cs-{info.get('tenant_id', 0)}-{int(__import__('time').time())}",
                    "validateOnly": "false"},
        )
        r.raise_for_status()
        return r.json()


async def update_location(access_token: str, location_name: str, updates: dict) -> dict:
    update_mask = ",".join(updates.keys())
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.patch(
            f"{GBP_API}/{location_name}",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=updates,
            params={"updateMask": update_mask},
        )
        r.raise_for_status()
        return r.json()


async def create_local_post(access_token: str, location_name: str, content: str, photo_url: str = "") -> str:
    """Post an update to the Google Business Profile (shows on Google Maps)."""
    post: dict = {"summary": content, "callToAction": {"actionType": "LEARN_MORE"}}
    if photo_url:
        post["media"] = [{"mediaFormat": "PHOTO", "sourceUrl": photo_url}]
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{POSTS_API}/{location_name}/localPosts",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=post,
        )
        r.raise_for_status()
        return r.json().get("name", "")
