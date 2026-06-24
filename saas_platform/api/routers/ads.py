import base64
import hmac
import hashlib
import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel

from db.database import get_db
from api.routers.auth import get_current_user
from core.config import settings
from integrations import meta as meta_api
from integrations import google_ads as google_api
from integrations import tiktok as tiktok_api
from integrations import snapchat as snapchat_api
from integrations import pinterest as pinterest_api
from integrations import youtube as youtube_api

log = logging.getLogger(__name__)

router = APIRouter(prefix="/ads", tags=["ads"])

PLATFORMS = {
    "meta":      meta_api,
    "google":    google_api,
    "tiktok":    tiktok_api,
    "snapchat":  snapchat_api,
    "pinterest": pinterest_api,
    "youtube":   youtube_api,
}


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Tenant access only")
    if not current_user.get("tenant_id"):
        raise HTTPException(403, "No tenant associated with this account")
    return current_user


def _sign_state(tenant_id: int) -> str:
    sig = hmac.new(settings.secret_key.encode(), str(tenant_id).encode(), hashlib.sha256).hexdigest()[:16]
    return base64.urlsafe_b64encode(f"{tenant_id}:{sig}".encode()).decode()


def _parse_state(state: str) -> int:
    try:
        decoded = base64.urlsafe_b64decode(state.encode()).decode()
        tid_str, sig = decoded.rsplit(":", 1)
        expected = hmac.new(settings.secret_key.encode(), tid_str.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad sig")
        return int(tid_str)
    except Exception:
        raise HTTPException(400, "Invalid OAuth state")


def _callback_uri(platform: str) -> str:
    return f"{settings.saas_api_url}/ads/connect/{platform}/callback"


# ─── Platform status ──────────────────────────────────────────────────────────

@router.get("/status")
async def platform_status(current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT platform, ad_account_id, connected_at FROM platform_connections WHERE tenant_id = $1",
        current_user["tenant_id"],
    )
    connected = {r["platform"]: dict(r) for r in rows}
    return {
        p: {
            "configured": mod.is_configured(),
            "connected": p in connected,
            "ad_account_id": connected.get(p, {}).get("ad_account_id") or None,
            "connected_at": str(connected[p]["connected_at"]) if p in connected else None,
        }
        for p, mod in PLATFORMS.items()
    }


# ─── Connect URL (returned to frontend for window redirect) ───────────────────

@router.get("/connect/{platform}/url")
async def get_connect_url(platform: str, current_user=Depends(_require_owner)):
    state = _sign_state(current_user["tenant_id"])
    # TikTok content (organic posts) uses Login Kit OAuth
    if platform == "tiktok_content":
        if not tiktok_api.is_configured():
            raise HTTPException(400, "TikTok credentials not configured in Railway")
        return {"oauth_url": tiktok_api.content_oauth_url(_callback_uri(platform), state)}
    if platform not in PLATFORMS:
        raise HTTPException(404, "Unknown platform")
    mod = PLATFORMS[platform]
    if not mod.is_configured():
        raise HTTPException(400, f"{platform.title()} credentials not yet configured. Add the API keys in Railway.")
    return {"oauth_url": mod.oauth_start_url(_callback_uri(platform), state)}


# ─── OAuth callback (platform redirects here after user approves) ─────────────

@router.get("/connect/{platform}/callback")
async def oauth_callback(
    platform: str,
    code: str = Query(...),
    state: str = Query(...),
    db=Depends(get_db),
):
    # tiktok_content uses Login Kit OAuth, not business API
    if platform == "tiktok_content":
        tenant_id = _parse_state(state)
        try:
            token_data = await tiktok_api.content_exchange_code(code, _callback_uri(platform))
        except Exception as e:
            raise HTTPException(400, f"TikTok content OAuth failed: {e}")
        access_token = token_data.get("access_token", "")
        refresh_token = token_data.get("refresh_token", "")
        open_id = token_data.get("open_id", "")
        await db.execute(
            """INSERT INTO platform_connections (tenant_id, platform, access_token, refresh_token, ad_account_id)
               VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (tenant_id, platform)
               DO UPDATE SET access_token=$3, refresh_token=$4, ad_account_id=$5, connected_at=NOW()""",
            tenant_id, "tiktok_content", access_token, refresh_token, open_id,
        )
        tenant = await db.fetchrow("SELECT slug FROM tenants WHERE id=$1", tenant_id)
        slug = tenant["slug"] if tenant else ""
        return RedirectResponse(f"{settings.frontend_url}/portal/{slug}/social?connected=tiktok")

    if platform not in PLATFORMS:
        raise HTTPException(404, "Unknown platform")

    tenant_id = _parse_state(state)
    mod = PLATFORMS[platform]

    try:
        token_data = await mod.exchange_code(code, _callback_uri(platform))
    except Exception as e:
        log.error("OAuth exchange failed for %s: %s", platform, e)
        raise HTTPException(400, f"OAuth failed: {e}")

    access_token = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token") or ""
    ad_account_id = ""

    if platform == "meta":
        try:
            accounts = await meta_api.get_ad_accounts(access_token)
            if accounts:
                ad_account_id = accounts[0]["id"]
            # Also store first page ID for posting
            pages = await meta_api.get_pages(access_token)
            if pages:
                page = pages[0]
                page_id = page["id"]
                page_token = page.get("access_token", "")
                ig_id = await meta_api.get_ig_account_id(page_token, page_id)
                # Store page token + ig id in refresh_token/ad_account_id fields
                refresh_token = f"{page_id}:{page_token}:{ig_id or ''}"
        except Exception as e:
            log.warning("Could not fetch Meta ad accounts: %s", e)
    elif platform == "google":
        try:
            customers = await google_api.list_accessible_customers(access_token)
            if customers:
                ad_account_id = customers[0].split("/")[-1]
        except Exception as e:
            log.warning("Could not list Google customers: %s", e)
    elif platform == "tiktok":
        advertiser_ids = token_data.get("advertiser_ids", [])
        if advertiser_ids:
            ad_account_id = str(advertiser_ids[0])
    elif platform == "snapchat":
        try:
            accounts = await snapchat_api.get_ad_accounts(access_token)
            if accounts:
                ad_account_id = accounts[0]["id"]
        except Exception as e:
            log.warning("Could not fetch Snapchat ad accounts: %s", e)
    elif platform == "pinterest":
        try:
            accounts = await pinterest_api.get_ad_accounts(access_token)
            if accounts:
                ad_account_id = accounts[0]["id"]
        except Exception as e:
            log.warning("Could not fetch Pinterest ad accounts: %s", e)
    elif platform == "youtube":
        try:
            customers = await youtube_api.get_channel_id(access_token)
            if customers:
                ad_account_id = customers
        except Exception as e:
            log.warning("Could not fetch YouTube channel: %s", e)

    await db.execute(
        """INSERT INTO platform_connections (tenant_id, platform, access_token, refresh_token, ad_account_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tenant_id, platform)
           DO UPDATE SET access_token=$3, refresh_token=$4, ad_account_id=$5, connected_at=NOW()""",
        tenant_id, platform, access_token, refresh_token, ad_account_id,
    )

    tenant = await db.fetchrow("SELECT slug FROM tenants WHERE id = $1", tenant_id)
    slug = tenant["slug"] if tenant else ""
    return RedirectResponse(f"{settings.frontend_url}/portal/{slug}/ads?connected={platform}")


# ─── TikTok Webhook ──────────────────────────────────────────────────────────

@router.post("/webhook/tiktok")
async def tiktok_webhook(request: Request, db=Depends(get_db)):
    """Receives TikTok webhook events (post status, video processing, etc.)."""
    # TikTok signs webhooks with HMAC-SHA256 using the client secret
    raw_body = await request.body()

    client_secret = getattr(settings, "tiktok_client_secret", None)
    if client_secret:
        sig_header = request.headers.get("x-tiktok-signature") or request.headers.get("authorization", "")
        expected = hmac.new(client_secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if sig_header and not hmac.compare_digest(sig_header.lstrip("sha256="), expected):
            log.warning("TikTok webhook signature mismatch")
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = payload.get("event", payload.get("type", "unknown"))
    log.info("TikTok webhook event: %s | data: %s", event_type, str(payload)[:300])

    # Handle video/post status updates
    data = payload.get("data", {})
    publish_id = data.get("publish_id") or data.get("video_id")
    status     = data.get("status", "").lower()

    if publish_id and status:
        # Update the matching social_post record if we can find it
        await db.execute(
            """UPDATE social_posts
                  SET status = $1
                WHERE platform_results::text LIKE $2
                  AND status NOT IN ('failed', 'deleted')""",
            "published" if status in ("success", "published", "complete") else status,
            f"%{publish_id}%",
        )
        log.info("TikTok webhook: updated post status publish_id=%s -> %s", publish_id, status)

    # TikTok expects a 200 with challenge echo for URL verification
    challenge = payload.get("challenge")
    if challenge:
        return JSONResponse({"challenge": challenge})

    return {"ok": True}


# ─── Manual credentials (owner pastes their own tokens) ─────────────────────

class PlatformCredentials(BaseModel):
    access_token: str
    account_id: str
    page_id: Optional[str] = None     # Meta: Facebook Page ID
    extra_token: Optional[str] = None # Google: developer token override


@router.post("/credentials/{platform}", status_code=200)
async def save_platform_credentials(
    platform: str,
    body: PlatformCredentials,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    if platform not in PLATFORMS:
        raise HTTPException(404, "Unknown platform")
    if not body.access_token.strip() or not body.account_id.strip():
        raise HTTPException(400, "access_token and account_id are required")

    await db.execute(
        """INSERT INTO platform_connections
               (tenant_id, platform, access_token, refresh_token, ad_account_id, page_id)
           VALUES ($1, $2, $3, '', $4, $5)
           ON CONFLICT (tenant_id, platform)
           DO UPDATE SET
               access_token  = EXCLUDED.access_token,
               ad_account_id = EXCLUDED.ad_account_id,
               page_id       = EXCLUDED.page_id,
               connected_at  = NOW()""",
        current_user["tenant_id"], platform,
        body.access_token.strip(), body.account_id.strip(),
        (body.page_id or "").strip(),
    )
    return {"ok": True, "platform": platform}


@router.delete("/connect/{platform}", status_code=200)
async def disconnect_platform(
    platform: str,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    await db.execute(
        "DELETE FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
        current_user["tenant_id"], platform,
    )
    return {"ok": True}


# ─── Campaigns ────────────────────────────────────────────────────────────────

@router.get("/campaigns")
async def list_campaigns(current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM ad_campaigns WHERE tenant_id = $1 ORDER BY created_at DESC",
        current_user["tenant_id"],
    )
    return [dict(r) for r in rows]


class CampaignCreate(BaseModel):
    platforms: list[str]
    headline: str
    body: str
    image_url: Optional[str] = None
    destination_url: Optional[str] = None
    cta: str = "LEARN_MORE"
    budget_daily: float = 10.0
    location: Optional[str] = None
    radius_miles: int = 10
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@router.post("/campaigns", status_code=201)
async def create_campaigns(body: CampaignCreate, current_user=Depends(_require_owner), db=Depends(get_db)):
    tenant_id = current_user["tenant_id"]
    results = []

    for platform in body.platforms:
        if platform not in PLATFORMS:
            results.append({"platform": platform, "status": "error", "error": "Unknown platform"})
            continue

        mod = PLATFORMS[platform]
        base_insert = (
            "INSERT INTO ad_campaigns "
            "(tenant_id,platform,status,headline,body,image_url,destination_url,"
            "cta,budget_daily,location,radius_miles,start_date,end_date,error_message) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id"
        )
        args = [
            tenant_id, platform, "", body.headline, body.body, body.image_url,
            body.destination_url, body.cta, body.budget_daily, body.location,
            body.radius_miles, body.start_date, body.end_date,
        ]

        if not mod.is_configured():
            args[2] = "not_configured"
            args.append("Platform credentials not configured — add API keys in Railway")
            row = await db.fetchrow(base_insert, *args)
            results.append({"platform": platform, "status": "not_configured", "id": row["id"]})
            continue

        conn = await db.fetchrow(
            "SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
            tenant_id, platform,
        )
        if not conn:
            args[2] = "not_connected"
            args.append("Account not connected — click Connect in the Ads page")
            row = await db.fetchrow(base_insert, *args)
            results.append({"platform": platform, "status": "not_connected", "id": row["id"]})
            continue

        args[2] = "pending"
        args.append(None)
        row = await db.fetchrow(base_insert, *args)
        campaign_id = row["id"]

        campaign_data = body.model_dump()
        campaign_data["ad_account_id"] = conn["ad_account_id"]
        campaign_data["page_id"] = conn.get("page_id") or ""

        try:
            if platform == "meta":
                platform_id = await meta_api.deploy_campaign(conn["access_token"], conn["ad_account_id"], campaign_data)
            elif platform == "google":
                platform_id = await google_api.deploy_campaign(conn["access_token"], conn["ad_account_id"], campaign_data)
            elif platform == "youtube":
                platform_id = await youtube_api.deploy_campaign(conn["access_token"], conn["ad_account_id"], campaign_data)
            else:
                platform_id = await tiktok_api.deploy_campaign(conn["access_token"], conn["ad_account_id"], campaign_data)

            await db.execute(
                "UPDATE ad_campaigns SET status='active', platform_campaign_id=$1 WHERE id=$2",
                platform_id, campaign_id,
            )
            results.append({"platform": platform, "status": "active", "id": campaign_id})
        except Exception as e:
            log.error("Deploy failed [%s]: %s", platform, e)
            await db.execute(
                "UPDATE ad_campaigns SET status='failed', error_message=$1 WHERE id=$2",
                str(e)[:500], campaign_id,
            )
            results.append({"platform": platform, "status": "failed", "id": campaign_id, "error": str(e)[:200]})

    return results


@router.delete("/campaigns/{campaign_id}", status_code=204)
async def cancel_campaign(campaign_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "UPDATE ad_campaigns SET status='cancelled' WHERE id=$1 AND tenant_id=$2",
        campaign_id, current_user["tenant_id"],
    )
