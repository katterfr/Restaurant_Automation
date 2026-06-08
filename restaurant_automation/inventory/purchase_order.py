"""
purchase_order.py — Purchase Order creation, receiving, and tracking.
"""
from __future__ import annotations
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
import aiosqlite

from inventory.inventory_db import adjust_qty

log = logging.getLogger(__name__)
DB_PATH = "restaurant.db"


async def create_po(
    supplier: str,
    line_items: list[dict],   # [{"sku": "...", "qty": 10, "unit_cost": 2.50}, ...]
    db_path: str = DB_PATH,
) -> dict:
    """Create a new purchase order. Returns PO dict."""
    po_number   = f"PO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    total_cost  = round(sum(l["qty"] * l["unit_cost"] for l in line_items), 2)

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        async with db.execute("""
            INSERT INTO purchase_orders (po_number, supplier, total_cost)
            VALUES (?,?,?)
        """, (po_number, supplier, total_cost)) as cur:
            po_id = cur.lastrowid

        for line in line_items:
            # Resolve item_id from sku
            async with db.execute(
                "SELECT id FROM items WHERE sku=?", (line["sku"],)
            ) as cur:
                row = await cur.fetchone()
            if not row:
                raise ValueError(f"SKU not found: {line['sku']}")
            item_id = row["id"]

            await db.execute("""
                INSERT INTO po_line_items (po_id, item_id, qty, unit_cost)
                VALUES (?,?,?,?)
            """, (po_id, item_id, line["qty"], line["unit_cost"]))

        await db.commit()

    log.info("PO CREATED | %s | supplier=%s | total=$%.2f", po_number, supplier, total_cost)
    return {"id": po_id, "po_number": po_number, "supplier": supplier,
            "total_cost": total_cost, "status": "pending"}


async def receive_po(po_number: str, db_path: str = DB_PATH) -> dict:
    """
    Mark a PO as received and credit inventory for all line items.
    Returns updated PO dict.
    """
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        async with db.execute(
            "SELECT * FROM purchase_orders WHERE po_number=?", (po_number,)
        ) as cur:
            po = await cur.fetchone()

        if not po:
            raise ValueError(f"PO not found: {po_number}")
        if po["status"] == "received":
            raise ValueError(f"PO {po_number} already received")

        po = dict(po)
        po_id = po["id"]

        # Get line items with SKUs
        async with db.execute("""
            SELECT l.qty, l.unit_cost, i.sku
            FROM po_line_items l JOIN items i ON i.id = l.item_id
            WHERE l.po_id=?
        """, (po_id,)) as cur:
            lines = [dict(r) for r in await cur.fetchall()]

        # Update PO status
        received_at = datetime.now(timezone.utc).isoformat()
        await db.execute("""
            UPDATE purchase_orders SET status='received', received_at=?
            WHERE id=?
        """, (received_at, po_id))
        await db.commit()

    # Credit inventory for each line item
    for line in lines:
        await adjust_qty(
            sku=line["sku"],
            delta=float(line["qty"]),
            reason="purchase",
            order_ref=po_number,
            note=f"PO received — unit_cost ${line['unit_cost']}",
            db_path=db_path,
        )

    log.info("PO RECEIVED | %s | %d line items restocked", po_number, len(lines))
    po["status"] = "received"
    po["received_at"] = received_at
    return po


async def get_all_pos(db_path: str = DB_PATH) -> list[dict]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM purchase_orders ORDER BY ordered_at DESC"
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]
