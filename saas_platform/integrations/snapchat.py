import os
import httpx

OAUTH = "https://accounts.snapchat.com/login/oauth2/authorize"
TOKEN_URL = "https://accounts.snapchat.com/login/oauth2/access_token"
API = "https://adsapi.snapchat.com/v1"


def is_configured() -> bool:
    return bool(os.getenv("SNAPCHAT_CLIENT_ID") and os.getenv("SNAPCHAT_CLIENT_SECRET"))


def oauth_start_url(redirect_uri: str, state: str) -> str:
    return (
        f"{OAUTH}?client_id={os.getenv('SNAPCHAT_CLIENT_ID')}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=snapchat-marketing-api"
        f"&state={state}"
    )


async def exchange_code(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            TOKEN_URL,
            auth=(os.getenv("SNAPCHAT_CLIENT_ID", ""), os.getenv("SNAPCHAT_CLIENT_SECRET", "")),
            data={"code": code, "redirect_uri": redirect_uri, "grant_type": "authorization_code"},
        )
        r.raise_for_status()
        return r.json()


async def get_ad_accounts(access_token: str) -> list[dict]:
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{API}/me/organizations", headers=headers)
        r.raise_for_status()
        orgs = r.json().get("organizations", [])
        if not orgs:
            return []
        org_id = orgs[0]["organization"]["id"]
        r = await c.get(f"{API}/organizations/{org_id}/adaccounts", headers=headers)
        r.raise_for_status()
        return [a["adaccount"] for a in r.json().get("adaccounts", [])]


async def deploy_campaign(access_token: str, ad_account_id: str, campaign: dict) -> str:
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    budget_micro = int(float(campaign.get("budget_daily", 10)) * 1_000_000)

    async with httpx.AsyncClient(timeout=30) as c:
        # 1 — Campaign
        r = await c.post(f"{API}/adaccounts/{ad_account_id}/campaigns", headers=headers, json={
            "campaigns": [{"name": campaign["headline"], "ad_account_id": ad_account_id,
                           "status": "PAUSED", "objective": "BRAND_AWARENESS"}]
        })
        r.raise_for_status()
        camp_id = r.json()["campaigns"][0]["campaign"]["id"]

        # 2 — Ad Squad
        r = await c.post(f"{API}/adaccounts/{ad_account_id}/adsquads", headers=headers, json={
            "adsquads": [{"name": f"{campaign['headline']} Squad", "campaign_id": camp_id,
                          "type": "STANDARD", "billing_event": "IMPRESSION",
                          "bid_micro": 1_000_000, "daily_budget_micro": budget_micro,
                          "status": "PAUSED", "targeting": {"geos": [{"country_code": "US"}]}}]
        })
        r.raise_for_status()
        squad_id = r.json()["adsquads"][0]["adsquad"]["id"]

        # 3 — Creative
        r = await c.post(f"{API}/adaccounts/{ad_account_id}/creatives", headers=headers, json={
            "creatives": [{"name": campaign["headline"], "ad_account_id": ad_account_id,
                           "type": "SNAP_AD", "headline": campaign["headline"][:34],
                           "brand_name": campaign.get("brand", "Restaurant"), "call_to_action": "ORDER_NOW"}]
        })
        r.raise_for_status()
        creative_id = r.json()["creatives"][0]["creative"]["id"]

        # 4 — Ad
        r = await c.post(f"{API}/adaccounts/{ad_account_id}/ads", headers=headers, json={
            "ads": [{"name": campaign["headline"], "ad_account_id": ad_account_id,
                     "adsquad_id": squad_id, "creative_id": creative_id, "status": "PAUSED"}]
        })
        r.raise_for_status()
        return camp_id
