import json
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from db.database import get_db
from core.config import settings

router = APIRouter(prefix="/orders", tags=["orders"])


class OrderItem(BaseModel):
    name: str
    qty: float
    price: Optional[float] = None
    mods: Optional[str] = None


class OrderIngest(BaseModel):
    tenant_id: int
    order_source: str = "phone"
    order_id: str
    items: list[OrderItem] = []
    total: float = 0.0
    order_type: Optional[str] = "pickup"
    customer_name: Optional[str] = None
    address: Optional[str] = None


def _require_api_key(x_api_key: str = Header(default="")):
    if not settings.api_admin_secret or x_api_key != settings.api_admin_secret:
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.post("/ingest", status_code=201, dependencies=[Depends(_require_api_key)])
async def ingest_order(order: OrderIngest, db=Depends(get_db)):
    notes = f"Customer: {order.customer_name}" if order.customer_name else None
    if order.address:
        notes = f"{notes} | Address: {order.address}" if notes else f"Address: {order.address}"

    row = await db.fetchrow(
        """INSERT INTO tenant_orders
             (tenant_id, order_source, external_order_id, status, items, total, notes)
           VALUES ($1, $2, $3, 'confirmed', $4, $5, $6)
           RETURNING *""",
        order.tenant_id,
        order.order_source,
        order.order_id,
        json.dumps([i.model_dump() for i in order.items]),
        order.total,
        notes,
    )
    return dict(row)


@router.get("/{tenant_id}")
async def list_orders(tenant_id: int, limit: int = 50, db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM tenant_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2",
        tenant_id, limit,
    )
    return [dict(r) for r in rows]
