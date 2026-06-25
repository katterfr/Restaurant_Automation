from __future__ import annotations

import base64
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional, Any

from cryptography.fernet import Fernet
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from api.routers.auth import get_current_user
from core.config import settings
from db.database import get_db

log = logging.getLogger(__name__)

router = APIRouter(prefix="/staff", tags=["staff"])

# ─── Table bootstrap ──────────────────────────────────────────────────────────

_tables_ready = False

_CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS shift_policies (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT FALSE,
  emergency_contacts JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_shifts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  clocked_in_at TIMESTAMPTZ DEFAULT NOW(),
  clocked_out_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  focus_exits INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_goals (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  metric TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  current_value NUMERIC DEFAULT 0,
  period TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_messages (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  from_user_id INTEGER REFERENCES users(id),
  from_name TEXT,
  content_encrypted TEXT NOT NULL,
  is_broadcast BOOLEAN DEFAULT FALSE,
  to_user_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
"""


async def _ensure_tables(db: Any) -> None:
    global _tables_ready
    if _tables_ready:
        return
    try:
        for statement in _CREATE_TABLES_SQL.strip().split(";\n\n"):
            stmt = statement.strip()
            if stmt:
                await db.execute(stmt)
        _tables_ready = True
    except Exception as exc:  # pragma: no cover
        log.warning("staff: could not create tables: %s", exc)


# ─── Encryption helpers ───────────────────────────────────────────────────────

def _fernet(tenant_id: int) -> Fernet:
    """Derive a per-tenant Fernet key from the global credential encryption key."""
    raw = (settings.secret_key + str(tenant_id)).encode()
    digest = hashlib.sha256(raw).digest()
    key = base64.urlsafe_b64encode(digest)  # 32 bytes → 44-char base64url
    return Fernet(key)


def _encrypt(tenant_id: int, plaintext: str) -> str:
    return _fernet(tenant_id).encrypt(plaintext.encode()).decode()


def _decrypt(tenant_id: int, ciphertext: str) -> str:
    try:
        return _fernet(tenant_id).decrypt(ciphertext.encode()).decode()
    except Exception:
        return "[encrypted]"


# ─── Auth dependency ──────────────────────────────────────────────────────────

PORTAL_ROLES = {"owner", "admin", "manager", "marketing", "staff", "viewer"}


def _require_portal(current_user=Depends(get_current_user)):
    if current_user["role"] not in PORTAL_ROLES:
        raise HTTPException(403, "Portal access only")
    return current_user


# ─── Pydantic models ──────────────────────────────────────────────────────────

class EmergencyContact(BaseModel):
    name: str
    phone: str
    relation: str


class PolicyUpdate(BaseModel):
    enabled: Optional[bool] = None
    emergency_contacts: Optional[List[EmergencyContact]] = None


class ClockOutBody(BaseModel):
    notes: Optional[str] = None


class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    metric: str
    target_value: float
    current_value: float = 0
    period: str
    period_start: str
    period_end: str
    is_active: bool = True


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    metric: Optional[str] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    period: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    is_active: Optional[bool] = None


class MessageCreate(BaseModel):
    content: str
    to_user_id: Optional[int] = None
    is_broadcast: bool = True


# ─── Policy endpoints ─────────────────────────────────────────────────────────

@router.get("/policy")
async def get_policy(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    row = await db.fetchrow(
        "SELECT enabled, emergency_contacts FROM shift_policies WHERE tenant_id=$1",
        tenant_id,
    )
    if row is None:
        return {"enabled": False, "emergency_contacts": []}
    contacts = row["emergency_contacts"]
    if isinstance(contacts, str):
        contacts = json.loads(contacts)
    return {"enabled": row["enabled"], "emergency_contacts": contacts or []}


@router.put("/policy")
async def update_policy(body: PolicyUpdate, current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    if current_user["role"] not in {"owner", "admin"}:
        raise HTTPException(403, "Owner or admin required")

    existing = await db.fetchrow(
        "SELECT id, enabled, emergency_contacts FROM shift_policies WHERE tenant_id=$1",
        tenant_id,
    )

    if existing is None:
        enabled = body.enabled if body.enabled is not None else False
        contacts = [c.model_dump() for c in body.emergency_contacts] if body.emergency_contacts is not None else []
        await db.execute(
            """INSERT INTO shift_policies (tenant_id, enabled, emergency_contacts, updated_at)
               VALUES ($1, $2, $3::jsonb, NOW())""",
            tenant_id, enabled, json.dumps(contacts),
        )
    else:
        enabled = body.enabled if body.enabled is not None else existing["enabled"]
        if body.emergency_contacts is not None:
            contacts = [c.model_dump() for c in body.emergency_contacts]
        else:
            raw = existing["emergency_contacts"]
            contacts = json.loads(raw) if isinstance(raw, str) else (raw or [])
        await db.execute(
            """UPDATE shift_policies
               SET enabled=$2, emergency_contacts=$3::jsonb, updated_at=NOW()
               WHERE tenant_id=$1""",
            tenant_id, enabled, json.dumps(contacts),
        )

    return {"enabled": enabled, "emergency_contacts": contacts}


# ─── Clock-in / out / focus ───────────────────────────────────────────────────

@router.post("/clock-in")
async def clock_in(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]

    # Check if already clocked in
    active = await db.fetchrow(
        "SELECT id FROM employee_shifts WHERE tenant_id=$1 AND user_id=$2 AND clocked_out_at IS NULL",
        tenant_id, user_id,
    )
    if active:
        raise HTTPException(400, "Already clocked in")

    row = await db.fetchrow(
        """INSERT INTO employee_shifts (tenant_id, user_id, clocked_in_at, focus_exits)
           VALUES ($1, $2, NOW(), 0) RETURNING *""",
        tenant_id, user_id,
    )
    return _shift_dict(row)


@router.post("/clock-out")
async def clock_out(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]

    active = await db.fetchrow(
        "SELECT * FROM employee_shifts WHERE tenant_id=$1 AND user_id=$2 AND clocked_out_at IS NULL",
        tenant_id, user_id,
    )
    if not active:
        raise HTTPException(400, "Not clocked in")

    clocked_in_at: datetime = active["clocked_in_at"]
    now = datetime.now(timezone.utc)
    if clocked_in_at.tzinfo is None:
        clocked_in_at = clocked_in_at.replace(tzinfo=timezone.utc)
    duration_minutes = int((now - clocked_in_at).total_seconds() / 60)

    row = await db.fetchrow(
        """UPDATE employee_shifts
           SET clocked_out_at=NOW(), duration_minutes=$3
           WHERE id=$1 AND tenant_id=$2
           RETURNING *""",
        active["id"], tenant_id, duration_minutes,
    )
    return _shift_dict(row)


@router.post("/focus-exit")
async def focus_exit(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]

    await db.execute(
        """UPDATE employee_shifts
           SET focus_exits = focus_exits + 1
           WHERE tenant_id=$1 AND user_id=$2 AND clocked_out_at IS NULL""",
        tenant_id, user_id,
    )
    return {"ok": True}


@router.get("/shift/current")
async def current_shift(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]

    row = await db.fetchrow(
        "SELECT * FROM employee_shifts WHERE tenant_id=$1 AND user_id=$2 AND clocked_out_at IS NULL",
        tenant_id, user_id,
    )
    if row is None:
        return None
    return _shift_dict(row)


@router.get("/shifts")
async def list_shifts(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]
    role = current_user["role"]

    if role in {"owner", "admin", "manager"}:
        rows = await db.fetch(
            """SELECT es.*, u.email as user_email, u.display_name as user_name
               FROM employee_shifts es
               LEFT JOIN users u ON u.id = es.user_id
               WHERE es.tenant_id=$1
               ORDER BY es.clocked_in_at DESC LIMIT 20""",
            tenant_id,
        )
    else:
        rows = await db.fetch(
            """SELECT es.*, u.email as user_email, u.display_name as user_name
               FROM employee_shifts es
               LEFT JOIN users u ON u.id = es.user_id
               WHERE es.tenant_id=$1 AND es.user_id=$2
               ORDER BY es.clocked_in_at DESC LIMIT 20""",
            tenant_id, user_id,
        )
    return [_shift_dict(r) for r in rows]


def _shift_dict(row) -> dict:
    d = dict(row)
    # Convert datetimes to ISO strings for JSON serialisation
    for key in ("clocked_in_at", "clocked_out_at", "created_at"):
        if key in d and d[key] is not None:
            val = d[key]
            if hasattr(val, "isoformat"):
                d[key] = val.isoformat()
    return d


# ─── Goals ────────────────────────────────────────────────────────────────────

@router.get("/goals")
async def list_goals(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    rows = await db.fetch(
        "SELECT * FROM business_goals WHERE tenant_id=$1 AND is_active=TRUE ORDER BY created_at DESC",
        tenant_id,
    )
    return [_goal_dict(r) for r in rows]


@router.post("/goals")
async def create_goal(body: GoalCreate, current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    if current_user["role"] not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Owner, admin, or manager required")
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]
    row = await db.fetchrow(
        """INSERT INTO business_goals
             (tenant_id, title, description, metric, target_value, current_value,
              period, period_start, period_end, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING *""",
        tenant_id, body.title, body.description, body.metric,
        body.target_value, body.current_value, body.period,
        body.period_start, body.period_end, body.is_active, user_id,
    )
    return _goal_dict(row)


@router.put("/goals/{goal_id}")
async def update_goal(goal_id: int, body: GoalUpdate, current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    if current_user["role"] not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Owner, admin, or manager required")
    tenant_id = current_user["tenant_id"]

    existing = await db.fetchrow(
        "SELECT * FROM business_goals WHERE id=$1 AND tenant_id=$2", goal_id, tenant_id,
    )
    if not existing:
        raise HTTPException(404, "Goal not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return _goal_dict(existing)

    set_parts = []
    values: list = []
    idx = 1
    for col, val in updates.items():
        set_parts.append(f"{col}=${idx}")
        values.append(val)
        idx += 1

    set_parts.append(f"updated_at=NOW()")
    values.extend([goal_id, tenant_id])

    row = await db.fetchrow(
        f"UPDATE business_goals SET {', '.join(set_parts)} WHERE id=${idx} AND tenant_id=${idx+1} RETURNING *",
        *values,
    )
    return _goal_dict(row)


@router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: int, current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    if current_user["role"] not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Owner, admin, or manager required")
    tenant_id = current_user["tenant_id"]
    await db.execute(
        "DELETE FROM business_goals WHERE id=$1 AND tenant_id=$2", goal_id, tenant_id,
    )
    return {"ok": True}


def _goal_dict(row) -> dict:
    d = dict(row)
    for key in ("created_at", "updated_at"):
        if key in d and d[key] is not None:
            val = d[key]
            if hasattr(val, "isoformat"):
                d[key] = val.isoformat()
    for key in ("period_start", "period_end"):
        if key in d and d[key] is not None:
            val = d[key]
            if hasattr(val, "isoformat"):
                d[key] = val.isoformat()
    for key in ("target_value", "current_value"):
        if key in d and d[key] is not None:
            d[key] = float(d[key])
    return d


# ─── Messages ─────────────────────────────────────────────────────────────────

@router.get("/messages")
async def list_messages(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]

    rows = await db.fetch(
        """SELECT * FROM staff_messages
           WHERE tenant_id=$1
             AND (is_broadcast=TRUE OR from_user_id=$2 OR to_user_id=$2)
           ORDER BY created_at DESC LIMIT 100""",
        tenant_id, user_id,
    )
    result = []
    for r in rows:
        d = dict(r)
        d["content"] = _decrypt(tenant_id, d.pop("content_encrypted"))
        if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
        result.append(d)
    return result


@router.post("/messages")
async def send_message(body: MessageCreate, current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]
    from_name = current_user.get("display_name") or current_user.get("email") or "Staff"

    encrypted = _encrypt(tenant_id, body.content)
    row = await db.fetchrow(
        """INSERT INTO staff_messages
             (tenant_id, from_user_id, from_name, content_encrypted, is_broadcast, to_user_id)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *""",
        tenant_id, user_id, from_name, encrypted, body.is_broadcast, body.to_user_id,
    )
    d = dict(row)
    d["content"] = body.content
    d.pop("content_encrypted", None)
    if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
        d["created_at"] = d["created_at"].isoformat()
    return d
