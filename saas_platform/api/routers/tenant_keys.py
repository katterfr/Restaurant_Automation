from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user
from core.encryption import encrypt_data, decrypt_data

router = APIRouter(prefix="/settings", tags=["settings"])

# Services owners can supply their own key for
ALLOWED_SERVICES = {
    "replicate": "Replicate (AI Creative Studio)",
    "vapi":      "VAPI (AI Phone Agent)",
}


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Owner access required")
    if not current_user.get("tenant_id"):
        raise HTTPException(403, "No restaurant linked to this account")
    return current_user


def _mask(key: str) -> str:
    if len(key) <= 8:
        return "••••••••"
    return key[:4] + "••••" + key[-4:]


@router.get("/api-keys")
async def list_api_keys(current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT service, api_key, updated_at FROM tenant_api_keys WHERE tenant_id=$1",
        current_user["tenant_id"],
    )
    return [
        {
            "service": r["service"],
            "label":   ALLOWED_SERVICES.get(r["service"], r["service"]),
            "masked":  _mask(decrypt_data(r["api_key"])),
            "updated_at": str(r["updated_at"]),
        }
        for r in rows
    ]


class SaveKeyBody(BaseModel):
    api_key: str


@router.post("/api-keys/{service}", status_code=200)
async def save_api_key(
    service: str,
    body: SaveKeyBody,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    if service not in ALLOWED_SERVICES:
        raise HTTPException(400, f"Unknown service '{service}'. Allowed: {', '.join(ALLOWED_SERVICES)}")
    key = body.api_key.strip()
    if not key:
        raise HTTPException(400, "API key cannot be empty")
    await db.execute(
        """INSERT INTO tenant_api_keys (tenant_id, service, api_key, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (tenant_id, service) DO UPDATE SET api_key=$3, updated_at=NOW()""",
        current_user["tenant_id"], service, encrypt_data(key),
    )
    return {"ok": True, "service": service, "masked": _mask(key)}


@router.delete("/api-keys/{service}", status_code=200)
async def delete_api_key(
    service: str,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    await db.execute(
        "DELETE FROM tenant_api_keys WHERE tenant_id=$1 AND service=$2",
        current_user["tenant_id"], service,
    )
    return {"ok": True}
