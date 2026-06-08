"""
loss_gain.py — Inventory valuation: loss and gain on value (FIFO / weighted average).
Computes how inventory value changed due to price fluctuations and waste/shrinkage.
"""
from __future__ import annotations
import logging
from datetime import date
import aiosqlite

log = logging.getLogger(__name__)
DB_PATH = "restaurant.db"


async def get_loss_gain_summary(
    start_date: date,
    end_date: date,
    db_path: str = DB_PATH,
) -> dict:
    """
    Compare cost-basis of outgoing inventory vs actual COGS recorded.
    Returns gain/loss breakdown per item.
    """
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        # Outflows (sales, waste, adjustments) in period
        async with db.execute("""
            SELECT i.sku, i.name, i.cost_per_unit,
                   SUM(ABS(t.delta)) AS qty_out,
                   t.reason
            FROM inventory_transactions t
            JOIN items i ON i.id = t.item_id
            WHERE t.delta < 0
              AND t.created_at BETWEEN ? AND ?
            GROUP BY i.id, t.reason
        """, (
            f"{start_date.isoformat()} 00:00:00",
            f"{end_date.isoformat()} 23:59:59"
        )) as cur:
            outflows = [dict(r) for r in await cur.fetchall()]

        # Inflows (purchases/restocks) to compute weighted avg cost
        async with db.execute("""
            SELECT i.sku, SUM(t.delta) AS qty_in,
                   SUM(t.delta * i.cost_per_unit) AS value_in
            FROM inventory_transactions t
            JOIN items i ON i.id = t.item_id
            WHERE t.delta > 0
              AND t.reason IN ('purchase', 'restock')
              AND t.created_at BETWEEN ? AND ?
            GROUP BY i.sku
        """, (
            f"{start_date.isoformat()} 00:00:00",
            f"{end_date.isoformat()} 23:59:59"
        )) as cur:
            inflow_map = {r["sku"]: dict(r) for r in await cur.fetchall()}

    lines = []
    total_loss = 0.0
    total_gain = 0.0

    for out in outflows:
        sku           = out["sku"]
        cost_per_unit = float(out["cost_per_unit"])
        qty_out       = float(out["qty_out"])
        reason        = out["reason"]
        expected_cost = round(qty_out * cost_per_unit, 2)

        # For waste/shrinkage, the full cost is a loss
        if reason in ("waste", "shrinkage", "adjustment"):
            loss = expected_cost
            gain = 0.0
        else:
            loss = 0.0
            gain = 0.0

        lines.append({
            "sku":           sku,
            "name":          out["name"],
            "reason":        reason,
            "qty_out":       qty_out,
            "cost_per_unit": cost_per_unit,
            "expected_cost": expected_cost,
            "loss":          loss,
            "gain":          gain,
        })
        total_loss += loss
        total_gain += gain

    return {
        "period_start": start_date.isoformat(),
        "period_end":   end_date.isoformat(),
        "lines":        lines,
        "total_loss":   round(total_loss, 2),
        "total_gain":   round(total_gain, 2),
        "net":          round(total_gain - total_loss, 2),
    }
