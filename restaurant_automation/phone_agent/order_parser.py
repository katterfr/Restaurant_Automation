"""
order_parser.py — Extract structured order from GPT-4o transcript.
Parses the ORDER_COMPLETE JSON block from the assistant's final reply.
"""
from __future__ import annotations
import json
import re
import logging
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger(__name__)


@dataclass
class OrderItem:
    name: str
    qty: int
    mods: str = ""
    price: float = 0.0

    def subtotal(self) -> float:
        return round(self.qty * self.price, 2)


@dataclass
class ParsedOrder:
    customer_name: str
    items: list[OrderItem]
    order_type: str          # "pickup" | "delivery"
    address: str = ""
    total: float = 0.0
    raw: dict = field(default_factory=dict)

    def recalculate_total(self) -> float:
        self.total = round(sum(i.subtotal() for i in self.items), 2)
        return self.total


def parse_order(assistant_reply: str) -> Optional[ParsedOrder]:
    """
    Extract the ORDER_COMPLETE JSON block from the assistant's final message.
    Returns ParsedOrder or None if parsing fails.
    """
    # Find everything after ORDER_COMPLETE keyword
    pattern = r"ORDER_COMPLETE\s*(\{.*\})"
    match = re.search(pattern, assistant_reply, re.DOTALL)
    if not match:
        log.warning("ORDER_COMPLETE marker not found in reply")
        return None

    try:
        raw = json.loads(match.group(1))
    except json.JSONDecodeError as e:
        log.error("Failed to parse order JSON: %s | raw=%s", e, match.group(1))
        return None

    items = [
        OrderItem(
            name=i.get("name", "Unknown"),
            qty=int(i.get("qty", 1)),
            mods=i.get("mods", ""),
            price=float(i.get("price", 0.0)),
        )
        for i in raw.get("items", [])
    ]

    order = ParsedOrder(
        customer_name=raw.get("customer_name", "Guest"),
        items=items,
        order_type=raw.get("order_type", "pickup"),
        address=raw.get("address", ""),
        total=float(raw.get("total", 0.0)),
        raw=raw,
    )

    if order.total == 0.0:
        order.recalculate_total()

    return order
