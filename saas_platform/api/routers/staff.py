from __future__ import annotations

import asyncio
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

CREATE TABLE IF NOT EXISTS staff_chat_groups (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    invite_code TEXT NOT NULL,
    created_by INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    ai_flag_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_group_members (
    id SERIAL PRIMARY KEY,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS ai_staff_insights (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    category TEXT NOT NULL,
    suggestion TEXT NOT NULL,
    source_context TEXT DEFAULT '',
    reviewed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_schedules (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    early_grace_minutes INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id, scheduled_date)
);

CREATE TABLE IF NOT EXISTS employee_focus_exit_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    shift_id INTEGER,
    exited_at TIMESTAMPTZ DEFAULT NOW()
);
"""


async def _ensure_extra_columns(db: Any) -> None:
    await db.execute("ALTER TABLE shift_policies ADD COLUMN IF NOT EXISTS kiosk_pin TEXT DEFAULT '1234'")
    await db.execute("ALTER TABLE shift_policies ADD COLUMN IF NOT EXISTS chat_salt TEXT DEFAULT ''")
    await db.execute("ALTER TABLE shift_policies ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN DEFAULT FALSE")
    await db.execute("ALTER TABLE shift_policies ADD COLUMN IF NOT EXISTS geofence_lat DOUBLE PRECISION")
    await db.execute("ALTER TABLE shift_policies ADD COLUMN IF NOT EXISTS geofence_lng DOUBLE PRECISION")
    await db.execute("ALTER TABLE shift_policies ADD COLUMN IF NOT EXISTS geofence_radius_m INT DEFAULT 150")
    await db.execute("ALTER TABLE staff_messages ADD COLUMN IF NOT EXISTS group_id INT")
    await db.execute("ALTER TABLE staff_messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text'")


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
    geofence_enabled: Optional[bool] = None
    geofence_lat: Optional[float] = None
    geofence_lng: Optional[float] = None
    geofence_radius_m: Optional[int] = None


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


class ScheduleCreate(BaseModel):
    user_id: int
    scheduled_date: str          # YYYY-MM-DD
    start_time: str              # HH:MM  (24-hour)
    end_time: Optional[str] = None
    early_grace_minutes: int = 0
    notes: Optional[str] = None


class ScheduleUpdate(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    early_grace_minutes: Optional[int] = None
    notes: Optional[str] = None


class MessageCreate(BaseModel):
    content: str
    to_user_id: Optional[int] = None
    is_broadcast: bool = True
    group_id: Optional[int] = None
    message_type: str = "text"


class CreateGroupBody(BaseModel):
    name: str
    description: str = ""


class JoinGroupBody(BaseModel):
    invite_code: str


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
        "SELECT enabled, emergency_contacts, kiosk_pin, chat_salt, geofence_enabled, geofence_lat, geofence_lng, geofence_radius_m FROM shift_policies WHERE tenant_id=$1",
        tenant_id,
    )
    if row is None:
        return {
            "enabled": False,
            "emergency_contacts": [],
            "kiosk_pin": "1234",
            "chat_salt": "",
            "geofence_enabled": False,
            "geofence_lat": None,
            "geofence_lng": None,
            "geofence_radius_m": 150,
        }
    contacts = row["emergency_contacts"]
    if isinstance(contacts, str):
        contacts = json.loads(contacts)
    return {
        "enabled": row["enabled"],
        "emergency_contacts": contacts or [],
        "kiosk_pin": row["kiosk_pin"] or "1234",
        "chat_salt": row["chat_salt"] or "",
        "geofence_enabled": row["geofence_enabled"] or False,
        "geofence_lat": row["geofence_lat"],
        "geofence_lng": row["geofence_lng"],
        "geofence_radius_m": row["geofence_radius_m"] or 150,
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
        geofence_enabled = body.geofence_enabled if body.geofence_enabled is not None else False
        geofence_lat = body.geofence_lat
        geofence_lng = body.geofence_lng
        geofence_radius_m = body.geofence_radius_m if body.geofence_radius_m is not None else 150
        await db.execute(
            """INSERT INTO shift_policies (tenant_id, enabled, emergency_contacts, kiosk_pin, chat_salt,
               geofence_enabled, geofence_lat, geofence_lng, geofence_radius_m, updated_at)
               VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, NOW())""",
            tenant_id, enabled, json.dumps(contacts), kiosk_pin, chat_salt,
            geofence_enabled, geofence_lat, geofence_lng, geofence_radius_m,
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
        geofence_enabled = body.geofence_enabled if body.geofence_enabled is not None else (existing.get("geofence_enabled") or False)
        geofence_lat = body.geofence_lat if body.geofence_lat is not None else existing.get("geofence_lat")
        geofence_lng = body.geofence_lng if body.geofence_lng is not None else existing.get("geofence_lng")
        geofence_radius_m = body.geofence_radius_m if body.geofence_radius_m is not None else (existing.get("geofence_radius_m") or 150)
        await db.execute(
            """UPDATE shift_policies
               SET enabled=$2, emergency_contacts=$3::jsonb, kiosk_pin=$4, chat_salt=$5,
               geofence_enabled=$6, geofence_lat=$7, geofence_lng=$8, geofence_radius_m=$9, updated_at=NOW()
               WHERE tenant_id=$1""",
            tenant_id, enabled, json.dumps(contacts), kiosk_pin, chat_salt,
            geofence_enabled, geofence_lat, geofence_lng, geofence_radius_m,
        )

    return {
        "enabled": enabled,
        "emergency_contacts": contacts,
        "kiosk_pin": kiosk_pin,
        "chat_salt": chat_salt,
        "geofence_enabled": geofence_enabled,
        "geofence_lat": geofence_lat,
        "geofence_lng": geofence_lng,
        "geofence_radius_m": geofence_radius_m,
    }


# ─── Clock-in / out / focus ───────────────────────────────────────────────────

@router.post("/clock-in")
async def clock_in(current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    user_dict = dict(current_user)
    tenant_id = user_dict.get("tenant_id")
    user_id = user_dict.get("id")

    # Check if already clocked in
    active = await db.fetchrow(
        "SELECT id FROM employee_shifts WHERE tenant_id=$1 AND user_id=$2 AND clocked_out_at IS NULL",
        tenant_id, user_id,
    )
    if active:
        raise HTTPException(400, "Already clocked in")

    # ── Schedule enforcement ──────────────────────────────────────────────────
    schedule = await db.fetchrow(
        "SELECT * FROM employee_schedules WHERE tenant_id=$1 AND user_id=$2 AND scheduled_date=CURRENT_DATE",
        tenant_id, user_id,
    )
    if schedule:
        from datetime import time as dt_time
        now_utc = datetime.now(timezone.utc)
        # Use the server's local time for comparison (matches what the DB's CURRENT_DATE returns)
        now_local = datetime.now()
        now_time = now_local.time().replace(second=0, microsecond=0)

        scheduled_start = schedule["start_time"]  # datetime.time from asyncpg
        grace_minutes = schedule["early_grace_minutes"] or 0

        # Earliest allowed clock-in = scheduled start minus grace period
        start_dt = datetime.combine(now_local.date(), scheduled_start)
        earliest_dt = start_dt - timedelta(minutes=grace_minutes)
        earliest_time = earliest_dt.time().replace(second=0, microsecond=0)

        if now_time < earliest_time:
            def fmt(t: dt_time) -> str:
                hour = t.hour % 12 or 12
                ampm = "AM" if t.hour < 12 else "PM"
                return f"{hour}:{t.minute:02d} {ampm}"

            msg = f"Too early to clock in. Your shift starts at {fmt(scheduled_start)}."
            if grace_minutes > 0:
                msg += f" You may clock in up to {grace_minutes} min early, from {fmt(earliest_time)}."
            else:
                msg += f" Clock-in opens at {fmt(scheduled_start)}."
            raise HTTPException(400, msg)
    # ─────────────────────────────────────────────────────────────────────────

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
    user_dict = dict(current_user)
    tenant_id = user_dict.get("tenant_id")
    user_id = user_dict.get("id")

    active = await db.fetchrow(
        "SELECT id FROM employee_shifts WHERE tenant_id=$1 AND user_id=$2 AND clocked_out_at IS NULL",
        tenant_id, user_id,
    )
    shift_id = active["id"] if active else None

    await db.execute(
        """UPDATE employee_shifts
           SET focus_exits = focus_exits + 1
           WHERE tenant_id=$1 AND user_id=$2 AND clocked_out_at IS NULL""",
        tenant_id, user_id,
    )
    try:
        await db.execute(
            "INSERT INTO employee_focus_exit_logs (tenant_id, user_id, shift_id) VALUES ($1, $2, $3)",
            tenant_id, user_id, shift_id,
        )
    except Exception:
        pass
    return {"ok": True}


@router.get("/employees")
async def list_employees(current_user=Depends(_require_portal), db=Depends(get_db)):
    """Return all staff for this tenant (for schedule pickers). Owner/manager only."""
    user_dict = dict(current_user)
    if user_dict.get("role") not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Managers only")
    tenant_id = user_dict.get("tenant_id")
    rows = await db.fetch(
        """SELECT id, email, COALESCE(display_name, '') as display_name, role
           FROM users WHERE tenant_id=$1 ORDER BY display_name, email""",
        tenant_id,
    )
    return [dict(r) for r in rows]


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
                  u.email as user_email,
                  COALESCE(u.display_name, '') as display_name
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

    focus_exit_logs: list = []
    try:
        logs = await db.fetch(
            """SELECT efl.id, efl.user_id, efl.exited_at,
                      u.email as user_email,
                      COALESCE(u.display_name, u.email) as display_name
               FROM employee_focus_exit_logs efl
               JOIN users u ON u.id = efl.user_id
               WHERE efl.tenant_id=$1 AND efl.exited_at::date = CURRENT_DATE
               ORDER BY efl.exited_at DESC LIMIT 50""",
            tid,
        )
        focus_exit_logs = [_serialize(dict(l)) for l in logs]
    except Exception:
        pass

    return {
        "today_orders": orders["cnt"],
        "today_revenue": float(orders["rev"]),
        "goals": [_serialize(dict(g)) for g in goals],
        "on_shift_count": len(on_shift),
        "on_shift": [_serialize(dict(s)) for s in on_shift],
        "recent_orders": [_serialize(dict(o)) for o in recent_orders],
        "focus_exit_logs": focus_exit_logs,
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
    for key in ("clocked_in_at", "clocked_out_at", "created_at"):
        if key in d and d[key] is not None:
            val = d[key]
            if hasattr(val, "isoformat"):
                d[key] = val.isoformat()
    return d


def _schedule_dict(row) -> dict:
    d = dict(row)
    for key in ("scheduled_date", "start_time", "end_time", "created_at"):
        if key in d and d[key] is not None:
            val = d[key]
            if hasattr(val, "isoformat"):
                d[key] = val.isoformat()
            else:
                d[key] = str(val)
    return d


# ─── Schedules ────────────────────────────────────────────────────────────────

@router.get("/schedules/mine")
async def get_my_schedule_today(current_user=Depends(_require_portal), db=Depends(get_db)):
    """Return today's schedule for the requesting employee (used by employee app home page)."""
    await _ensure_tables(db)
    user_dict = dict(current_user)
    tenant_id = user_dict.get("tenant_id")
    user_id = user_dict.get("id")

    row = await db.fetchrow(
        "SELECT * FROM employee_schedules WHERE tenant_id=$1 AND user_id=$2 AND scheduled_date=CURRENT_DATE",
        tenant_id, user_id,
    )
    if not row:
        return None
    return _schedule_dict(row)


