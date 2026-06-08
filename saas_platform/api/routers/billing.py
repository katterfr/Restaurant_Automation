from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.config import settings
from db.database import get_db

router = APIRouter(prefix="/billing", tags=["billing"])

PLANS = {
    "starter":    {"name": "Starter",    "price_monthly": 49,  "features": ["1 location", "Phone agent", "Inventory"]},
    "pro":        {"name": "Pro",         "price_monthly": 99,  "features": ["3 locations", "All Starter", "Ads automation", "Accounting"]},
    "enterprise": {"name": "Enterprise", "price_monthly": 249, "features": ["Unlimited locations", "All Pro", "Custom integrations", "Priority support"]},
}


@router.get("/plans")
async def list_plans():
    return PLANS


@router.get("/subscription/{tenant_id}")
async def get_subscription(tenant_id: int, db=Depends(get_db)):
    tenant = await db.fetchrow(
        "SELECT plan, status, stripe_customer_id FROM tenants WHERE id = $1", tenant_id
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    plan_key = tenant["plan"]
    return {
        "tenant_id":    tenant_id,
        "plan":         plan_key,
        "status":       tenant["status"],
        "plan_details": PLANS.get(plan_key, {}),
    }


class PlanUpgrade(BaseModel):
    plan: str


@router.post("/subscription/{tenant_id}/upgrade")
async def upgrade_plan(tenant_id: int, body: PlanUpgrade, db=Depends(get_db)):
    if body.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {body.plan}")
    await db.execute("UPDATE tenants SET plan = $1 WHERE id = $2", body.plan, tenant_id)
    return {"tenant_id": tenant_id, "plan": body.plan, "status": "updated"}
