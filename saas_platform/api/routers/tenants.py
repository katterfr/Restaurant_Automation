from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
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
    created_at: str


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
