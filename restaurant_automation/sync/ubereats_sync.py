"""
sync/ubereats_sync.py — Uber Eats Orders API integration.
Handles menu item availability and inbound order webhooks.
Docs: https://developer.uber.com/docs/eats/introduction
"""
from __future__ import annotations
import logging
import httpx
from orchestrator.config import settings

log = logging.getLogger(__name__)

_TOKEN_CACHE: dict = {}


async def _get_access_token() -> str | None:
    """Fetch OAuth2 client_credentials token from Uber."""
    if not (settings.ubereats_client_id and settings.ubereats_client_secret):
        return None

    import time
    if _TOKEN_CACHE.get("expires_at", 0) > time.time() + 30:
        return _TOKEN_CACHE["token"]

    url = f"{settings.ubereats_base_url}/oauth/v2/token"
    data = {
        "client_id":     settings.ubereats_client_id,
        "client_secret": settings.ubereats_client_secret,
        "grant_type":    "client_credentials",
        "scope":         "eats.store eats.order",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, data=data)
        if resp.status_code == 200:
            body = resp.json()
            import time as t
            _TOKEN_CACHE["token"]      = body["access_token"]
            _TOKEN_CACHE["expires_at"] = t.time() + body.get("expires_in", 3600)
            return _TOKEN_CACHE["token"]
        log.warning("Uber token fetch failed: %d %s", resp.status_code, resp.text[:100])
        return None
    except httpx.RequestError as e:
        log.error("Uber token request error: %s", e)
        return None


async def _headers() -> dict | None:
    token = await _get_access_token()
    if not token:
        return None
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }


async def update_item_availability(sku: str, available: bool) -> bool:
    """Toggle item availability on Uber Eats menu."""
    headers = await _headers()
    if not headers or not settings.ubereats_store_id:
        log.debug("Uber Eats not configured — skipping")
        return False

    url = (f"{settings.ubereats_base_url}/v2/eats/stores/"
           f"{settings.ubereats_store_id}/menus/items")
    payload = {
        "items": [{"external_id": sku, "suspension_setting": {
            "suspend": not available,
            "suspend_until": None,
        }}]
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.patch(url, json=payload, headers=headers)
        if resp.status_code in (200, 204):
            log.info("UBEREATS SYNC | sku=%s | available=%s", sku, available)
            return True
        log.warning("UBEREATS SYNC FAILED | sku=%s | %d | %s",
                    sku, resp.status_code, resp.text[:200])
        return False
    except httpx.RequestError as e:
        log.error("UBEREATS SYNC ERROR | %s", e)
        return False


async def accept_order(order_id: str) -> bool:
    """Accept an inbound Uber Eats order."""
    headers = await _headers()
    if not headers or not settings.ubereats_store_id:
        return False

    url = (f"{settings.ubereats_base_url}/v2/eats/orders/{order_id}/accept_pos_order")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={}, headers=headers)
        if resp.status_code in (200, 204):
            log.info("UBEREATS ORDER ACCEPTED | %s", order_id)
            return True
        log.warning("UBEREATS ACCEPT FAILED | %s | %d", order_id, resp.status_code)
        return False
    except httpx.RequestError as e:
        log.error("UBEREATS ACCEPT ERROR | %s", e)
        return False


async def deny_order(order_id: str, reason: str = "out_of_stock") -> bool:
    """Deny an inbound Uber Eats order (e.g., when out of stock)."""
    headers = await _headers()
    if not headers:
        return False
    url = (f"{settings.ubereats_base_url}/v2/eats/orders/{order_id}/deny_pos_order")
    payload = {"reason": reason}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, headers=headers)
        return resp.status_code in (200, 204)
    except httpx.RequestError:
        return False
