from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime
from db.database import get_db

router = APIRouter(prefix="/tenants", tags=["tenants"])


class TenantCreate(BaseModel):
    name: str
    slug: str
    plan: str = "starter"


class TenantOut(BaseModel):
    id: int
    name: str
    slug: str
    plan: str
    status: str
    created_at: datetime


_PLAN_PRICES = {"starter": 49, "pro": 99, "business": 149, "enterprise": 249}


@router.get("/stats")
async def get_stats(db=Depends(get_db)):
    rows = await db.fetch("SELECT plan, status FROM tenants")
    total = len(rows)
    active = sum(1 for r in rows if r["status"] == "active")
    mrr = sum(_PLAN_PRICES.get(r["plan"], 0) for r in rows if r["status"] == "active")
    plan_counts: dict = {}
    for r in rows:
        plan_counts[r["plan"]] = plan_counts.get(r["plan"], 0) + 1
    return {"total": total, "active": active, "mrr": mrr, "plans": plan_counts}


@router.get("/", response_model=list[TenantOut])
async def list_tenants(db=Depends(get_db)):
    rows = await db.fetch("SELECT * FROM tenants ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.post("/", response_model=TenantOut, status_code=201)
async def create_tenant(body: TenantCreate, db=Depends(get_db)):
    try:
        row = await db.fetchrow(
            "INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING *",
            body.name, body.slug, body.plan,
        )
        return dict(row)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(tenant_id: int, db=Depends(get_db)):
    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id = $1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return dict(tenant)


@router.delete("/{tenant_id}", status_code=204)
async def delete_tenant(tenant_id: int, db=Depends(get_db)):
    await db.execute("DELETE FROM tenants WHERE id = $1", tenant_id)
