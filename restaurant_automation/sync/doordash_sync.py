"""
sync/doordash_sync.py — DoorDash Drive API integration.
Handles menu sync and real-time item availability updates.
Docs: https://developer.doordash.com/en-US/docs/drive/
"""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
import httpx
import jwt
from orchestrator.config import settings

log = logging.getLogger(__name__)


def _build_jwt() -> str:
    """Build a signed JWT for DoorDash API authentication."""
    now = int(time.time())
    payload = {
        "aud":    "doordash",
        "iss":    settings.doordash_developer_id,
        "kid":    settings.doordash_key_id,
        "iat":    now,
        "exp":    now + 300,  # 5 min expiry
    }
    secret = base64.b64decode(settings.doordash_signing_secret or "")
    return jwt.encode(payload, secret, algorithm="HS256",
                      headers={"dd-ver": "DD-JWT-V1"})


def _headers() -> dict:
    return {
        "Authorization":  f"Bearer {_build_jwt()}",
        "Content-Type":   "application/json",
        "Accept":         "application/json",
    }


async def update_item_availability(
    sku: str,
    available: bool,
    store_id: str | None = None,
) -> bool:
    """
    Mark a menu item available or unavailable on DoorDash.
    Returns True on success.
    """
    if not all([settings.doordash_developer_id,
                settings.doordash_key_id,
                settings.doordash_signing_secret]):
        log.debug("DoorDash credentials not configured — skipping")
        return False

    sid = store_id or "default"
    url = (f"{settings.doordash_base_url}/developer/v1/"
           f"stores/{sid}/menus/items/{sku}/availability")
    payload = {"is_available": available}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.patch(url, json=payload, headers=_headers())
        if resp.status_code in (200, 204):
            log.info("DOORDASH SYNC | sku=%s | available=%s | ok", sku, available)
            return True
        log.warning("DOORDASH SYNC FAILED | sku=%s | status=%d | %s",
                    sku, resp.status_code, resp.text[:200])
        return False
    except httpx.RequestError as e:
        log.error("DOORDASH SYNC ERROR | sku=%s | %s", sku, e)
        return False


async def submit_delivery_quote(order: dict) -> dict | None:
    """
    Request a delivery quote from DoorDash Drive for a customer order.
    order: {"pickup_address": str, "dropoff_address": str, "items": [...]}
    Returns quote dict or None on failure.
    """
    if not settings.doordash_developer_id:
        return None

    url = f"{settings.doordash_base_url}/drive/v2/quotes"
    payload = {
        "external_delivery_id":  str(uuid.uuid4()),
        "pickup_address":        order.get("pickup_address", ""),
        "dropoff_address":       order.get("dropoff_address", ""),
        "order_value":           int(order.get("total", 0) * 100),  # cents
        "currency":              "USD",
        "items": [
            {"name": i["name"], "quantity": i["qty"],
             "external_id": i.get("sku", i["name"])}
            for i in order.get("items", [])
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(url, json=payload, headers=_headers())
        if resp.status_code == 200:
            return resp.json()
        log.warning("DOORDASH QUOTE FAILED | status=%d | %s",
                    resp.status_code, resp.text[:200])
        return None
    except httpx.RequestError as e:
        log.error("DOORDASH QUOTE ERROR | %s", e)
        return None


async def create_delivery(order: dict) -> dict | None:
    """
    Create a DoorDash Drive delivery for a confirmed order.
    Returns delivery dict (with tracking_url) or None.
    """
    if not settings.doordash_developer_id:
        return None

    url = f"{settings.doordash_base_url}/drive/v2/deliveries"
    payload = {
        "external_delivery_id": order.get("order_id", str(uuid.uuid4())),
        "pickup_address":       order.get("pickup_address", ""),
        "pickup_business_name": settings.restaurant_name,
        "dropoff_address":      order.get("address", ""),
        "dropoff_contact_given_name": order.get("customer_name", ""),
        "order_value":          int(order.get("total", 0) * 100),
        "currency":             "USD",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(url, json=payload, headers=_headers())
        if resp.status_code == 200:
            data = resp.json()
            log.info("DOORDASH DELIVERY CREATED | id=%s | tracking=%s",
                     data.get("external_delivery_id"), data.get("tracking_url"))
            return data
        log.warning("DOORDASH DELIVERY FAILED | %d | %s",
                    resp.status_code, resp.text[:200])
        return None
    except httpx.RequestError as e:
        log.error("DOORDASH DELIVERY ERROR | %s", e)
        return None
