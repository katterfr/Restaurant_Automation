from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
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
CREATE TABLE IF NOT EXISTS exit_requests (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    shift_id INT,
    user_id INT NOT NULL,
    exit_type TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

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


async def _ensure_extra_columns(db: Any) -> None:
    await db.execute("ALTER TABLE shift_policies ADD COLUMN IF NOT EXISTS kiosk_pin TEXT DEFAULT '1234'")
    await db.execute("ALTER TABLE shift_policies ADD COLUMN IF NOT EXISTS chat_salt TEXT DEFAULT ''")


async def _ensure_tables(db: Any) -> None:
    global _tables_ready
    if _tables_ready:
        return
    try:
        for statement in _CREATE_TABLES_SQL.strip().split(";\n\n"):
            stmt = statement.strip()
            if stmt:
                await db.execute(stmt)
        await _ensure_extra_columns(db)
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
    kiosk_pin: Optional[str] = None
    chat_salt: Optional[str] = None


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


class ExitRequestBody(BaseModel):
    exit_type: str  # 'clock_out' or 'break'


class ConfirmExitBody(BaseModel):
    code: str


# ─── Policy endpoints ─────────────────────────────────────────────────────────

@router.get("/policy")
async def get_policy(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    row = await db.fetchrow(
        "SELECT enabled, emergency_contacts, kiosk_pin, chat_salt FROM shift_policies WHERE tenant_id=$1",
        tenant_id,
    )
    if row is None:
        return {"enabled": False, "emergency_contacts": [], "kiosk_pin": "1234", "chat_salt": ""}
    contacts = row["emergency_contacts"]
    if isinstance(contacts, str):
        contacts = json.loads(contacts)
    return {
        "enabled": row["enabled"],
        "emergency_contacts": contacts or [],
        "kiosk_pin": row["kiosk_pin"] or "1234",
        "chat_salt": row["chat_salt"] or "",
    }


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
        kiosk_pin = body.kiosk_pin if body.kiosk_pin is not None else "1234"
        chat_salt = body.chat_salt if body.chat_salt is not None else ""
        await db.execute(
            """INSERT INTO shift_policies (tenant_id, enabled, emergency_contacts, kiosk_pin, chat_salt, updated_at)
               VALUES ($1, $2, $3::jsonb, $4, $5, NOW())""",
            tenant_id, enabled, json.dumps(contacts), kiosk_pin, chat_salt,
        )
    else:
        enabled = body.enabled if body.enabled is not None else existing["enabled"]
        if body.emergency_contacts is not None:
            contacts = [c.model_dump() for c in body.emergency_contacts]
        else:
            raw = existing["emergency_contacts"]
            contacts = json.loads(raw) if isinstance(raw, str) else (raw or [])
        kiosk_pin = body.kiosk_pin if body.kiosk_pin is not None else (existing.get("kiosk_pin") or "1234")
        chat_salt = body.chat_salt if body.chat_salt is not None else (existing.get("chat_salt") or "")
        await db.execute(
            """UPDATE shift_policies
               SET enabled=$2, emergency_contacts=$3::jsonb, kiosk_pin=$4, chat_salt=$5, updated_at=NOW()
               WHERE tenant_id=$1""",
            tenant_id, enabled, json.dumps(contacts), kiosk_pin, chat_salt,
        )

    return {"enabled": enabled, "emergency_contacts": contacts, "kiosk_pin": kiosk_pin, "chat_salt": chat_salt}


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


@router.get("/live")
async def get_live_data(current_user=Depends(_require_portal), db=Depends(get_db)):
    """Live kiosk dashboard data: today's orders, revenue, goals, who's on shift."""
    tid = current_user["tenant_id"]
    await _ensure_tables(db)

    # Today's orders and revenue
    orders = await db.fetchrow(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as rev FROM tenant_orders WHERE tenant_id=$1 AND created_at::date=CURRENT_DATE",
        tid
    )

    # Active goals for today
    goals = await db.fetch(
        "SELECT * FROM business_goals WHERE tenant_id=$1 AND is_active=TRUE AND period='daily' AND period_start<=CURRENT_DATE AND period_end>=CURRENT_DATE",
        tid
    )

    # Who's currently on shift
    on_shift = await db.fetch(
        """SELECT es.id, es.user_id, es.clocked_in_at, es.focus_exits,
                  u.email as user_email
           FROM employee_shifts es
           JOIN users u ON u.id=es.user_id
           WHERE es.tenant_id=$1 AND es.clocked_out_at IS NULL""",
        tid
    )

    # Recent orders (last 5) for live feed
    recent_orders = await db.fetch(
        "SELECT id, order_source, total, status, created_at FROM tenant_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 5",
        tid
    )

    def _serialize(row: dict) -> dict:
        out = {}
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                out[k] = v.isoformat()
            else:
                out[k] = v
        return out

    return {
        "today_orders": orders["cnt"],
        "today_revenue": float(orders["rev"]),
        "goals": [_serialize(dict(g)) for g in goals],
        "on_shift_count": len(on_shift),
        "on_shift": [_serialize(dict(s)) for s in on_shift],
        "recent_orders": [_serialize(dict(o)) for o in recent_orders],
    }


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


# ─── Exit Requests ────────────────────────────────────────────────────────────

@router.post("/exit-request")
async def request_exit(body: ExitRequestBody, current_user=Depends(_require_portal), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    uid = current_user["id"]
    await _ensure_tables(db)

    # Get current shift
    shift = await db.fetchrow(
        "SELECT id FROM employee_shifts WHERE tenant_id=$1 AND user_id=$2 AND clocked_out_at IS NULL",
        tid, uid
    )
    shift_id = shift["id"] if shift else None

    # Generate 6-digit code
    code = str(secrets.randbelow(1000000)).zfill(6)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    # Expire any previous pending requests for this user
    await db.execute(
        "UPDATE exit_requests SET status='expired' WHERE tenant_id=$1 AND user_id=$2 AND status='pending'",
        tid, uid
    )

    req = await db.fetchrow(
        """INSERT INTO exit_requests (tenant_id, shift_id, user_id, exit_type, code, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id""",
        tid, shift_id, uid, body.exit_type, code, expires_at
    )

    return {"request_id": req["id"], "expires_in_minutes": 30}


@router.post("/confirm-exit")
async def confirm_exit(body: ConfirmExitBody, current_user=Depends(_require_portal), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    uid = current_user["id"]
    await _ensure_tables(db)

    req = await db.fetchrow(
        """SELECT * FROM exit_requests
           WHERE tenant_id=$1 AND user_id=$2 AND code=$3 AND status='pending' AND expires_at > NOW()
           ORDER BY created_at DESC LIMIT 1""",
        tid, uid, body.code
    )
    if not req:
        raise HTTPException(400, "Invalid or expired exit code")

    await db.execute("UPDATE exit_requests SET status='used' WHERE id=$1", req["id"])

    if req["exit_type"] == "clock_out":
        clocked_in_row = await db.fetchrow(
            "SELECT * FROM employee_shifts WHERE tenant_id=$1 AND user_id=$2 AND clocked_out_at IS NULL",
            tid, uid
        )
        if clocked_in_row:
            clocked_in_at: datetime = clocked_in_row["clocked_in_at"]
            now = datetime.now(timezone.utc)
            if clocked_in_at.tzinfo is None:
                clocked_in_at = clocked_in_at.replace(tzinfo=timezone.utc)
            duration_minutes = int((now - clocked_in_at).total_seconds() / 60)
            await db.execute(
                "UPDATE employee_shifts SET clocked_out_at=NOW(), duration_minutes=$3 WHERE id=$1 AND tenant_id=$2",
                clocked_in_row["id"], tid, duration_minutes
            )
    elif req["exit_type"] == "break":
        # Record break start — log for now
        pass

    return {"ok": True, "exit_type": req["exit_type"]}


@router.get("/exit-requests")
async def get_exit_requests(current_user=Depends(_require_portal), db=Depends(get_db)):
    if current_user.get("role") not in ("owner", "admin", "manager"):
        raise HTTPException(403, "Owner or manager access required")

    tid = current_user["tenant_id"]
    await _ensure_tables(db)

    rows = await db.fetch(
        """SELECT er.id, er.exit_type, er.code, er.status, er.created_at, er.expires_at,
                  u.email as user_email
           FROM exit_requests er
           JOIN users u ON u.id = er.user_id
           WHERE er.tenant_id=$1 AND er.status='pending' AND er.expires_at > NOW()
           ORDER BY er.created_at DESC""",
        tid
    )

    def _ser(row: dict) -> dict:
        out = {}
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                out[k] = v.isoformat()
            else:
                out[k] = v
        return out

    return [_ser(dict(r)) for r in rows]
