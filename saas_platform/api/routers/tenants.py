import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from db.database import get_db
from api.routers.public import provision_plan_features

SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9\-]{0,62}$')

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


@router.get("/analytics")
async def get_analytics(db=Depends(get_db)):
    # Monthly tenant growth — last 6 complete months + current
    growth_rows = await db.fetch(
        """SELECT to_char(date_trunc('month', created_at), 'Mon') AS month,
                  date_trunc('month', created_at) AS month_date,
                  COUNT(*) AS count
           FROM tenants
           WHERE created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
           GROUP BY month_date
           ORDER BY month_date""",
    )
    # Fill gaps so every month in the 6-month window is represented
    today = date.today()
    month_map = {str(r["month_date"])[:7]: {"month": r["month"], "count": int(r["count"])} for r in growth_rows}
    growth = []
    for i in range(5, -1, -1):
        d  = (today.replace(day=1) - timedelta(days=1) * i * 30)
        mo = date(d.year, d.month, 1)
        key = str(mo)[:7]
        growth.append({"month": mo.strftime("%b"), "count": month_map.get(key, {"count": 0})["count"]})

    # Plan distribution (all tenants)
    plan_rows = await db.fetch("SELECT plan, COUNT(*) AS count FROM tenants GROUP BY plan ORDER BY count DESC")

    # MRR trend — monthly revenue estimate for last 6 months
    _plan_prices = {"starter": 49, "pro": 99, "business": 149, "enterprise": 249}
    mrr_rows = await db.fetch(
        """SELECT to_char(date_trunc('month', created_at), 'Mon') AS month,
                  date_trunc('month', created_at) AS month_date,
                  plan
           FROM tenants WHERE status='active'
           ORDER BY month_date""",
    )
    # Build running MRR snapshot per month (cumulative active tenants * price)
    # Simplified: just return current plan distribution with prices
    plan_dist = [{"plan": r["plan"], "count": int(r["count"]),
                  "mrr": _plan_prices.get(r["plan"], 0) * int(r["count"])} for r in plan_rows]

    return {"growth": growth, "plan_distribution": plan_dist}


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


@router.get("/public/{slug}")
async def get_tenant_public(slug: str, db=Depends(get_db)):
    row = await db.fetchrow(
        "SELECT id, name, slug, status FROM tenants WHERE slug = $1", slug
    )
    if not row:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return dict(row)


@router.get("/", response_model=list[TenantOut])
async def list_tenants(db=Depends(get_db)):
    rows = await db.fetch("SELECT * FROM tenants ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.post("/", response_model=TenantOut, status_code=201)
async def create_tenant(body: TenantCreate, db=Depends(get_db)):
    if not SLUG_RE.match(body.slug):
        raise HTTPException(status_code=400, detail="Slug must be lowercase letters, numbers, and hyphens only (no spaces or slashes)")
    try:
        row = await db.fetchrow(
            "INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING *",
            body.name, body.slug, body.plan,
        )
        return dict(row)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class TenantPatch(BaseModel):
    name: str | None = None
    slug: str | None = None
    status: str | None = None
    plan: str | None = None


@router.patch("/{tenant_id}", response_model=TenantOut)
async def patch_tenant(tenant_id: int, body: TenantPatch, db=Depends(get_db)):
    if body.slug is not None and not SLUG_RE.match(body.slug):
        raise HTTPException(status_code=400, detail="Slug must be lowercase letters, numbers, and hyphens only")
    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id = $1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    sets, vals = [], []
    if body.name is not None:
        sets.append(f"name=${len(vals)+2}"); vals.append(body.name)
    if body.slug is not None:
        sets.append(f"slug=${len(vals)+2}"); vals.append(body.slug)
    if body.status is not None:
        sets.append(f"status=${len(vals)+2}"); vals.append(body.status)
    if body.plan is not None:
        sets.append(f"plan=${len(vals)+2}"); vals.append(body.plan)
    if not sets:
        return dict(tenant)
    try:
        row = await db.fetchrow(
            f"UPDATE tenants SET {', '.join(sets)} WHERE id=$1 RETURNING *",
            tenant_id, *vals,
        )
        if body.plan is not None:
            await provision_plan_features(tenant_id, body.plan, db)
        return dict(row)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{tenant_id}/sync-features")
async def sync_tenant_features(tenant_id: int, db=Depends(get_db)):
    tenant = await db.fetchrow("SELECT plan FROM tenants WHERE id = $1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    await provision_plan_features(tenant_id, tenant["plan"], db)
    return {"ok": True, "plan": tenant["plan"]}


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(tenant_id: int, db=Depends(get_db)):
    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id = $1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return dict(tenant)


@router.delete("/{tenant_id}", status_code=204)
async def delete_tenant(tenant_id: int, db=Depends(get_db)):
    await db.execute("DELETE FROM tenants WHERE id = $1", tenant_id)
