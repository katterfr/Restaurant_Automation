"""
pnl.py — Profit & Loss Statement generator.
Queries the journal for a date range and structures revenue/expense lines.
"""
from __future__ import annotations
import logging
from datetime import date
import aiosqlite

log = logging.getLogger(__name__)
DB_PATH = "restaurant.db"

REVENUE_CODES  = {"4000", "4100", "5700"}
COGS_CODES     = {"5000"}
EXPENSE_CODES  = {"5100", "5200", "5300", "5400", "5500", "5600"}


async def get_pnl_statement(
    start_date: date,
    end_date: date,
    db_path: str = DB_PATH,
) -> dict:
    """Return structured P&L dict for the period."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT a.code, a.name, a.type, a.normal,
                   COALESCE(SUM(l.debit),0)  AS total_debit,
                   COALESCE(SUM(l.credit),0) AS total_credit
            FROM journal_lines l
            JOIN journal_entries e ON e.id = l.entry_id
            JOIN chart_of_accounts a ON a.id = l.account_id
            WHERE e.entry_date BETWEEN ? AND ?
            GROUP BY a.id
        """, (start_date.isoformat(), end_date.isoformat())) as cur:
            rows = [dict(r) for r in await cur.fetchall()]

    def net(row: dict) -> float:
        if row["normal"] == "DEBIT":
            return round(row["total_debit"] - row["total_credit"], 2)
        return round(row["total_credit"] - row["total_debit"], 2)

    revenue_lines  = []
    cogs_lines     = []
    expense_lines  = []

    for row in rows:
        code   = row["code"]
        amount = net(row)
        item   = {"code": code, "name": row["name"], "amount": amount}
        if code in REVENUE_CODES:
            revenue_lines.append(item)
        elif code in COGS_CODES:
            cogs_lines.append(item)
        elif code in EXPENSE_CODES:
            expense_lines.append(item)

    total_revenue  = round(sum(r["amount"] for r in revenue_lines), 2)
    total_cogs     = round(sum(r["amount"] for r in cogs_lines), 2)
    gross_profit   = round(total_revenue - total_cogs, 2)
    total_opex     = round(sum(r["amount"] for r in expense_lines), 2)
    net_income     = round(gross_profit - total_opex, 2)
    gross_margin   = round(gross_profit / total_revenue, 4) if total_revenue else 0.0

    return {
        "period_start": start_date.isoformat(),
        "period_end":   end_date.isoformat(),
        "revenue_lines":  revenue_lines,
        "cogs_lines":     cogs_lines,
        "expense_lines":  expense_lines,
        "total_revenue":  total_revenue,
        "total_cogs":     total_cogs,
        "gross_profit":   gross_profit,
        "gross_margin":   gross_margin,
        "total_operating_expenses": total_opex,
        "net_income":     net_income,
    }