@router.get("/schedules")
async def list_schedules(current_user=Depends(_require_portal), db=Depends(get_db)):
    """List schedules. Owners/managers see all; staff see only their own (next 7 days)."""
    await _ensure_tables(db)
    user_dict = dict(current_user)
    tenant_id = user_dict.get("tenant_id")
    user_id = user_dict.get("id")
    role = user_dict.get("role", "staff")

    if role in {"owner", "admin", "manager"}:
        rows = await db.fetch(
            """SELECT s.*, u.email as user_email, COALESCE(u.display_name, u.email) as user_name
               FROM employee_schedules s
               JOIN users u ON u.id = s.user_id
               WHERE s.tenant_id=$1 AND s.scheduled_date >= CURRENT_DATE - INTERVAL '1 day'
               ORDER BY s.scheduled_date ASC, s.start_time ASC
               LIMIT 200""",
            tenant_id,
        )
    else:
        rows = await db.fetch(
            """SELECT * FROM employee_schedules
               WHERE tenant_id=$1 AND user_id=$2 AND scheduled_date >= CURRENT_DATE
               ORDER BY scheduled_date ASC, start_time ASC
               LIMIT 30""",
            tenant_id, user_id,
        )
    return [_schedule_dict(r) for r in rows]


@router.post("/schedules")
async def create_schedule(body: ScheduleCreate, current_user=Depends(_require_portal), db=Depends(get_db)):
    user_dict = dict(current_user)
    if user_dict.get("role") not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Only owners and managers can schedule shifts")
    await _ensure_tables(db)
    tenant_id = user_dict.get("tenant_id")
    creator_id = user_dict.get("id")

    # Verify the target employee belongs to this tenant
    target = await db.fetchrow(
        "SELECT id FROM users WHERE id=$1 AND tenant_id=$2", body.user_id, tenant_id
    )
    if not target:
        raise HTTPException(404, "Employee not found")

    row = await db.fetchrow(
        """INSERT INTO employee_schedules
             (tenant_id, user_id, scheduled_date, start_time, end_time,
              early_grace_minutes, notes, created_by)
           VALUES ($1,$2,$3::date,$4::time,$5::time,$6,$7,$8)
           ON CONFLICT (tenant_id, user_id, scheduled_date)
           DO UPDATE SET start_time=EXCLUDED.start_time,
                         end_time=EXCLUDED.end_time,
                         early_grace_minutes=EXCLUDED.early_grace_minutes,
                         notes=EXCLUDED.notes
           RETURNING *""",
        tenant_id, body.user_id, body.scheduled_date,
        body.start_time, body.end_time, body.early_grace_minutes,
        body.notes, creator_id,
    )
    return _schedule_dict(row)


