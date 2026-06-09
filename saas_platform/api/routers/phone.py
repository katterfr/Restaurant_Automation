import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user
from core.config import settings
from integrations import vapi as vapi_api

log = logging.getLogger(__name__)
router = APIRouter(prefix="/phone", tags=["phone"])


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Tenant access only")
    return current_user


# ─── GET status ───────────────────────────────────────────────────────────────

@router.get("/status")
async def get_phone_status(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    row = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tid)
    calls = await db.fetch(
        "SELECT * FROM phone_calls WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 20", tid
    )
    return {
        "configured": vapi_api.is_configured(),
        "agent": dict(row) if row else None,
        "recent_calls": [dict(c) for c in calls],
    }


# ─── POST activate ────────────────────────────────────────────────────────────

class ActivateBody(BaseModel):
    greeting: str = "Thank you for calling! I'm your virtual order assistant. How can I help you today?"
    special_instructions: str = ""
    area_code: str = "888"


@router.post("/activate")
async def activate_phone_agent(body: ActivateBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    if not vapi_api.is_configured():
        raise HTTPException(503, "VAPI_API_KEY not configured — add it in Railway environment variables")

    tid = current_user["tenant_id"]

    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tid)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    menu_rows = await db.fetch(
        "SELECT name, category, price, description, available FROM menu_items WHERE tenant_id=$1",
        tid,
    )
    menu_items = [dict(r) for r in menu_rows]

    system_prompt = vapi_api.build_system_prompt(
        tenant["name"], menu_items, body.special_instructions
    )

    webhook_url = f"{settings.saas_api_url}/phone/webhook/{tid}"
    assistant_name = f"{tenant['name']} Order Agent"

    existing = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tid)

    if existing and existing["vapi_assistant_id"]:
        # Update existing assistant
        try:
            await vapi_api.update_assistant(existing["vapi_assistant_id"], system_prompt, body.greeting)
            assistant_id = existing["vapi_assistant_id"]
            phone_number_id = existing["vapi_phone_number_id"]
            phone_number = existing["phone_number"]
        except Exception as e:
            raise HTTPException(502, f"Failed to update VAPI assistant: {e}")
    else:
        # Create new assistant
        try:
            assistant = await vapi_api.create_assistant(
                assistant_name, system_prompt, body.greeting, webhook_url
            )
            assistant_id = assistant["id"]
        except Exception as e:
            raise HTTPException(502, f"Failed to create VAPI assistant: {e}")

        # Provision phone number
        phone_number_id = None
        phone_number = None
        try:
            num = await vapi_api.provision_phone_number(assistant_id, body.area_code)
            phone_number_id = num.get("id")
            phone_number = num.get("number")
        except Exception as e:
            log.warning("Phone number provisioning failed: %s", e)
            # Continue without a number — owner can set up forwarding manually

    if existing:
        row = await db.fetchrow(
            """UPDATE phone_agents
               SET vapi_assistant_id=$2, vapi_phone_number_id=$3, phone_number=$4,
                   greeting=$5, special_instructions=$6, is_active=TRUE, updated_at=NOW()
               WHERE tenant_id=$1 RETURNING *""",
            tid, assistant_id, phone_number_id, phone_number,
            body.greeting, body.special_instructions,
        )
    else:
        row = await db.fetchrow(
            """INSERT INTO phone_agents
               (tenant_id, vapi_assistant_id, vapi_phone_number_id, phone_number,
                greeting, special_instructions, is_active)
               VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING *""",
            tid, assistant_id, phone_number_id, phone_number,
            body.greeting, body.special_instructions,
        )

    return dict(row)


# ─── POST sync menu ───────────────────────────────────────────────────────────

@router.post("/sync-menu")
async def sync_menu_to_agent(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    agent = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1 AND is_active=TRUE", tid)
    if not agent or not agent["vapi_assistant_id"]:
        raise HTTPException(404, "No active phone agent found")

    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tid)
    menu_rows = await db.fetch(
        "SELECT name, category, price, description, available FROM menu_items WHERE tenant_id=$1", tid
    )
    menu_items = [dict(r) for r in menu_rows]

    system_prompt = vapi_api.build_system_prompt(
        tenant["name"], menu_items, agent["special_instructions"] or ""
    )

    try:
        await vapi_api.update_assistant(
            agent["vapi_assistant_id"], system_prompt, agent["greeting"]
        )
    except Exception as e:
        raise HTTPException(502, f"Failed to sync: {e}")

    return {"ok": True, "menu_items_synced": len(menu_items)}


# ─── PUT config ───────────────────────────────────────────────────────────────

class ConfigBody(BaseModel):
    greeting: Optional[str] = None
    special_instructions: Optional[str] = None


