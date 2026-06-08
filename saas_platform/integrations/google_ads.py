import os
import httpx

OAUTH = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ADS_API = "https://googleads.googleapis.com/v17"


def is_configured() -> bool:
    return bool(
        os.getenv("GOOGLE_CLIENT_ID")
        and os.getenv("GOOGLE_CLIENT_SECRET")
        and os.getenv("GOOGLE_DEVELOPER_TOKEN")
    )


def oauth_start_url(redirect_uri: str, state: str) -> str:
    return (
        f"{OAUTH}?client_id={os.getenv('GOOGLE_CLIENT_ID')}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=https://www.googleapis.com/auth/adwords"
        f"&state={state}&access_type=offline&prompt=consent"
    )


async def exchange_code(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(TOKEN_URL, data={
            "code": code,
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        r.raise_for_status()
        return r.json()  # {access_token, refresh_token, expires_in}


async def refresh_access_token(refresh_token: str) -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(TOKEN_URL, data={
            "refresh_token": refresh_token,
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "grant_type": "refresh_token",
        })
        r.raise_for_status()
        return r.json()["access_token"]


async def list_accessible_customers(access_token: str) -> list[str]:
    dev_token = os.getenv("GOOGLE_DEVELOPER_TOKEN", "")
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{ADS_API}/customers:listAccessibleCustomers",
            headers={"Authorization": f"Bearer {access_token}", "developer-token": dev_token},
        )
        r.raise_for_status()
        return r.json().get("resourceNames", [])


async def deploy_campaign(access_token: str, customer_id: str, campaign: dict) -> str:
    """Creates budget → campaign → ad group → responsive search ad. Returns resource name."""
    dev_token = os.getenv("GOOGLE_DEVELOPER_TOKEN", "")
    cid = customer_id.replace("-", "")
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": dev_token,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30) as c:
        # 1 — Shared budget
        budget_micros = int(float(campaign.get("budget_daily", 10)) * 1_000_000)
        r = await c.post(f"{ADS_API}/customers/{cid}/campaignBudgets:mutate", headers=headers, json={
            "operations": [{"create": {
                "name": f"{campaign['headline']} Budget",
                "amountMicros": str(budget_micros),
                "deliveryMethod": "STANDARD",
            }}],
        })
        r.raise_for_status()
        budget_resource = r.json()["results"][0]["resourceName"]

        # 2 — Campaign
        camp_body: dict = {
            "name": campaign["headline"],
            "campaignBudget": budget_resource,
            "advertisingChannelType": "SEARCH",
            "status": "ENABLED",
            "networkSettings": {
                "targetGoogleSearch": True,
                "targetSearchNetwork": True,
                "targetContentNetwork": False,
            },
        }
        if campaign.get("start_date"):
            camp_body["startDate"] = campaign["start_date"].replace("-", "")
        if campaign.get("end_date"):
            camp_body["endDate"] = campaign["end_date"].replace("-", "")

        r = await c.post(f"{ADS_API}/customers/{cid}/campaigns:mutate", headers=headers, json={
            "operations": [{"create": camp_body}],
        })
        r.raise_for_status()
        camp_resource = r.json()["results"][0]["resourceName"]

        # 3 — Ad Group
        r = await c.post(f"{ADS_API}/customers/{cid}/adGroups:mutate", headers=headers, json={
            "operations": [{"create": {
                "name": f"{campaign['headline']} – Group",
                "campaign": camp_resource,
                "type": "SEARCH_STANDARD",
                "status": "ENABLED",
                "cpcBidMicros": "1000000",
            }}],
        })
        r.raise_for_status()
        adgroup_resource = r.json()["results"][0]["resourceName"]

        # 4 — Responsive Search Ad (max 30 chars per headline, 90 per description)
        hl = campaign["headline"][:30]
        desc = (campaign.get("body", "") or campaign["headline"])[:90]
        r = await c.post(f"{ADS_API}/customers/{cid}/adGroupAds:mutate", headers=headers, json={
            "operations": [{"create": {
                "adGroup": adgroup_resource,
                "status": "ENABLED",
                "ad": {
                    "finalUrls": [campaign.get("destination_url", "")],
                    "responsiveSearchAd": {
                        "headlines": [{"text": hl}, {"text": "Order Now"}, {"text": "Visit Us Today"}],
                        "descriptions": [{"text": desc}, {"text": "Call us or order online!"}],
                    },
                },
            }}],
        })
        r.raise_for_status()
        return camp_resource
