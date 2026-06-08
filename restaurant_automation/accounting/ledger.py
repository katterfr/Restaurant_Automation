"""
ledger.py — Double-entry accounting ledger.
Every financial event creates a balanced debit/credit pair.

Account types: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
Normal balance: ASSET/EXPENSE = Debit, LIABILITY/EQUITY/REVENUE = Credit
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional
import aiosqlite

log = logging.getLogger(__name__)
DB_PATH = "restaurant.db"

DDL = """
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    code     TEXT UNIQUE NOT NULL,
    name     TEXT NOT NULL,
    type     TEXT NOT NULL,   -- ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE
    normal   TEXT NOT NULL    -- DEBIT|CREDIT
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date  TEXT NOT NULL,
    description TEXT NOT NULL,
    order_ref   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id   INTEGER NOT NULL REFERENCES journal_entries(id),
    account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
    debit      REAL NOT NULL DEFAULT 0,
    credit     REAL NOT NULL DEFAULT 0
);
"""

DEFAULT_ACCOUNTS = [
    ("1000", "Cash",                      "ASSET",     "DEBIT"),
    ("1100", "Accounts Receivable",        "ASSET",     "DEBIT"),
    ("1200", "Inventory Asset",            "ASSET",     "DEBIT"),
    ("2000", "Accounts Payable",           "LIABILITY", "CREDIT"),
    ("2100", "Sales Tax Payable",          "LIABILITY", "CREDIT"),
    ("3000", "Owner Equity",               "EQUITY",    "CREDIT"),
    ("4000", "Food & Beverage Revenue",    "REVENUE",   "CREDIT"),
    ("4100", "Delivery Revenue",           "REVENUE",   "CREDIT"),
    ("5000", "Cost of Goods Sold",         "EXPENSE",   "DEBIT"),
    ("5100", "Labor Cost",                 "EXPENSE",   "DEBIT"),
    ("5200", "Utilities",                  "EXPENSE",   "DEBIT"),
    ("5300", "Rent",                       "EXPENSE",   "DEBIT"),
    ("5400", "Marketing",                  "EXPENSE",   "DEBIT"),
    ("5500", "Waste / Shrinkage",          "EXPENSE",   "DEBIT"),
    ("5600", "Inventory Loss",             "EXPENSE",   "DEBIT"),
    ("5700", "Inventory Gain",             "REVENUE",   "CREDIT"),
]


async def init_ledger(db_path: str = DB_PATH) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(DDL)
        for code, name, acct_type, normal in DEFAULT_ACCOUNTS:
            await db.execute("""
                INSERT OR IGNORE INTO chart_of_accounts (code, name, type, normal)
                VALUES (?,?,?,?)
            """, (code, name, acct_type, normal))
        await db.commit()
    log.info("Ledger initialized")


async def _get_account_id(code: str, db: aiosqlite.Connection) -> int:
    async with db.execute(
        "SELECT id FROM chart_of_accounts WHERE code=?", (code,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise ValueError(f"Account code not found: {code}")
    return row[0]


async def post_entry(
    description: str,
    lines: list[dict],   # [{"account": "4000", "debit": 0, "credit": 10.00}, ...]
    entry_date: str | None = None,
    order_ref: str = "",
    db_path: str = DB_PATH,
) -> int:
    """
    Post a balanced journal entry.
    lines must balance: sum(debits) == sum(credits).
    Returns journal entry ID.
    """
    total_debit  = round(sum(l.get("debit",  0) for l in lines), 4)
    total_credit = round(sum(l.get("credit", 0) for l in lines), 4)
    if abs(total_debit - total_credit) > 0.01:
        raise ValueError(
            f"Unbalanced entry: debits={total_debit}, credits={total_credit}"
        )

    date_str = entry_date or datetime.now(timezone.utc).date().isoformat()

    async with aiosqlite.connect(db_path) as db:
        async with db.execute("""
            INSERT INTO journal_entries (entry_date, description, order_ref)
            VALUES (?,?,?)
        """, (date_str, description, order_ref)) as cur:
            entry_id = cur.lastrowid

        for line in lines:
            acct_id = await _get_account_id(line["account"], db)
            await db.execute("""
                INSERT INTO journal_lines (entry_id, account_id, debit, credit)
                VALUES (?,?,?,?)
            """, (entry_id, acct_id, line.get("debit", 0), line.get("credit", 0)))

        await db.commit()

    log.info("JOURNAL | id=%d | %s | ref=%s | dr=%.2f cr=%.2f",
             entry_id, description, order_ref, total_debit, total_credit)
    return entry_id


async def record_sale(
    order_id: str,
    revenue: float,
    cogs: float,
    channel: str = "phone",
    db_path: str = DB_PATH,
) -> None:
    """Record a completed sale: revenue + COGS entries."""
    revenue_acct = "4100" if channel == "delivery" else "4000"
    await post_entry(
        description=f"Sale - Order #{order_id} via {channel}",
        order_ref=order_id,
        lines=[
            {"account": "1000", "debit": revenue, "credit": 0},
            {"account": revenue_acct, "debit": 0, "credit": revenue},
        ],
        db_path=db_path,
    )
    if cogs > 0:
        await post_entry(
            description=f"COGS - Order #{order_id}",
            order_ref=order_id,
            lines=[
                {"account": "5000", "debit": cogs,  "credit": 0},
                {"account": "1200", "debit": 0,     "credit": cogs},
            ],
            db_path=db_path,
        )


async def record_inventory_adjustment(
    description: str,
    value: float,
    is_gain: bool,
    order_ref: str = "",
    db_path: str = DB_PATH,
) -> None:
    """Record inventory gain or loss."""
    if is_gain:
        lines = [
            {"account": "1200", "debit": value, "credit": 0},
            {"account": "5700", "debit": 0,     "credit": value},
        ]
    else:
        lines = [
            {"account": "5600", "debit": value, "credit": 0},
            {"account": "1200", "debit": 0,     "credit": value},
        ]
    await post_entry(description, lines, order_ref=order_ref, db_path=db_path)


async def get_account_balances(
    db_path: str = DB_PATH
) -> list[dict]:
    """Return current balance for every account."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT a.code, a.name, a.type, a.normal,
                   COALESCE(SUM(l.debit),0)  AS total_debit,
                   COALESCE(SUM(l.credit),0) AS total_credit
            FROM chart_of_accounts a
            LEFT JOIN journal_lines l ON l.account_id = a.id
            GROUP BY a.id ORDER BY a.code
        """) as cur:
            rows = [dict(r) for r in await cur.fetchall()]

    for r in rows:
        if r["normal"] == "DEBIT":
            r["balance"] = round(r["total_debit"] - r["total_credit"], 2)
        else:
            r["balance"] = round(r["total_credit"] - r["total_debit"], 2)
    return rows
