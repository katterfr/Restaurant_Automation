"""
orchestrator/event_handlers.py — Central event handler registry.
Wires inventory, accounting, email alerts, and sync in response to bus events.

Order lifecycle:
  ORDER_RECEIVED  → deduct inventory → post sale → email confirmation → sync platforms
  ORDER_CANCELLED → restore inventory → reverse ledger → sync platforms
  ORDER_FAILED    → email failure alert
  INVENTORY_LOW   → email alert (throttled) + log
  voicemail       → email voicemail notification
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from orchestrator.bus import bus, Events
from orchestrator.config import settings

log = logging.getLogger(__name__)

# Throttle: track last alert time per SKU to avoid spamming
_last_low_stock_alert: dict[str, datetime] = {}


def register_handlers() -> None:
    """Call once at startup to bind all event handlers."""

    @bus.on(Events.ORDER_RECEIVED)
    async def handle_order_received(payload: dict) -> None:
        from inventory.inventory_db import adjust_qty, get_item
        from accounting.ledger import record_sale
        from sync.website_sync import push_menu_item
        from sync.doordash_sync import update_item_availability as dd_avail
        from sync.ubereats_sync import update_item_availability as ue_avail
        from notifications.email_alerts import send_order_confirmed, send_platform_sync_failure
        import json
        from pathlib import Path

        order_id = payload.get("order_id", "UNKNOWN")
        items    = payload.get("items", [])
        channel  = payload.get("channel", "unknown")
        log.info("ORDER_RECEIVED | #%s | channel=%s | %d items", order_id, channel, len(items))

        menu_path = Path("menu.json")
        menu: list[dict] = json.loads(menu_path.read_text()) if menu_path.exists() else []
        name_to_sku = {item["name"].lower(): item.get("sku") for item in menu}

        deducted: list[dict] = []
        failed = False
        fail_reason = ""

        for order_item in items:
            sku = order_item.get("sku") or name_to_sku.get(order_item["name"].lower())
            if not sku:
                log.warning("No SKU for '%s' — skipping inventory deduct", order_item["name"])
                continue

            qty = float(order_item.get("qty", 1))
            try:
                updated = await adjust_qty(
                    sku=sku, delta=-qty, reason="sale",
                    order_ref=order_id, note=order_item.get("mods", ""),
                )
                deducted.append({"sku": sku, "qty": qty, "item": updated})

                if updated["qty_on_hand"] <= 0:
                    log.warning("STOCK OUT | sku=%s — syncing unavailable to all platforms", sku)

                    # Sync availability — catch individual platform failures
                    try:
                        await push_menu_item({**updated, "available": False})
                    except Exception as e:
                        await send_platform_sync_failure("website", str(e))

                    try:
                        await dd_avail(sku, available=False)
                    except Exception as e:
                        await send_platform_sync_failure("doordash", str(e))

                    try:
                        await ue_avail(sku, available=False)
                    except Exception as e:
                        await send_platform_sync_failure("ubereats", str(e))

                    await bus.publish(Events.INVENTORY_LOW, {
                        **updated, "sku": sku, "qty": 0
                    })

            except ValueError as e:
                failed = True
                fail_reason = str(e)
                log.error("INVENTORY DEDUCT FAILED | order=%s | %s", order_id, e)
                break

        if failed:
            for d in deducted:
                await adjust_qty(
                    sku=d["sku"], delta=d["qty"], reason="adjustment",
                    order_ref=order_id, note=f"Rollback — {fail_reason}",
                )
            await bus.publish(Events.ORDER_FAILED, {
                "order_id": order_id, "reason": fail_reason, "channel": channel,
            })
            return

        total = float(payload.get("total", 0))
        cogs  = round(sum(
            d["qty"] * float(d["item"].get("cost_per_unit", 0))
            for d in deducted
        ), 2)
        await record_sale(order_id=order_id, revenue=total, cogs=cogs, channel=channel)

        # Forward order to SaaS platform for tenant portal visibility
        if settings.saas_api_url and settings.saas_tenant_id and settings.saas_api_key:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=5.0) as client:
                    await client.post(
                        f"{settings.saas_api_url}/orders/ingest",
                        json={
                            "tenant_id":    settings.saas_tenant_id,
                            "order_source": channel,
                            "order_id":     order_id,
                            "items":        payload.get("items", []),
                            "total":        total,
                            "order_type":   payload.get("order_type", "pickup"),
                            "customer_name": payload.get("customer_name"),
                            "address":      payload.get("address"),
                        },
                        headers={"X-Api-Key": settings.saas_api_key},
                    )
                log.info("ORDER forwarded to SaaS platform | #%s", order_id)
            except Exception as e:
                log.warning("Failed to forward order to SaaS platform: %s", e)

        await bus.publish(Events.ORDER_CONFIRMED, {
            "order_id":      order_id,
            "channel":       channel,
            "total":         total,
            "items":         [{"name": d["item"]["name"], "qty": d["qty"],
                               "price": d["item"]["sell_price"]} for d in deducted],
            "customer_name": payload.get("customer_name", "Guest"),
            "order_type":    payload.get("order_type", "pickup"),
            "address":       payload.get("address", ""),
        })
        log.info("ORDER_CONFIRMED | #%s | revenue=$%.2f | cogs=$%.2f", order_id, total, cogs)


    @bus.on(Events.ORDER_CONFIRMED)
    async def handle_order_confirmed(payload: dict) -> None:
        """Send confirmation email to restaurant owner."""
        from notifications.email_alerts import send_order_confirmed
        await send_order_confirmed(payload)


    @bus.on(Events.ORDER_FAILED)
    async def handle_order_failed(payload: dict) -> None:
        """Email failure alert when an order can't be fulfilled."""
        from notifications.email_alerts import send_order_failed
        order_id = payload.get("order_id", "UNKNOWN")
        reason   = payload.get("reason", "Unknown error")
        channel  = payload.get("channel", "unknown")
        log.error("ORDER_FAILED | #%s | %s", order_id, reason)
        await send_order_failed(order_id=order_id, reason=reason, channel=channel)


    @bus.on(Events.ORDER_CANCELLED)
    async def handle_order_cancelled(payload: dict) -> None:
        """Restore inventory and sync platforms when order is cancelled."""
        from inventory.inventory_db import adjust_qty, get_transaction_history
        from sync.website_sync import push_menu_item
        from sync.doordash_sync import update_item_availability as dd_avail
        from sync.ubereats_sync import update_item_availability as ue_avail

        order_id = payload.get("order_id", "UNKNOWN")
        log.info("ORDER_CANCELLED | #%s — restoring inventory", order_id)

        txns = await get_transaction_history()
        order_txns = [
            t for t in txns
            if t.get("order_ref") == order_id
            and t.get("delta", 0) < 0
            and t.get("reason") == "sale"
        ]

        for txn in order_txns:
            restored = await adjust_qty(
                sku=txn["sku"], delta=abs(txn["delta"]),
                reason="adjustment", order_ref=order_id,
                note="Order cancelled — inventory restored",
            )
            log.info("INVENTORY RESTORED | sku=%s | qty=%+.2f", txn["sku"], abs(txn["delta"]))

            if restored["qty_on_hand"] > 0:
                await push_menu_item({**restored, "available": True})
                await dd_avail(txn["sku"], available=True)
                await ue_avail(txn["sku"], available=True)

        await bus.publish(Events.INVENTORY_RESTOCKED, {
            "order_id": order_id, "txns": len(order_txns)
        })


    @bus.on(Events.INVENTORY_LOW)
    async def handle_inventory_low(payload: dict) -> None:
        """
        Throttled low-stock alert email.
        Sends at most once per SKU per COOLDOWN window (default 60 min).
        """
        from notifications.email_alerts import send_low_stock_alert
        from datetime import timedelta

        sku = payload.get("sku", "UNKNOWN")
        cooldown = settings.low_stock_alert_cooldown_minutes

        now = datetime.now(timezone.utc)
        last = _last_low_stock_alert.get(sku)
        if last and (now - last).total_seconds() < cooldown * 60:
            log.debug("LOW STOCK throttled | sku=%s | next alert in %.0f min",
                      sku, cooldown - (now - last).total_seconds() / 60)
            return

        log.warning("⚠️  LOW STOCK ALERT | sku=%s | qty=%.2f",
                    sku, payload.get("qty_on_hand", payload.get("qty", 0)))
        _last_low_stock_alert[sku] = now
        await send_low_stock_alert(payload)


    @bus.on("voicemail.received")
    async def handle_voicemail(payload: dict) -> None:
        """Email alert for after-hours voicemails."""
        from notifications.email_alerts import send_voicemail_alert
        log.info("📞 VOICEMAIL | from=%s | duration=%ds",
                 payload.get("from_number"), payload.get("duration_seconds", 0))
        await send_voicemail_alert(
            from_number=payload.get("from_number", "Unknown"),
            recording_url=payload.get("recording_url", ""),
            duration=payload.get("duration_seconds", 0),
        )


    @bus.on("po.received")
    async def handle_po_received(payload: dict) -> None:
        """Email confirmation when a PO is received and inventory restocked."""
        from notifications.email_alerts import send_po_received
        await send_po_received(payload)
