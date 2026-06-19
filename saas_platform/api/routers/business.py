import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from db.database import get_db
from api.routers.auth import get_current_user
from api.routers.ads import _sign_state, _parse_state
from core.config import settings
from integrations import google_business as gbp_api
from integrations import apple_maps as apple_api

log = logging.getLogger(__name__)
router = APIRouter(prefix="/business", tags=["business"])

GBP_PLATFORM = "google_business"


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Tenant access only")
    if not current_user.get("tenant_id"):
        raise HTTPException(403, "No tenant")
    return current_user


async def _check_feature(tenant_id: int, db) -> None:
    row = await db.fetchrow(
        """SELECT COUNT(*) as cnt FROM tenant_features
           WHERE tenant_id=$1 AND feature IN ('listings_google','listings_apple') AND enabled=TRUE""",
        tenant_id,
    )
    if not row or row["cnt"] == 0:
        raise HTTPException(403, "Business listings feature not enabled for this account")


def _callback_uri() -> str:
    return f"{settings.saas_api_url}/business/google/callback"


# ─── Status ──────────────────────────────────────────────────────────────────

@router.get("/status")
async def business_status(current_user=Depends(_require_owner), db=Depends(get_db)):
    await _check_feature(current_user["tenant_id"], db)
    tid = current_user["tenant_id"]

    gbp_conn = await db.fetchrow(
        "SELECT ad_account_id, connected_at FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
        tid, GBP_PLATFORM,
    )
    listing = await db.fetchrow("SELECT * FROM business_listings WHERE tenant_id=$1", tid)

    return {
        "google": {
            "configured": gbp_api.is_configured(),
            "connected": gbp_conn is not None,
            "account_id": gbp_conn["ad_account_id"] if gbp_conn else None,
            "location_id": listing["google_location_id"] if listing else None,
            "google_status": listing["google_status"] if listing else "not_connected",
            "connected_at": str(gbp_conn["connected_at"]) if gbp_conn else None,
        },
        "apple": {
            "configured": apple_api.is_configured(),
            "submitted": (listing["apple_status"] == "submitted") if listing else False,
            "apple_status": listing["apple_status"] if listing else "not_submitted",
            "portal_url": apple_api.BUSINESS_CONNECT_URL,
        },
    }


# ─── Business info ────────────────────────────────────────────────────────────

class BusinessInfo(BaseModel):
    name: str = ""
    description: str = ""
    phone: str = ""
    website: str = ""
    address_line1: str = ""
    city: str = ""
    state: str = ""
    zip: str = ""
    category: str = "restaurant"
    logo_url: str = ""
    hours: str = "{}"


@router.get("/info")
async def get_info(current_user=Depends(_require_owner), db=Depends(get_db)):
    await _check_feature(current_user["tenant_id"], db)
    row = await db.fetchrow("SELECT * FROM business_listings WHERE tenant_id=$1", current_user["tenant_id"])
    if not row:
        tenant = await db.fetchrow("SELECT name FROM tenants WHERE id=$1", current_user["tenant_id"])
        return {"name": tenant["name"] if tenant else "", "description": "", "phone": "", "website": "",
                "address_line1": "", "city": "", "state": "", "zip": "", "category": "restaurant",
                "logo_url": "", "hours": "{}",
                "google_status": "not_connected", "apple_status": "not_submitted",
                "google_location_id": None}
    return dict(row)


