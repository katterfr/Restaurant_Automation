"""
cash_flow.py — Cash Flow Statement generator.
Produces Operating / Investing / Financing sections from the journal.
"""
from __future__ import annotations
import logging
from datetime import date
import aiosqlite

log = logging.getLogger(__name__)
DB_PATH = "restaurant.db"

# Maps account codes to CF section
OPERATING_REVENUE  = {"4000", "4100"}
OPERATING_EXPENSE  = {"5000", "5100", "5200", "5300", "5400", "5500", "5600"}
OPERATING_GAIN     = {"5700"}


async def get_cash_flow_statement(
    start_date: date,
    end_date: date,
    db_path: str = DB_PATH,
) -> dict:
    """
    Return a structured cash flow statement for the period.
    """
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        # Pull all journal lines in the period with account metadata
        async with db.execute("""
            SELECT a.code, a.name, a.type, a.normal,
                   SUM(l.debit)  AS total_debit,
                   SUM(l.credit) AS total_credit
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

    operating_inflows  = []
    operating_outflows = []
    other_items        = []

    for row in rows:
        code = row["code"]
        amount = net(row)
        item = {"account": code, "name": row["name"], "amount": amount}
        if code in OPERATING_REVENUE or code in OPERATING_GAIN:
            operating_inflows.append(item)
        elif code in OPERATING_EXPENSE:
            operating_outflows.append(item)
        else:
            other_items.append(item)

    total_inflow  = round(sum(i["amount"] for i in operating_inflows), 2)
    total_outflow = round(sum(i["amount"] for i in operating_outflows), 2)
    net_operating = round(total_inflow - total_outflow, 2)

    return {
        "period_start": start_date.isoformat(),
        "period_end":   end_date.isoformat(),
        "operating": {
            "inflows":  operating_inflows,
            "outflows": operating_outflows,
            "total_inflows":  total_inflow,
            "total_outflows": total_outflow,
            "net_operating":  net_operating,
        },
        "investing": {"items": [], "net_investing": 0.0},
        "financing": {"items": [], "net_financing": 0.0},
        "net_change_in_cash": net_operating,
    }
