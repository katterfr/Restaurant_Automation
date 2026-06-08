from fastapi import APIRouter, HTTPException, Depends
from db.database import get_db
from api.routers.auth import get_current_user

router = APIRouter(prefix="/features", tags=["features"])

ALL_FEATURES: dict[str, str] = {
    "ads":              "Social Media Advertising",
    "social_posts":     "Social Media Posts",
    "accounting":       "Accounting & Bookkeeping",
    "menu_management":  "Menu Management",
    "delivery":         "Delivery Integrations",
}


def _require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    return current_user


@router.get("/list")
async def list_features():
    return ALL_FEATURES


@router.get("/{tenant_id}")
async def get_tenant_features(tenant_id: int, db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT feature, enabled FROM tenant_features WHERE tenant_id = $1",
        tenant_id,
    )
    return {r["feature"]: r["enabled"] for r in rows}


@router.post("/{tenant_id}/{feature}")
async def toggle_feature(
    tenant_id: int,
    feature: str,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    if feature not in ALL_FEATURES:
        raise HTTPException(400, f"Unknown feature: {feature}")

    existing = await db.fetchrow(
        "SELECT enabled FROM tenant_features WHERE tenant_id=$1 AND feature=$2",
        tenant_id, feature,
    )
    if existing:
        new_state = not existing["enabled"]
        await db.execute(
            "UPDATE tenant_features SET enabled=$1, enabled_at=NOW() WHERE tenant_id=$2 AND feature=$3",
            new_state, tenant_id, feature,
        )
    else:
        new_state = True
        await db.execute(
            "INSERT INTO tenant_features (tenant_id, feature, enabled, enabled_at) VALUES ($1,$2,TRUE,NOW())",
            tenant_id, feature,
        )

    return {"feature": feature, "enabled": new_state}
