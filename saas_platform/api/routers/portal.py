from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import date, timezone, datetime
from db.database import get_db
from api.routers.auth import get_current_user
from core.security import hash_password

router = APIRouter(prefix="/portal", tags=["portal"])


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Tenant access only")
    return current_user


def _require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


# ─── Features ─────────────────────────────────────────────────────────────────

@router.get("/features")
async def get_features(current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT feature FROM tenant_features WHERE tenant_id=$1 AND enabled=TRUE",
        current_user["tenant_id"],
    )
    return [r["feature"] for r in rows]


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def tenant_dashboard(current_user=Depends(_require_owner), db=Depends(get_db)):
    tenant_id = current_user["tenant_id"]
    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id = $1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    all_orders = await db.fetch(
        "SELECT * FROM tenant_orders WHERE tenant_id = $1 ORDER BY created_at DESC",
        tenant_id,
    )
    today_str = date.today().isoformat()
    today_orders  = [o for o in all_orders if str(o["created_at"])[:10] == today_str]
    today_revenue = sum(float(o["total"] or 0) for o in today_orders)
    total_revenue = sum(float(o["total"] or 0) for o in all_orders)

    menu_rows = await db.fetch(
        "SELECT COUNT(*) as cnt, COUNT(*) FILTER (WHERE available) as active FROM menu_items WHERE tenant_id = $1",
        tenant_id,
    )
    menu_row = dict(menu_rows[0]) if menu_rows else {"cnt": 0, "active": 0}

    features = await db.fetch(
        "SELECT feature FROM tenant_features WHERE tenant_id=$1 AND enabled=TRUE", tenant_id,
    )

    return {
        "tenant": {
            "id": tenant["id"], "name": tenant["name"],
            "plan": tenant["plan"], "status": tenant["status"],
        },
        "stats": {
            "today_orders":  len(today_orders),
            "today_revenue": round(today_revenue, 2),
            "total_orders":  len(all_orders),
            "total_revenue": round(total_revenue, 2),
            "menu_items":    menu_row["cnt"],
            "menu_active":   menu_row["active"],
        },
        "features": [r["feature"] for r in features],
        "recent_orders": [dict(o) for o in all_orders[:10]],
    }


# ─── Orders ───────────────────────────────────────────────────────────────────

@router.get("/orders")
async def portal_orders(limit: int = 50, current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM tenant_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2",
        current_user["tenant_id"], limit,
    )
    return [dict(r) for r in rows]


# ─── Menu (read for all owners) ───────────────────────────────────────────────

@router.get("/menu")
async def portal_menu(current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM menu_items WHERE tenant_id = $1 ORDER BY category, name",
        current_user["tenant_id"],
    )
    return [dict(r) for r in rows]


# ─── Menu management (write — requires menu_management feature) ───────────────

class MenuItemBody(BaseModel):
    name: str
    category: str = "other"
    price: float
    description: Optional[str] = None
    available: bool = True


async def _check_menu_feature(tenant_id: int, db) -> None:
    row = await db.fetchrow(
        "SELECT enabled FROM tenant_features WHERE tenant_id=$1 AND feature='menu_management'",
        tenant_id,
    )
    if not row or not row["enabled"]:
        raise HTTPException(403, "Menu management not enabled for this account")


@router.post("/menu", status_code=201)
async def add_menu_item(body: MenuItemBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_menu_feature(tid, db)
    row = await db.fetchrow(
        "INSERT INTO menu_items (tenant_id, name, category, price, description, available) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        tid, body.name, body.category, body.price, body.description, body.available,
    )
    return dict(row)


@router.put("/menu/{item_id}")
async def update_menu_item(item_id: int, body: MenuItemBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_menu_feature(tid, db)
    row = await db.fetchrow(
        """UPDATE menu_items SET name=$1, category=$2, price=$3, description=$4, available=$5, updated_at=NOW()
           WHERE id=$6 AND tenant_id=$7 RETURNING *""",
        body.name, body.category, body.price, body.description, body.available, item_id, tid,
    )
    if not row:
        raise HTTPException(404, "Item not found")
    return dict(row)


@router.delete("/menu/{item_id}", status_code=204)
async def delete_menu_item(item_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM menu_items WHERE id=$1 AND tenant_id=$2",
        item_id, current_user["tenant_id"],
    )


# ─── Owner account creation ───────────────────────────────────────────────────

class CreateOwnerRequest(BaseModel):
    email: str
    password: str


@router.post("/tenants/{tenant_id}/users", status_code=201)
async def create_owner_user(
    tenant_id: int,
    body: CreateOwnerRequest,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    tenant = await db.fetchrow("SELECT id FROM tenants WHERE id = $1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    existing = await db.fetchrow("SELECT id FROM users WHERE email = $1", body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    row = await db.fetchrow(
        """INSERT INTO users (email, password_hash, role, tenant_id)
           VALUES ($1, $2, 'owner', $3) RETURNING id, email, role, tenant_id, created_at""",
        body.email, hash_password(body.password), tenant_id,
    )
    return dict(row)
