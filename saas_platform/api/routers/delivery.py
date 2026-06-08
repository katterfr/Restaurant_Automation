from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user

router = APIRouter(prefix="/delivery", tags=["delivery"])

PROVIDERS: dict[str, dict] = {
    "doordash":  {"name": "DoorDash",  "icon": "🔴", "apply_url": "https://developer.doordash.com"},
    "ubereats":  {"name": "Uber Eats", "icon": "🟢", "apply_url": "https://developer.uber.com/docs/eats"},
    "grubhub":   {"name": "Grubhub",   "icon": "🟠", "apply_url": "https://restaurant.grubhub.com"},
    "instacart": {"name": "Instacart", "icon": "🟤", "apply_url": "https://partner.instacart.com"},
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
            "connected": existing.get(p, {}).get("status") == "connected",
            "status":    existing.get(p, {}).get("status", "not_connected"),
            "store_id":  existing.get(p, {}).get("store_id"),
        }
        for p, info in PROVIDERS.items()
    }


class DeliveryConnect(BaseModel):
    api_key: str
    store_id: Optional[str] = None


@router.post("/connect/{provider}", status_code=201)
async def connect_provider(
    provider: str,
    body: DeliveryConnect,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)
    if provider not in PROVIDERS:
        raise HTTPException(400, "Unknown provider")
    await db.execute(
        """INSERT INTO delivery_connections (tenant_id, provider, status, api_key, store_id, connected_at)
           VALUES ($1,$2,'connected',$3,$4,NOW())
           ON CONFLICT (tenant_id, provider)
           DO UPDATE SET status='connected', api_key=$3, store_id=$4, connected_at=NOW()""",
        tid, provider, body.api_key, body.store_id,
    )
    return {"provider": provider, "status": "connected"}


@router.delete("/connect/{provider}", status_code=204)
async def disconnect_provider(provider: str, current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM delivery_connections WHERE tenant_id=$1 AND provider=$2",
        current_user["tenant_id"], provider,
    )
