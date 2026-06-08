from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from db.database import get_db

router = APIRouter(prefix="/menu", tags=["menu"])


class MenuItemCreate(BaseModel):
    name: str
    category: str = "other"
    price: float
    description: Optional[str] = None


class MenuItemUpdate(BaseModel):
    name: str
    category: str
    price: float
    description: Optional[str] = None
    available: bool = True


@router.get("/{tenant_id}")
async def list_menu(tenant_id: int, db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM menu_items WHERE tenant_id = $1 ORDER BY category, name",
        tenant_id,
    )
    return [dict(r) for r in rows]


@router.post("/{tenant_id}", status_code=201)
async def add_item(tenant_id: int, body: MenuItemCreate, db=Depends(get_db)):
    tenant = await db.fetchrow("SELECT id FROM tenants WHERE id = $1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    row = await db.fetchrow(
        "INSERT INTO menu_items (tenant_id, name, category, price, description) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        tenant_id, body.name, body.category, body.price, body.description,
    )
    return dict(row)


@router.put("/{tenant_id}/{item_id}")
async def update_item(tenant_id: int, item_id: int, body: MenuItemUpdate, db=Depends(get_db)):
    row = await db.fetchrow(
        """UPDATE menu_items
           SET name=$1, category=$2, price=$3, description=$4, available=$5, updated_at=NOW()
           WHERE id=$6 AND tenant_id=$7
           RETURNING *""",
        body.name, body.category, body.price, body.description, body.available,
        item_id, tenant_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return dict(row)


@router.delete("/{tenant_id}/{item_id}", status_code=204)
async def delete_item(tenant_id: int, item_id: int, db=Depends(get_db)):
    await db.execute(
        "DELETE FROM menu_items WHERE id=$1 AND tenant_id=$2",
        item_id, tenant_id,
    )