@router.put("/config")
async def update_config(body: ConfigBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    agent = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tid)
    if not agent:
        raise HTTPException(404, "No phone agent configured")

    greeting = body.greeting if body.greeting is not None else agent["greeting"]
    instructions = body.special_instructions if body.special_instructions is not None else agent["special_instructions"]

    row = await db.fetchrow(
        """UPDATE phone_agents SET greeting=$2, special_instructions=$3, updated_at=NOW()
           WHERE tenant_id=$1 RETURNING *""",
        tid, greeting, instructions,
    )

    # Push greeting update to VAPI if agent exists
    if agent["vapi_assistant_id"]:
        try:
            tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tid)
            menu_rows = await db.fetch(
                "SELECT name, category, price, description, available FROM menu_items WHERE tenant_id=$1", tid
            )
            sp = vapi_api.build_system_prompt(tenant["name"], [dict(r) for r in menu_rows], instructions)
            await vapi_api.update_assistant(agent["vapi_assistant_id"], sp, greeting)
        except Exception as e:
            log.warning("Failed to push config to VAPI: %s", e)

    return dict(row)


# ─── DELETE deactivate ────────────────────────────────────────────────────────

@router.delete("/deactivate", status_code=204)
async def deactivate_phone_agent(current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "UPDATE phone_agents SET is_active=FALSE, updated_at=NOW() WHERE tenant_id=$1",
        current_user["tenant_id"],
    )


# ─── GET recent calls ─────────────────────────────────────────────────────────

@router.get("/calls")
async def get_calls(current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM phone_calls WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50",
        current_user["tenant_id"],
    )
    return [dict(r) for r in rows]


# ─── POST webhook (no auth — called by VAPI) ──────────────────────────────────

@router.post("/webhook/{tenant_id}")
async def phone_webhook(tenant_id: int, request: Request, db=Depends(get_db)):
    try:
        payload = await request.json()
    except Exception:
        return {"ok": False}

    msg = payload.get("message", payload)
    msg_type = msg.get("type", "")

    log.info("VAPI webhook tenant=%s type=%s", tenant_id, msg_type)

    if msg_type != "end-of-call-report":
        return {"ok": True, "ignored": True}

    call = msg.get("call", {})
    vapi_call_id = call.get("id", "")
    caller_number = (call.get("customer") or {}).get("number", "")
    duration_secs = int(msg.get("durationSeconds") or call.get("duration") or 0)
    summary = msg.get("summary", "")
    transcript = msg.get("transcript", "")
    structured_data = msg.get("structuredData") or {}

    # Deduplicate
    existing_call = await db.fetchrow("SELECT id FROM phone_calls WHERE vapi_call_id=$1", vapi_call_id)
    if existing_call:
        return {"ok": True, "duplicate": True}

    # Parse order from structured data
    order_items = structured_data.get("order_items") or []
    customer_name = structured_data.get("customer_name") or "Phone Customer"
    order_type = structured_data.get("order_type") or "pickup"
    special_notes = structured_data.get("special_notes") or ""

    # Build order total
    total = sum(
        float(i.get("price", 0)) * int(i.get("quantity", 1))
        for i in order_items
        if isinstance(i, dict)
    )

    # Format items as JSON for tenant_orders.items
    items_json = json.dumps([
        {"name": i.get("name", ""), "qty": int(i.get("quantity", 1)), "price": float(i.get("price", 0))}
        for i in order_items if isinstance(i, dict)
    ])

    order_id = None
    order_created = False

    if order_items:
        try:
            order_row = await db.fetchrow(
                """INSERT INTO tenant_orders
                   (tenant_id, order_source, status, items, total, notes)
                   VALUES ($1, 'phone_ai', 'pending', $2, $3, $4) RETURNING id""",
                tenant_id,
                items_json,
                round(total, 2),
                f"Customer: {customer_name} | {order_type}{' | ' + special_notes if special_notes else ''}",
            )
            order_id = order_row["id"]
            order_created = True
        except Exception as e:
            log.error("Failed to create order from phone call: %s", e)

    # Log the call
    await db.execute(
        """INSERT INTO phone_calls
           (tenant_id, vapi_call_id, caller_number, duration_secs, summary, transcript,
            structured_data, order_created, order_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (vapi_call_id) DO NOTHING""",
        tenant_id, vapi_call_id, caller_number, duration_secs,
        summary, transcript, json.dumps(structured_data),
        order_created, order_id,
    )

    # Increment total_calls on agent
    await db.execute(
        "UPDATE phone_agents SET total_calls=total_calls+1, last_call_at=NOW() WHERE tenant_id=$1",
        tenant_id,
    )

    return {"ok": True, "order_created": order_created, "order_id": order_id}