@router.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: int, body: ScheduleUpdate, current_user=Depends(_require_portal), db=Depends(get_db)):
    user_dict = dict(current_user)
    if user_dict.get("role") not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Only owners and managers can edit schedules")
    await _ensure_tables(db)
    tenant_id = user_dict.get("tenant_id")

    existing = await db.fetchrow(
        "SELECT * FROM employee_schedules WHERE id=$1 AND tenant_id=$2", schedule_id, tenant_id
    )
    if not existing:
        raise HTTPException(404, "Schedule not found")

    d = dict(existing)
    start_time = body.start_time if body.start_time is not None else str(d["start_time"])
    end_time = body.end_time if body.end_time is not None else (str(d["end_time"]) if d.get("end_time") else None)
    grace = body.early_grace_minutes if body.early_grace_minutes is not None else d.get("early_grace_minutes", 0)
    notes = body.notes if body.notes is not None else d.get("notes")

    row = await db.fetchrow(
        """UPDATE employee_schedules
           SET start_time=$3::time, end_time=$4::time,
               early_grace_minutes=$5, notes=$6
           WHERE id=$1 AND tenant_id=$2
           RETURNING *""",
        schedule_id, tenant_id, start_time, end_time, grace, notes,
    )
    return _schedule_dict(row)


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: int, current_user=Depends(_require_portal), db=Depends(get_db)):
    user_dict = dict(current_user)
    if user_dict.get("role") not in {"owner", "admin", "manager"}:
        raise HTTPException(403, "Only owners and managers can delete schedules")
    await _ensure_tables(db)
    tenant_id = user_dict.get("tenant_id")

    deleted = await db.fetchrow(
        "DELETE FROM employee_schedules WHERE id=$1 AND tenant_id=$2 RETURNING id",
        schedule_id, tenant_id,
    )
    if not deleted:
        raise HTTPException(404, "Schedule not found")
    return {"ok": True}


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