@router.put("/info")
async def save_info(body: BusinessInfo, current_user=Depends(_require_owner), db=Depends(get_db)):
    await _check_feature(current_user["tenant_id"], db)
    tid = current_user["tenant_id"]
    existing = await db.fetchrow("SELECT id FROM business_listings WHERE tenant_id=$1", tid)
    if existing:
        await db.execute(
            """UPDATE business_listings SET name=$2,description=$3,phone=$4,website=$5,
               address_line1=$6,city=$7,state=$8,zip=$9,category=$10,logo_url=$11,hours=$12,
               updated_at=NOW() WHERE tenant_id=$1""",
            tid, body.name, body.description, body.phone, body.website,
            body.address_line1, body.city, body.state, body.zip,
            body.category, body.logo_url, body.hours,
        )
    else:
        await db.execute(
            """INSERT INTO business_listings
               (tenant_id,name,description,phone,website,address_line1,city,state,zip,category,logo_url,hours)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
            tid, body.name, body.description, body.phone, body.website,
            body.address_line1, body.city, body.state, body.zip,
            body.category, body.logo_url, body.hours,
        )
    return {"ok": True}


# ─── Google Business Profile OAuth ───────────────────────────────────────────

@router.get("/google/connect-url")
async def google_connect_url(current_user=Depends(_require_owner), db=Depends(get_db)):
    await _check_feature(current_user["tenant_id"], db)
    if not gbp_api.is_configured():
        raise HTTPException(400, "Google credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Railway.")
    state = _sign_state(current_user["tenant_id"])
    return {"oauth_url": gbp_api.oauth_start_url(_callback_uri(), state)}


@router.get("/google/callback")
async def google_callback(code: str = Query(...), state: str = Query(...), db=Depends(get_db)):
    tenant_id = _parse_state(state)

    try:
        token_data = await gbp_api.exchange_code(code, _callback_uri())
    except Exception as e:
        log.error("Google Business OAuth failed: %s", e)
        raise HTTPException(400, f"OAuth failed: {e}")

    access_token = token_data.get("access_token", "")
    refresh_tok = token_data.get("refresh_token", "")

    # Fetch first GBP account to use as account_id
    account_id = ""
    try:
        accounts = await gbp_api.list_accounts(access_token)
        if accounts:
            account_id = accounts[0].get("name", "")
    except Exception as e:
        log.warning("Could not fetch GBP accounts: %s", e)

    await db.execute(
        """INSERT INTO platform_connections (tenant_id, platform, access_token, refresh_token, ad_account_id)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (tenant_id, platform)
           DO UPDATE SET access_token=$3, refresh_token=$4, ad_account_id=$5, connected_at=NOW()""",
        tenant_id, GBP_PLATFORM, access_token, refresh_tok, account_id,
    )

    tenant = await db.fetchrow("SELECT slug FROM tenants WHERE id=$1", tenant_id)
    slug = tenant["slug"] if tenant else ""
    return RedirectResponse(f"{settings.frontend_url}/portal/{slug}/business?connected=google")


@router.get("/google/locations")
async def list_locations(current_user=Depends(_require_owner), db=Depends(get_db)):
    await _check_feature(current_user["tenant_id"], db)
    conn = await db.fetchrow(
        "SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
        current_user["tenant_id"], GBP_PLATFORM,
    )
    if not conn:
        raise HTTPException(400, "Google Business Profile not connected")

    try:
        account_id = conn["ad_account_id"]
        if not account_id:
            accounts = await gbp_api.list_accounts(conn["access_token"])
            account_id = accounts[0]["name"] if accounts else ""
        locs = await gbp_api.list_locations(conn["access_token"], account_id)
        return {"locations": locs, "account_id": account_id}
    except Exception as e:
        raise HTTPException(400, f"Could not fetch locations: {e}")


@router.post("/google/sync")
async def sync_to_google(current_user=Depends(_require_owner), db=Depends(get_db)):
    """Create or update Google Business Profile location with stored business info."""
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)

    conn = await db.fetchrow(
        "SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2", tid, GBP_PLATFORM,
    )
    if not conn:
        raise HTTPException(400, "Google Business Profile not connected. Click Connect Google first.")

    listing = await db.fetchrow("SELECT * FROM business_listings WHERE tenant_id=$1", tid)
    if not listing:
        raise HTTPException(400, "Fill in your business information before syncing.")

    info = dict(listing)
    info["tenant_id"] = tid
    account_id = conn["ad_account_id"] or ""

    if not account_id:
        accounts = await gbp_api.list_accounts(conn["access_token"])
        account_id = accounts[0]["name"] if accounts else ""
        if account_id:
            await db.execute(
                "UPDATE platform_connections SET ad_account_id=$1 WHERE tenant_id=$2 AND platform=$3",
                account_id, tid, GBP_PLATFORM,
            )

    try:
        if listing["google_location_id"]:
            result = await gbp_api.update_location(conn["access_token"], listing["google_location_id"], {
                "title": listing["name"],
                "phoneNumbers": {"primaryPhone": listing["phone"]},
                "websiteUri": listing["website"],
                "profile": {"description": listing["description"]},
            })
            location_name = listing["google_location_id"]
        else:
            result = await gbp_api.create_location(conn["access_token"], account_id, info)
            location_name = result.get("name", "")
            await db.execute(
                "UPDATE business_listings SET google_location_id=$1, google_status='active', updated_at=NOW() WHERE tenant_id=$2",
                location_name, tid,
            )

        return {"ok": True, "location": result, "location_id": location_name}
    except Exception as e:
        log.error("GBP sync failed: %s", e)
        await db.execute(
            "UPDATE business_listings SET google_status='error', updated_at=NOW() WHERE tenant_id=$1", tid,
        )
        raise HTTPException(400, f"Google sync failed: {e}")


@router.delete("/google/disconnect")
async def google_disconnect(current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
        current_user["tenant_id"], GBP_PLATFORM,
    )
    await db.execute(
        "UPDATE business_listings SET google_status='not_connected', google_location_id=NULL WHERE tenant_id=$1",
        current_user["tenant_id"],
    )
    return {"ok": True}


# ─── Apple Maps ──────────────────────────────────────────────────────────────

@router.post("/apple/submit")
async def submit_apple(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)

    listing = await db.fetchrow("SELECT * FROM business_listings WHERE tenant_id=$1", tid)
    if not listing:
        raise HTTPException(400, "Fill in your business information before submitting to Apple Maps.")

    result = await apple_api.submit_business(dict(listing))

    if result["status"] in ("submitted", "not_configured"):
        new_status = "submitted" if result["status"] == "submitted" else "pending_manual"
        await db.execute(
            "UPDATE business_listings SET apple_status=$1, updated_at=NOW() WHERE tenant_id=$2",
            new_status, tid,
        )

    return result
