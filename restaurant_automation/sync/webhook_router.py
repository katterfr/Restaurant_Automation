"""
sync/webhook_router.py — Inbound webhook receiver from third-party platforms.
Handles DoorDash status updates, Uber Eats order pushes, and website callbacks.
Mounts on FastAPI router at /webhooks/*
"""
from __future__ import annotations
import hashlib
import hmac
import json
import logging
from fastapi import APIRouter, Header, HTTPException, Request, Response
from orchestrator.config import settings
from orchestrator.bus import bus, Events

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
log = logging.getLogger(__name__)


def _verify_doordash_signature(body: bytes, signature: str) -> bool:
    """Verify DoorDash HMAC-SHA256 webhook signature."""
    if not settings.doordash_signing_secret:
        return True  # Skip in dev mode
    expected = hmac.new(
        settings.doordash_signing_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


# ── DoorDash ─────────────────────────────────────────────────────────────────

@router.post("/doordash")
async def doordash_webhook(request: Request,
                           x_doordash_signature: str = Header(default="")):
    body = await request.body()
    if not _verify_doordash_signature(body, x_doordash_signature):
        raise HTTPException(status_code=401, detail="Invalid DoorDash signature")

    data = json.loads(body)
    event_type = data.get("event_type", "")
    log.info("DOORDASH WEBHOOK | type=%s", event_type)

    if event_type == "DELIVERY_STATUS_UPDATE":
        delivery = data.get("delivery", {})
        status   = delivery.get("status", "")
        ext_id   = delivery.get("external_delivery_id", "")

        if status == "DELIVERED":
            await bus.publish(Events.ORDER_CONFIRMED, {
                "order_id": ext_id,
                "channel": "doordash",
                "status": "delivered",
            })
        elif status in ("FAILED", "CANCELLED"):
            await bus.publish(Events.ORDER_CANCELLED, {
                "order_id": ext_id,
                "channel": "doordash",
                "status": status.lower(),
            })

    return {"received": True}


# ── Uber Eats ────────────────────────────────────────────────────────────────

@router.post("/ubereats")
async def ubereats_webhook(request: Request):
    body = await request.body()
    data = json.loads(body)
    event_type = data.get("event_type", "")
    log.info("UBEREATS WEBHOOK | type=%s", event_type)

    if event_type == "orders.notification":
        order = data.get("data", {}).get("order", {})
        order_id = order.get("id", "")

        # Extract items
        items = []
        for item in order.get("cart", {}).get("items", []):
            items.append({
                "name":  item.get("title", ""),
                "qty":   item.get("quantity", 1),
                "price": item.get("price", {}).get("unit_price", {}).get("amount", 0) / 100,
            })

        total = order.get("payment", {}).get("charge_at_purchase", {}).get("amount", 0) / 100

        await bus.publish(Events.ORDER_RECEIVED, {
            "order_id":       order_id,
            "channel":        "ubereats",
            "customer_name":  order.get("eater", {}).get("first_name", "Guest"),
            "items":          items,
            "order_type":     "delivery",
            "address":        order.get("delivery", {}).get("location", {}).get("address", ""),
            "total":          total,
        })

    elif event_type == "orders.cancel":
        order_id = data.get("data", {}).get("order_id", "")
        await bus.publish(Events.ORDER_CANCELLED, {
            "order_id": order_id,
            "channel": "ubereats",
        })

    return {"received": True}


# ── Generic Website ──────────────────────────────────────────────────────────

@router.post("/website")
async def website_webhook(request: Request):
    """Generic webhook from restaurant website CMS/e-commerce platform."""
    body = await request.body()
    data = json.loads(body)
    event = data.get("event", "order.new")
    log.info("WEBSITE WEBHOOK | event=%s", event)

    if event == "order.new":
        await bus.publish(Events.ORDER_RECEIVED, {**data.get("order", {}), "channel": "website"})
    elif event in ("order.cancelled", "order.failed"):
        await bus.publish(Events.ORDER_CANCELLED, {**data.get("order", {}), "channel": "website"})

    return {"received": True}