async def _is_group_member(db: Any, group_id: int, tenant_id: int, user_id: int) -> bool:
    row = await db.fetchrow(
        """SELECT 1 FROM staff_group_members m
           JOIN staff_chat_groups g ON g.id = m.group_id
           WHERE m.group_id=$1 AND m.user_id=$2 AND g.tenant_id=$3""",
        group_id, user_id, tenant_id,
    )
    return row is not None


@router.get("/messages")
async def list_messages(group_id: Optional[int] = None, current_user=Depends(_require_portal), db=Depends(get_db)):
    await _ensure_tables(db)
    tenant_id = current_user["tenant_id"]
    user_id = current_user["id"]

    if group_id is not None:
        if not await _is_group_member(db, group_id, tenant_id, user_id):
            raise HTTPException(403, "Not a member of this group")
        rows = await db.fetch(
            """SELECT * FROM staff_messages
               WHERE tenant_id=$1 AND group_id=$2
               ORDER BY created_at DESC LIMIT 100""",
            tenant_id, group_id,
        )
    else:
        rows = await db.fetch(
            """SELECT * FROM staff_messages
               WHERE tenant_id=$1 AND group_id IS NULL
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

    if body.group_id is not None:
        if not await _is_group_member(db, body.group_id, tenant_id, user_id):
            raise HTTPException(403, "Not a member of this group")

    message_type = body.message_type if body.message_type in ("text", "image") else "text"

    encrypted = _encrypt(tenant_id, body.content)
    row = await db.fetchrow(
        """INSERT INTO staff_messages
             (tenant_id, from_user_id, from_name, content_encrypted, is_broadcast, to_user_id, group_id, message_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *""",
        tenant_id, user_id, from_name, encrypted, body.is_broadcast, body.to_user_id, body.group_id, message_type,
    )
    d = dict(row)
    d["content"] = body.content
    d.pop("content_encrypted", None)
    if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
        d["created_at"] = d["created_at"].isoformat()

    # Fire-and-forget AI workplace monitor (never blocks the response, never surfaces to users).
    # Only text messages are analyzed.
    if message_type == "text":
        try:
            asyncio.create_task(_run_ai_monitor(tenant_id, body.content, db))
        except Exception:
            pass

    return d


# ─── Chat Groups ──────────────────────────────────────────────────────────────

@router.get("/groups")
async def get_groups(current_user=Depends(_require_portal), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    uid = current_user["id"]
    await _ensure_tables(db)
    rows = await db.fetch(
        """SELECT g.id, g.name, g.description, g.invite_code, g.created_at, g.is_active,
                  (SELECT COUNT(*) FROM staff_group_members WHERE group_id=g.id) as member_count
           FROM staff_chat_groups g
           JOIN staff_group_members m ON m.group_id=g.id
           WHERE g.tenant_id=$1 AND m.user_id=$2 AND g.is_active=TRUE
           ORDER BY g.created_at DESC""",
        tid, uid,
    )
    result = []
    for r in rows:
        d = dict(r)
        if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
        result.append(d)
    return result


@router.post("/groups")
async def create_group(body: CreateGroupBody, current_user=Depends(_require_portal), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    uid = current_user["id"]
    await _ensure_tables(db)
    invite_code = secrets.token_urlsafe(8).upper()[:8]
    row = await db.fetchrow(
        "INSERT INTO staff_chat_groups (tenant_id, name, description, invite_code, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, invite_code",
        tid, body.name.strip(), body.description.strip(), invite_code, uid,
    )
    await db.execute(
        "INSERT INTO staff_group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        row["id"], uid,
    )
    return {"id": row["id"], "name": body.name, "invite_code": row["invite_code"]}


@router.post("/groups/join")
async def join_group(body: JoinGroupBody, current_user=Depends(_require_portal), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    uid = current_user["id"]
    await _ensure_tables(db)
    group = await db.fetchrow(
        "SELECT id, name FROM staff_chat_groups WHERE tenant_id=$1 AND invite_code=$2 AND is_active=TRUE",
        tid, body.invite_code.upper().strip(),
    )
    if not group:
        raise HTTPException(404, "Invalid invite code")
    await db.execute(
        "INSERT INTO staff_group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        group["id"], uid,
    )
    return {"ok": True, "group_id": group["id"], "group_name": group["name"]}


@router.delete("/groups/{group_id}/leave")
async def leave_group(group_id: int, current_user=Depends(_require_portal), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    uid = current_user["id"]
    await _ensure_tables(db)
    # Verify the group belongs to this tenant before removing membership
    group = await db.fetchrow(
        "SELECT id FROM staff_chat_groups WHERE id=$1 AND tenant_id=$2", group_id, tid,
    )
    if not group:
        raise HTTPException(404, "Group not found")
    await db.execute(
        "DELETE FROM staff_group_members WHERE group_id=$1 AND user_id=$2", group_id, uid,
    )
    return {"ok": True}


# ─── AI Workplace Insights ────────────────────────────────────────────────────

@router.get("/insights")
async def get_insights(current_user=Depends(_require_portal), db=Depends(get_db)):
    if current_user.get("role") not in ("owner", "admin", "manager"):
        raise HTTPException(403, "Access denied")
    tid = current_user["tenant_id"]
    await _ensure_tables(db)
    rows = await db.fetch(
        "SELECT * FROM ai_staff_insights WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50", tid,
    )
    result = []
    for r in rows:
        d = dict(r)
        if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
        result.append(d)
    return result


async def _run_ai_monitor(tenant_id: int, message: str, db):
    """Silent AI that extracts workplace improvement insights. Never records gossip."""
    if not settings.anthropic_api_key or not message.strip():
        return
    if len(message) < 10:
        return

    system = """You are a silent workplace culture analyst. Your ONLY job is to identify genuinely useful, actionable suggestions that could help a restaurant owner improve the work environment, customer experience, or business operations.

STRICT RULES:
- Extract ONLY: suggestions about improving operations, customer service, scheduling, menu ideas, or workplace culture
- IGNORE and return null for: personal complaints, gossip, slander, casual conversation, jokes, anything not actionable
- NEVER record anything about coworkers' personal lives, relationships, or disputes
- If in doubt, return null
- Respond with JSON only: {"suggestion": "...", "category": "operations|customer|culture|menu|null"}
- If nothing useful, return {"suggestion": null, "category": "null"}"""

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-haiku-4-5-20251001", "max_tokens": 150, "system": system,
                      "messages": [{"role": "user", "content": f"Analyze this workplace message: {message[:500]}"}]},
            )
            if not r.is_success:
                return
            text = r.json()["content"][0]["text"]
            data = json.loads(text)
            if data.get("suggestion") and data.get("category") != "null":
                await db.execute(
                    "INSERT INTO ai_staff_insights (tenant_id, category, suggestion) VALUES ($1,$2,$3)",
                    tenant_id, data["category"], data["suggestion"],
                )
    except Exception:
        pass  # Never let AI monitor errors surface to users


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

    return {"request_id": req["id"], "code": code, "expires_in_minutes": 30}


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
    """Recent Exit Activity — shows history for audit. Codes are not shown (employees receive them directly)."""
    if current_user.get("role") not in ("owner", "admin", "manager"):
        raise HTTPException(403, "Owner or manager access required")

    tid = current_user["tenant_id"]
    await _ensure_tables(db)

    rows = await db.fetch(
        """SELECT er.id, er.exit_type, er.status, er.created_at, er.expires_at,
                  u.email as user_email
           FROM exit_requests er
           JOIN users u ON u.id = er.user_id
           WHERE er.tenant_id=$1
           ORDER BY er.created_at DESC
           LIMIT 50""",
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
