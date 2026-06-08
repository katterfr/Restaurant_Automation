"""
bus.py — Internal async event bus.
Uses asyncio queues locally and optionally Redis pub/sub for distributed deployments.

Events are plain dicts: {"event": "order.confirmed", "payload": {...}}

Usage:
    from orchestrator.bus import bus
    await bus.publish("inventory.updated", {"item_id": 1, "qty": 5})
    async for event in bus.subscribe("inventory.updated"):
        ...
"""
import asyncio
import json
import logging
from typing import AsyncIterator, Callable, Awaitable
from collections import defaultdict

log = logging.getLogger(__name__)


class EventBus:
    def __init__(self):
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._handlers: dict[str, list[Callable]] = defaultdict(list)

    async def publish(self, event: str, payload: dict) -> None:
        """Broadcast event to all queued subscribers and direct handlers."""
        message = {"event": event, "payload": payload}
        log.debug("BUS PUBLISH %s → %s", event, payload)

        # Direct async handlers
        for handler in self._handlers.get(event, []):
            asyncio.create_task(handler(payload))

        # Wildcard handlers
        for handler in self._handlers.get("*", []):
            asyncio.create_task(handler({"event": event, **payload}))

        # Queue-based subscribers
        for q in self._subscribers.get(event, []):
            await q.put(message)

    def on(self, event: str):
        """Decorator: register an async handler for an event."""
        def decorator(fn: Callable[..., Awaitable]):
            self._handlers[event].append(fn)
            return fn
        return decorator

    async def subscribe(self, event: str) -> AsyncIterator[dict]:
        """Async generator: yield events as they arrive."""
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers[event].append(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subscribers[event].remove(q)


bus = EventBus()


# ── Standard event names (constants) ────────────────────────────────────────
class Events:
    ORDER_RECEIVED      = "order.received"
    ORDER_CONFIRMED     = "order.confirmed"
    ORDER_FAILED        = "order.failed"
    ORDER_CANCELLED     = "order.cancelled"
    INVENTORY_DEDUCTED  = "inventory.deducted"
    INVENTORY_RESTOCKED = "inventory.restocked"
    INVENTORY_LOW       = "inventory.low"
    ACCOUNTING_ENTRY    = "accounting.entry"
    SYNC_NEEDED         = "sync.needed"
    REPORT_READY        = "report.ready"
