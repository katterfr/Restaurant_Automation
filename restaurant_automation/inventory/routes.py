"""
inventory/routes.py — REST API endpoints for inventory management.
Mounts at /inventory/*
"""
from __future__ import annotations
from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from inventory.inventory_db import (
    get_all_items, get_item, upsert_item, adjust_qty,
    get_low_stock, get_transaction_history
)
from inventory.purchase_order import create_po, receive_po, get_all_pos

router = APIRouter(prefix="/inventory", tags=["inventory"])


class ItemUpsertRequest(BaseModel):
    sku: str
    name: str
    category: str = "general"
    unit: str = "each"
    qty_on_hand: float = 0
    reorder_level: float = 5
    cost_per_unit: float = 0
    sell_price: float = 0


class AdjustRequest(BaseModel):
    delta: float
    reason: str
    order_ref: str = ""
    note: str = ""


class PORequest(BaseModel):
    supplier: str
    line_items: list[dict]   # [{"sku": str, "qty": float, "unit_cost": float}]


@router.get("/")
async def list_items():
    return await get_all_items()


@router.get("/low-stock")
async def low_stock():
    return await get_low_stock()


@router.get("/transactions")
async def transactions(sku: Optional[str] = None, limit: int = 100):
    return await get_transaction_history(sku=sku, limit=limit)


@router.get("/{sku}")
async def get_one(sku: str):
    item = await get_item(sku)
    if not item:
        raise HTTPException(404, f"SKU not found: {sku}")
    return item


@router.post("/")
async def create_or_update_item(body: ItemUpsertRequest):
    await upsert_item(**body.model_dump())
    return await get_item(body.sku)


@router.post("/{sku}/adjust")
async def adjust_item(sku: str, body: AdjustRequest):
    try:
        return await adjust_qty(sku=sku, **body.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/purchase-orders/")
async def list_pos():
    return await get_all_pos()


@router.post("/purchase-orders/")
async def create_purchase_order(body: PORequest):
    try:
        return await create_po(supplier=body.supplier, line_items=body.line_items)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/purchase-orders/{po_number}/receive")
async def receive_purchase_order(po_number: str):
    try:
        return await receive_po(po_number)
    except ValueError as e:
        raise HTTPException(400, str(e))
