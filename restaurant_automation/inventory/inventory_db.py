"""
inventory_db.py — SQLite-backed inventory store with async support.
Schema:
  items         — master inventory catalog
  transactions  — every debit/credit with reason and order reference
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional
import aiosqlite

log = logging.getLogger(__name__)

DB_PATH = "restaurant.db"


# ── Schema DDL ──────────────────────────────────────────────────────────────

DDL = """
CREATE TABLE IF NOT EXISTS items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sku           TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL DEFAULT 'general',
    unit          TEXT NOT NULL DEFAULT 'each',
    qty_on_hand   REAL NOT NULL DEFAULT 0,
    reorder_level REAL NOT NULL DEFAULT 5,
    cost_per_unit REAL NOT NULL DEFAULT 0,
    sell_price    REAL NOT NULL DEFAULT 0,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id    INTEGER NOT NULL REFERENCES items(id),
    delta      REAL NOT NULL,          -- positive=in, negative=out
    reason     TEXT NOT NULL,          -- 'sale', 'purchase', 'adjustment', 'waste'
    order_ref  TEXT,                   -- order_id or PO number
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number    TEXT UNIQUE NOT NULL,
    supplier     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',  -- pending/received/cancelled
    total_cost   REAL NOT NULL DEFAULT 0,
    ordered_at   TEXT NOT NULL DEFAULT (datetime('now')),
    received_at  TEXT
);

CREATE TABLE IF NOT EXISTS po_line_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id      INTEGER NOT NULL REFERENCES purchase_orders(id),
    item_id    INTEGER NOT NULL REFERENCES items(id),
    qty        REAL NOT NULL,
    unit_cost  REAL NOT NULL
);
"""


async def init_db(db_path: str = DB_PATH) -> None:
    """Create all tables if they don't exist."""
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(DDL)
        await db.commit()
    log.info("Inventory DB initialized at %s", db_path)


# ── Core Inventory Operations ────────────────────────────────────────────────

async def get_item(sku: str, db_path: str = DB_PATH) -> Optional[dict]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM items WHERE sku=?", (sku,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row else None


async def get_all_items(db_path: str = DB_PATH) -> list[dict]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM items ORDER BY category, name") as cur:
            return [dict(r) for r in await cur.fetchall()]


async def upsert_item(
    sku: str,
    name: str,
    category: str = "general",
    unit: str = "each",
    qty_on_hand: float = 0,
    reorder_level: float = 5,
    cost_per_unit: float = 0,
    sell_price: float = 0,
    db_path: str = DB_PATH,
) -> int:
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("""
            INSERT INTO items (sku, name, category, unit, qty_on_hand,
                               reorder_level, cost_per_unit, sell_price, updated_at)
            VALUES (?,?,?,?,?,?,?,?, datetime('now'))
            ON CONFLICT(sku) DO UPDATE SET
                name=excluded.name, category=excluded.category,
                unit=excluded.unit, qty_on_hand=excluded.qty_on_hand,
                reorder_level=excluded.reorder_level,
                cost_per_unit=excluded.cost_per_unit,
                sell_price=excluded.sell_price,
                updated_at=datetime('now')
        """, (sku, name, category, unit, qty_on_hand,
               reorder_level, cost_per_unit, sell_price)) as cur:
            await db.commit()
            return cur.lastrowid or 0


async def adjust_qty(
    sku: str,
    delta: float,
    reason: str,
    order_ref: str = "",
    note: str = "",
    db_path: str = DB_PATH,
) -> dict:
    """
    Atomically adjust item quantity.
    Returns updated item dict. Raises ValueError if insufficient stock.
    """
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        # Lock & read
        async with db.execute("SELECT * FROM items WHERE sku=?", (sku,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise ValueError(f"SKU not found: {sku}")

        item = dict(row)
        new_qty = item["qty_on_hand"] + delta

        if new_qty < 0:
            raise ValueError(
                f"Insufficient stock for {sku}: have {item['qty_on_hand']}, "
                f"need {abs(delta)}"
            )

        await db.execute(
            "UPDATE items SET qty_on_hand=?, updated_at=datetime('now') WHERE sku=?",
            (new_qty, sku)
        )
        await db.execute("""
            INSERT INTO inventory_transactions
                (item_id, delta, reason, order_ref, note)
            VALUES (?,?,?,?,?)
        """, (item["id"], delta, reason, order_ref, note))
        await db.commit()

        item["qty_on_hand"] = new_qty
        log.info("INVENTORY | sku=%s | delta=%+.2f | new_qty=%.2f | reason=%s",
                 sku, delta, new_qty, reason)
        return item


async def get_low_stock(db_path: str = DB_PATH) -> list[dict]:
    """Return items at or below their reorder level."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM items WHERE qty_on_hand <= reorder_level ORDER BY qty_on_hand"
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def get_transaction_history(
    sku: str | None = None,
    limit: int = 100,
    db_path: str = DB_PATH
) -> list[dict]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        if sku:
            async with db.execute("""
                SELECT t.*, i.sku, i.name FROM inventory_transactions t
                JOIN items i ON i.id = t.item_id
                WHERE i.sku=? ORDER BY t.created_at DESC LIMIT ?
            """, (sku, limit)) as cur:
                return [dict(r) for r in await cur.fetchall()]
        else:
            async with db.execute("""
                SELECT t.*, i.sku, i.name FROM inventory_transactions t
                JOIN items i ON i.id = t.item_id
                ORDER BY t.created_at DESC LIMIT ?
            """, (limit,)) as cur:
                return [dict(r) for r in await cur.fetchall()]
