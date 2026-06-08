import base64
import os
import httpx

OAUTH = "https://www.pinterest.com/oauth/"
TOKEN_URL = "https://api.pinterest.com/v5/oauth/token"
API = "https://api.pinterest.com/v5"


def is_configured() -> bool:
    return bool(os.getenv("PINTEREST_APP_ID") and os.getenv("PINTEREST_APP_SECRET"))


def oauth_start_url(redirect_uri: str, state: str) -> str:
    return (
        f"{OAUTH}?client_id={os.getenv('PINTEREST_APP_ID')}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=ads:read,ads:write,pins:read,pins:write,boards:read"
        f"&state={state}"
    )


def _auth_header() -> str:
    creds = base64.b64encode(
        f"{os.getenv('PINTEREST_APP_ID')}:{os.getenv('PINTEREST_APP_SECRET')}".encode()
    ).decode()
    return f"Basic {creds}"


async def exchange_code(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(TOKEN_URL,
            headers={"Authorization": _auth_header(), "Content-Type": "application/x-www-form-urlencoded"},
            data={"code": code, "redirect_uri": redirect_uri, "grant_type": "authorization_code"},
        )
        r.raise_for_status()
        return r.json()


async def get_ad_accounts(access_token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{API}/ad_accounts", headers={"Authorization": f"Bearer {access_token}"})
        r.raise_for_status()
        return r.json().get("items", [])


async def deploy_campaign(access_token: str, ad_account_id: str, campaign: dict) -> str:
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    budget_micro = int(float(campaign.get("budget_daily", 10)) * 1_000_000)

    async with httpx.AsyncClient(timeout=30) as c:
        # 1 — Campaign
        r = await c.post(f"{API}/ad_accounts/{ad_account_id}/campaigns", headers=headers, json={
            "name": campaign["headline"], "objective_type": "AWARENESS",
            "status": "ACTIVE", "daily_spend_cap": budget_micro,
        })
        r.raise_for_status()
        camp_id = r.json()["id"]

        # 2 — Ad Group
        r = await c.post(f"{API}/ad_accounts/{ad_account_id}/ad_groups", headers=headers, json={
            "name": f"{campaign['headline']} Group", "campaign_id": camp_id,
            "status": "ACTIVE", "budget_type": "DAILY",
            "budget_in_micro_currency": budget_micro, "pacing_delivery_type": "STANDARD",
            "targeting_spec": {"GEO": ["US"]},
        })
        r.raise_for_status()
        group_id = r.json()["id"]

        # 3 — Ad (uses an existing pin; if image_url provided, create a pin first)
        pin_id = None
        if campaign.get("image_url"):
            r = await c.post(f"{API}/pins", headers=headers, json={
                "title": campaign["headline"], "description": campaign.get("body", ""),
                "link": campaign.get("destination_url", ""),
                "media_source": {"source_type": "image_url", "url": campaign["image_url"]},
            })
            if r.is_success:
                pin_id = r.json().get("id")

        ad_body: dict = {"name": campaign["headline"], "ad_group_id": group_id, "status": "ACTIVE", "creative_type": "REGULAR"}
        if pin_id:
            ad_body["pin_id"] = pin_id

        r = await c.post(f"{API}/ad_accounts/{ad_account_id}/ads", headers=headers, json=ad_body)
        r.raise_for_status()
        return camp_id
