from typing import Optional
from datetime import date as date_type
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user

router = APIRouter(prefix="/accounting", tags=["accounting"])

INCOME_CATS  = ["Sales", "Phone Orders", "Delivery", "Catering", "Other Income"]
EXPENSE_CATS = ["Food & Ingredients", "Labor", "Rent", "Utilities", "Equipment", "Marketing", "Packaging", "Other Expense"]


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Tenant access only")
    if not current_user.get("tenant_id"):
        raise HTTPException(403, "No tenant")
    return current_user


async def _check_feature(tenant_id: int, db) -> None:
    row = await db.fetchrow(
        "SELECT enabled FROM tenant_features WHERE tenant_id=$1 AND feature='accounting'",
        tenant_id,
    )
    if not row or not row["enabled"]:
        raise HTTPException(403, "Accounting feature not enabled for this account")


@router.get("/categories")
async def get_categories():
    return {"income": INCOME_CATS, "expense": EXPENSE_CATS}


@router.get("/summary")
async def get_summary(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)

    rows = await db.fetch(
        "SELECT type, category, amount, date FROM accounting_entries WHERE tenant_id=$1",
        tid,
    )
    today = date_type.today()
    month_start = today.replace(day=1)

    all_income  = sum(r["amount"] for r in rows if r["type"] == "income")
    all_expense = sum(r["amount"] for r in rows if r["type"] == "expense")
    mo_income   = sum(r["amount"] for r in rows if r["type"] == "income"  and r["date"] >= month_start)
    mo_expense  = sum(r["amount"] for r in rows if r["type"] == "expense" and r["date"] >= month_start)

    expense_by_cat: dict[str, float] = {}
    for r in rows:
        if r["type"] == "expense":
            expense_by_cat[r["category"]] = round(expense_by_cat.get(r["category"], 0) + r["amount"], 2)

    return {
        "month_income":       round(mo_income, 2),
        "month_expense":      round(mo_expense, 2),
        "month_profit":       round(mo_income - mo_expense, 2),
        "total_income":       round(all_income, 2),
        "total_expense":      round(all_expense, 2),
        "total_profit":       round(all_income - all_expense, 2),
        "expense_by_category": expense_by_cat,
    }


@router.get("/entries")
async def list_entries(
    type: Optional[str] = None,
    limit: int = 100,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)
    if type:
        rows = await db.fetch(
            "SELECT * FROM accounting_entries WHERE tenant_id=$1 AND type=$2 ORDER BY date DESC, created_at DESC LIMIT $3",
            tid, type, limit,
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM accounting_entries WHERE tenant_id=$1 ORDER BY date DESC, created_at DESC LIMIT $2",
            tid, limit,
        )
    return [dict(r) for r in rows]


class EntryCreate(BaseModel):
    type: str
    category: str
    amount: float
    description: Optional[str] = None
    date: Optional[str] = None


@router.post("/entries", status_code=201)
async def create_entry(body: EntryCreate, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_feature(tid, db)
    if body.type not in ("income", "expense"):
        raise HTTPException(400, "type must be 'income' or 'expense'")
    entry_date = body.date or str(date_type.today())
    row = await db.fetchrow(
        """INSERT INTO accounting_entries (tenant_id, type, category, amount, description, date)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *""",
        tid, body.type, body.category, body.amount, body.description, entry_date,
    )
    return dict(row)


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_entry(entry_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM accounting_entries WHERE id=$1 AND tenant_id=$2",
        entry_id, current_user["tenant_id"],
    )
