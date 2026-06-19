from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user
from integrations import doordash as doordash_api
from integrations import ubereats as ubereats_api

router = APIRouter(prefix="/delivery", tags=["delivery"])

PROVIDERS: dict[str, dict] = {
    "doordash":  {"name": "DoorDash",  "verify_supported": True},
    "ubereats":  {"name": "Uber Eats", "verify_supported": True},
    "grubhub":   {"name": "Grubhub",   "verify_supported": False},
    "instacart": {"name": "Instacart", "verify_supported": False},
}


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Tenant access only")
    if not current_user.get("tenant_id"):
        raise HTTPException(403, "No tenant")
    return current_user


async def _check_feature(tenant_id: int, db) -> None:
    row = await db.fetchrow(
        "SELECT enabled FROM tenant_features WHERE tenant_id=$1 AND feature='delivery'",
        tenant_id,
    )
    if not row or not row["enabled"]:
        raise HTTPException(403, "Delivery feature not enabled for this account")


@router.get("/connections")
async def get_connections(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)
    rows = await db.fetch(
        "SELECT provider, status, store_id, connected_at FROM delivery_connections WHERE tenant_id=$1",
        tid,
    )
    existing = {r["provider"]: dict(r) for r in rows}
    return {
        p: {
            **info,
            "connected":        existing.get(p, {}).get("status") in ("connected", "linked"),
            "status":           existing.get(p, {}).get("status", "not_connected"),
            "store_id":         existing.get(p, {}).get("store_id"),
            "platform_ready":   _platform_ready(p),
        }
        for p, info in PROVIDERS.items()
    }


def _platform_ready(provider: str) -> bool:
    if provider == "doordash":
        return doordash_api.is_configured()
    if provider == "ubereats":
        return ubereats_api.is_configured()
    return False


class DeliveryConnect(BaseModel):
    store_id: str


@router.post("/verify/{provider}")
async def verify_provider(
    provider: str,
    body: DeliveryConnect,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)
    if provider not in PROVIDERS:
        raise HTTPException(400, "Unknown provider")

    store_id = body.store_id.strip()
    if not store_id:
        raise HTTPException(400, "Store ID is required")

    # Platforms that support live verification
    try:
        if provider == "doordash":
            await doordash_api.verify_store(store_id)
        elif provider == "ubereats":
            await ubereats_api.verify_store(store_id)
        else:
            # Grubhub / Instacart — no verification API, just store
            await db.execute(
                """INSERT INTO delivery_connections (tenant_id, provider, status, store_id, connected_at)
                   VALUES ($1,$2,'linked',$3,NOW())
                   ON CONFLICT (tenant_id, provider)
                   DO UPDATE SET status='linked', store_id=$3, connected_at=NOW()""",
                tid, provider, store_id,
            )
            return {"provider": provider, "status": "linked", "verified": False,
                    "message": "Store ID saved. Full integration activates once partnership is approved."}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Verification failed: {e}")

    await db.execute(
        """INSERT INTO delivery_connections (tenant_id, provider, status, store_id, connected_at)
           VALUES ($1,$2,'connected',$3,NOW())
           ON CONFLICT (tenant_id, provider)
           DO UPDATE SET status='connected', store_id=$3, connected_at=NOW()""",
        tid, provider, store_id,
    )
    return {"provider": provider, "status": "connected", "verified": True}


@router.delete("/connect/{provider}", status_code=204)
async def disconnect_provider(provider: str, current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM delivery_connections WHERE tenant_id=$1 AND provider=$2",
        current_user["tenant_id"], provider,
    )
