from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from core.config import settings
from db.database import get_db
import stripe

router = APIRouter(prefix="/billing", tags=["billing"])

PLANS = {
    "starter":    {"name": "Starter",    "price_monthly": 49,  "features": ["1 location", "Phone agent", "Inventory"]},
    "pro":        {"name": "Pro",         "price_monthly": 99,  "features": ["3 locations", "All Starter", "Ads automation", "Accounting"]},
    "business":   {"name": "Business",   "price_monthly": 149, "features": ["10 locations", "All Pro", "Priority support"]},
    "enterprise": {"name": "Enterprise", "price_monthly": 249, "features": ["Unlimited locations", "All Pro", "Custom integrations", "Priority support"]},
}


def _price_to_plan() -> dict[str, str]:
    """Return a mapping of Stripe price ID → plan name."""
    mapping: dict[str, str] = {}
    pairs = [
        (settings.stripe_starter_monthly_price_id, "starter"),
        (settings.stripe_starter_annual_price_id, "starter"),
        (settings.stripe_pro_monthly_price_id, "pro"),
        (settings.stripe_pro_annual_price_id, "pro"),
        (settings.stripe_business_monthly_price_id, "business"),
        (settings.stripe_business_annual_price_id, "business"),
        (settings.stripe_enterprise_monthly_price_id, "enterprise"),
        (settings.stripe_enterprise_annual_price_id, "enterprise"),
    ]
    for price_id, plan in pairs:
        if price_id:
            mapping[price_id] = plan
    return mapping


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


class CheckoutRequest(BaseModel):
    tenant_id: int
    price_id: str
    success_url: str
    cancel_url: str


@router.post("/checkout")
async def create_checkout_session(body: CheckoutRequest, db=Depends(get_db)):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    stripe.api_key = settings.stripe_secret_key

    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id = $1", body.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    customer_id = tenant["stripe_customer_id"]
    if not customer_id:
        customer = stripe.Customer.create(name=tenant["name"], metadata={"tenant_id": str(body.tenant_id)})
        customer_id = customer.id
        await db.execute(
            "UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2",
            customer_id, body.tenant_id,
        )

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": body.price_id, "quantity": 1}],
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        metadata={"tenant_id": str(body.tenant_id)},
    )
    return {"checkout_url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, db=Depends(get_db)):
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe webhook not configured")

    stripe.api_key = settings.stripe_secret_key
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except (stripe.error.SignatureVerificationError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    price_map = _price_to_plan()
    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        tenant_id = int(data.get("metadata", {}).get("tenant_id", 0))
        sub_id = data.get("subscription")
        customer_id = data.get("customer")
        if tenant_id and sub_id:
            await db.execute(
                "UPDATE tenants SET stripe_customer_id = $1, stripe_subscription_id = $2, status = 'active' WHERE id = $3",
                customer_id, sub_id, tenant_id,
            )

    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        customer_id = data.get("customer")
        tenant = await db.fetchrow("SELECT id FROM tenants WHERE stripe_customer_id = $1", customer_id)
        if tenant:
            price_id = data["items"]["data"][0]["price"]["id"] if data.get("items") else None
            plan = price_map.get(price_id, "starter") if price_id else "starter"
            status = "active" if data.get("status") == "active" else data.get("status", "active")
            await db.execute(
                "UPDATE tenants SET plan = $1, status = $2, stripe_subscription_id = $3 WHERE id = $4",
                plan, status, data["id"], tenant["id"],
            )

    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        tenant = await db.fetchrow("SELECT id FROM tenants WHERE stripe_customer_id = $1", customer_id)
        if tenant:
            await db.execute(
                "UPDATE tenants SET status = 'cancelled', stripe_subscription_id = NULL WHERE id = $1",
                tenant["id"],
            )

    elif event_type == "invoice.payment_failed":
        customer_id = data.get("customer")
        tenant = await db.fetchrow("SELECT id FROM tenants WHERE stripe_customer_id = $1", customer_id)
        if tenant:
            await db.execute(
                "UPDATE tenants SET status = 'past_due' WHERE id = $1",
                tenant["id"],
            )

    return {"received": True}
