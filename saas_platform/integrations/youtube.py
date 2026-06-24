import os
from urllib.parse import urlencode
import httpx

OAUTH = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
YT_API = "https://www.googleapis.com/youtube/v3"
UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3"
GOOGLE_ADS_API = "https://googleads.googleapis.com/v17"

# Request both YouTube and Google Ads scopes so one OAuth covers both features
SCOPES = (
    "https://www.googleapis.com/auth/youtube.upload "
    "https://www.googleapis.com/auth/adwords"
)


def _client_id() -> str:
    return os.getenv("YOUTUBE_CLIENT_ID") or os.getenv("GOOGLE_CLIENT_ID", "")


def _client_secret() -> str:
    return os.getenv("YOUTUBE_CLIENT_SECRET") or os.getenv("GOOGLE_CLIENT_SECRET", "")


def is_configured() -> bool:
    return bool(_client_id() and _client_secret())


def oauth_start_url(redirect_uri: str, state: str) -> str:
    params = urlencode({
        "client_id": _client_id(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    })
    return f"{OAUTH}?{params}"


async def exchange_code(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(TOKEN_URL, data={
            "code": code,
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        r.raise_for_status()
        return r.json()  # {access_token, refresh_token, expires_in}


async def get_channel_id(access_token: str) -> str:
    """Return the authenticated user's YouTube channel ID."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{YT_API}/channels",
            params={"part": "id", "mine": "true"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        r.raise_for_status()
        items = r.json().get("items", [])
        return items[0]["id"] if items else ""


async def create_post(
    access_token: str,
    channel_id: str,
    content: str,
    video_url: str | None = None,
) -> str:
    """Download video from URL and upload it to YouTube. Returns the YouTube video ID."""
    if not video_url:
        raise ValueError("YouTube posting requires a video_url (mp4 link)")

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as dl_client:
        dl = await dl_client.get(video_url)
        dl.raise_for_status()
        video_bytes = dl.content
        content_type = dl.headers.get("content-type", "video/mp4")

    metadata = {
        "snippet": {
            "title": content[:100],
            "description": content,
            "categoryId": "22",  # People & Blogs
        },
        "status": {"privacyStatus": "public"},
    }

    async with httpx.AsyncClient(timeout=120) as c:
        # Initiate resumable upload session
        init_r = await c.post(
            f"{UPLOAD_API}/videos",
            params={"uploadType": "resumable", "part": "snippet,status"},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": content_type,
                "X-Upload-Content-Length": str(len(video_bytes)),
            },
            json=metadata,
        )
        init_r.raise_for_status()
        upload_url = init_r.headers["Location"]

        # Upload video bytes
        up_r = await c.put(
            upload_url,
            content=video_bytes,
            headers={"Content-Type": content_type},
        )
        up_r.raise_for_status()
        return up_r.json()["id"]


async def deploy_campaign(access_token: str, customer_id: str, campaign: dict) -> str:
    """Create a YouTube video ad campaign via the Google Ads API."""
    dev_token = os.getenv("GOOGLE_DEVELOPER_TOKEN", "")
    cid = customer_id.replace("-", "")
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": dev_token,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30) as c:
        budget_micros = int(float(campaign.get("budget_daily", 10)) * 1_000_000)
        r = await c.post(
            f"{GOOGLE_ADS_API}/customers/{cid}/campaignBudgets:mutate",
            headers=headers,
            json={"operations": [{"create": {
                "name": f"{campaign['headline']} YT Budget",
                "amountMicros": str(budget_micros),
                "deliveryMethod": "STANDARD",
            }}]},
        )
        r.raise_for_status()
        budget_resource = r.json()["results"][0]["resourceName"]

        camp_body: dict = {
            "name": campaign["headline"],
            "campaignBudget": budget_resource,
            "advertisingChannelType": "VIDEO",
            "status": "ENABLED",
            "networkSettings": {"targetYoutube": True},
        }
        if campaign.get("start_date"):
            camp_body["startDate"] = campaign["start_date"].replace("-", "")
        if campaign.get("end_date"):
            camp_body["endDate"] = campaign["end_date"].replace("-", "")

        r = await c.post(
            f"{GOOGLE_ADS_API}/customers/{cid}/campaigns:mutate",
            headers=headers,
            json={"operations": [{"create": camp_body}]},
        )
        r.raise_for_status()
        return r.json()["results"][0]["resourceName"]
