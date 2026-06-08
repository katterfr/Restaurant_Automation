"""
sync/website_sync.py — Push menu and inventory updates to the restaurant's website via REST API.
Supports generic REST endpoints (WordPress WooCommerce, custom CMS, Squarespace, etc.)
Configure WEBSITE_API_URL and WEBSITE_API_KEY in .env
"""
from __future__ import annotations
import logging
import httpx
from orchestrator.config import settings

log = logging.getLogger(__name__)

HEADERS = lambda: {
    "Authorization": f"Bearer {settings.website_api_key}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}


async def push_menu_item(item: dict) -> bool:
    """
    Push a single menu/inventory item to the website.
    item: {"sku": str, "name": str, "sell_price": float, "qty_on_hand": float, "available": bool}
    Returns True on success.
    """
    if not settings.website_api_url:
        log.debug("WEBSITE_API_URL not configured — skipping website sync")
        return False

    url = f"{settings.website_api_url.rstrip('/')}/products/{item['sku']}"
    payload = {
        "sku":        item["sku"],
        "name":       item["name"],
        "price":      item["sell_price"],
        "stock":      max(0, int(item["qty_on_hand"])),
        "in_stock":   item["qty_on_hand"] > 0,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.put(url, json=payload, headers=HEADERS())
        if resp.status_code in (200, 201, 204):
            log.info("WEBSITE SYNC | sku=%s | status=%d", item["sku"], resp.status_code)
            return True
        log.warning("WEBSITE SYNC FAILED | sku=%s | status=%d | body=%s",
                    item["sku"], resp.status_code, resp.text[:200])
        return False
    except httpx.RequestError as e:
        log.error("WEBSITE SYNC ERROR | sku=%s | %s", item["sku"], e)
        return False


async def push_full_menu(items: list[dict]) -> dict:
    """Push all items to the website. Returns {success: int, failed: int}."""
    success, failed = 0, 0
    for item in items:
        ok = await push_menu_item(item)
        if ok:
            success += 1
        else:
            failed += 1
    log.info("WEBSITE FULL SYNC | success=%d | failed=%d", success, failed)
    return {"success": success, "failed": failed}


async def mark_item_unavailable(sku: str) -> bool:
    """Mark item as out-of-stock on website."""
    return await push_menu_item({
        "sku": sku, "name": sku, "sell_price": 0,
        "qty_on_hand": 0, "available": False
    })
