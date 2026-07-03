import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, Form
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user
from core.config import settings
from core.encryption import decrypt_data
from integrations import vapi as vapi_api
from integrations import twilio_sms, sms_ai
import stripe

log = logging.getLogger(__name__)
router = APIRouter(prefix="/phone", tags=["phone"])


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Tenant access only")
    return current_user


async def _get_tenant_vapi_key(tenant_id: int, db) -> str:
    row = await db.fetchrow(
        "SELECT api_key FROM tenant_api_keys WHERE tenant_id=$1 AND service='vapi'",
        tenant_id,
    )
    if not row:
        raise HTTPException(
            503,
            "VAPI API key not configured. Go to Settings → API Keys and add your VAPI token to use the AI Phone Agent.",
        )
    return decrypt_data(row["api_key"])


# ─── GET status ───────────────────────────────────────────────────────────────

@router.get("/status")
async def get_phone_status(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    row = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tid)
    calls = await db.fetch(
        "SELECT * FROM phone_calls WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 20", tid
    )
    has_key = await db.fetchval(
        "SELECT COUNT(*) FROM tenant_api_keys WHERE tenant_id=$1 AND service='vapi'", tid,
    )
    return {
        "configured": bool(has_key),
        "agent": dict(row) if row else None,
        "recent_calls": [dict(c) for c in calls],
    }


# ─── POST activate ────────────────────────────────────────────────────────────

class ActivateBody(BaseModel):
    greeting: str = "Thank you for calling! I'm your virtual order assistant. How can I help you today?"
    special_instructions: str = ""
    existing_number: Optional[str] = None  # owner's current business number (skip VAPI provisioning)


@router.post("/activate")
async def activate_phone_agent(body: ActivateBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    vapi_key = await _get_tenant_vapi_key(tid, db)
    if not tid:
        raise HTTPException(403, "No restaurant linked to this account. Please log in via the owner portal.")

    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tid)
    if not tenant:
        raise HTTPException(404, "Restaurant not found — it may have been removed.")

    menu_rows = await db.fetch(
        "SELECT name, category, price, description, available FROM menu_items WHERE tenant_id=$1",
        tid,
    )
    menu_items = [dict(r) for r in menu_rows]

    system_prompt = vapi_api.build_system_prompt(
        tenant["name"], menu_items, body.special_instructions,
        sms_number=settings.twilio_sms_number or "",
    )

    webhook_url = f"{settings.saas_api_url}/phone/webhook/{tid}"
    assistant_name = f"{tenant['name']} Order Agent"

    existing = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tid)

    needs_new_assistant = not existing or not existing["vapi_assistant_id"]

    if existing and existing["vapi_assistant_id"]:
        # Try to update existing assistant; recreate if it no longer exists in VAPI
        try:
            await vapi_api.update_assistant(existing["vapi_assistant_id"], system_prompt, body.greeting, webhook_url=webhook_url, api_key=vapi_key)
            assistant_id = existing["vapi_assistant_id"]
            phone_number_id = existing["vapi_phone_number_id"]
            phone_number = body.existing_number or existing["phone_number"]
        except Exception as e:
            if "404" in str(e):
                needs_new_assistant = True
            else:
                raise HTTPException(502, f"Failed to update VAPI assistant: {e}")

    if needs_new_assistant:
        # Create new assistant
        try:
            sms_tool_url = f"{settings.saas_api_url}/phone/tool/switch-to-sms/{tid}" if twilio_sms.is_configured() else ""
            assistant = await vapi_api.create_assistant(
                assistant_name, system_prompt, body.greeting, webhook_url, sms_tool_url=sms_tool_url, api_key=vapi_key,
            )
            assistant_id = assistant["id"]
        except Exception as e:
            raise HTTPException(502, f"Failed to create VAPI assistant: {e}")

        # Re-link existing VAPI number to new assistant, or provision a new one
        existing_vapi_number_id = existing["vapi_phone_number_id"] if existing else None
        phone_number = body.existing_number or (existing["phone_number"] if existing else None)
        phone_number_id = None

        if existing_vapi_number_id:
            try:
                await vapi_api.relink_phone_number(existing_vapi_number_id, assistant_id, api_key=vapi_key)
                phone_number_id = existing_vapi_number_id
            except Exception as e:
                log.warning("Failed to re-link VAPI phone number, will provision new: %s", e)

        if not phone_number_id and not body.existing_number:
            try:
                num = await vapi_api.provision_phone_number(assistant_id, api_key=vapi_key)
                phone_number_id = num.get("id")
                phone_number = num.get("number")
            except Exception as e:
                log.warning("Phone number provisioning failed: %s", e)

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


# ─── PATCH set phone number (post-activation) ────────────────────────────────

class SetNumberBody(BaseModel):
    existing_number: Optional[str] = None  # owner's current business number
    provision_new: bool = False            # request a new VAPI auto-assigned number
    area_code: Optional[str] = None        # preferred area code for new number


@router.patch("/number")
async def set_phone_number(body: SetNumberBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    agent = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1 AND is_active=TRUE", tid)
    if not agent:
        raise HTTPException(404, "No active phone agent. Activate the agent first.")

    if body.existing_number:
        row = await db.fetchrow(
            "UPDATE phone_agents SET phone_number=$2, updated_at=NOW() WHERE tenant_id=$1 RETURNING *",
            tid, body.existing_number,
        )
        return dict(row)

    if body.provision_new:
        if not agent["vapi_assistant_id"]:
            raise HTTPException(400, "VAPI assistant not ready — please re-activate the agent")
        vapi_key = await _get_tenant_vapi_key(tid, db)
        try:
            num = await vapi_api.provision_phone_number(agent["vapi_assistant_id"], area_code=body.area_code or "", api_key=vapi_key)
        except Exception as e:
            raise HTTPException(502, f"VAPI number provisioning failed: {e}")
        row = await db.fetchrow(
            """UPDATE phone_agents
               SET vapi_phone_number_id=$2, phone_number=$3, updated_at=NOW()
               WHERE tenant_id=$1 RETURNING *""",
            tid, num.get("id"), num.get("number"),
        )
        return dict(row)

    raise HTTPException(400, "Provide existing_number or set provision_new=true")


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
        tenant["name"], menu_items, agent["special_instructions"] or "",
        sms_number=settings.twilio_sms_number or "",
    )

    vapi_key = await _get_tenant_vapi_key(tid, db)
    try:
        await vapi_api.update_assistant(
            agent["vapi_assistant_id"], system_prompt, agent["greeting"], api_key=vapi_key,
        )
    except Exception as e:
        raise HTTPException(502, f"Failed to sync: {e}")

    return {"ok": True, "menu_items_synced": len(menu_items)}


# ─── Stripe Connect (per-tenant payments) ────────────────────────────────────

@router.post("/connect-stripe/start")
async def start_stripe_connect(current_user=Depends(_require_owner), db=Depends(get_db)):
    if not settings.stripe_secret_key:
        raise HTTPException(503, "Stripe not configured")
    stripe.api_key = settings.stripe_secret_key

    tid = current_user["tenant_id"]
    agent = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tid)
    if not agent:
        raise HTTPException(404, "Activate the phone agent before connecting Stripe")

    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tid)

    account_id = agent["stripe_connect_account_id"]
    if not account_id:
        try:
            account = stripe.Account.create(
                type="express",
                email=current_user["email"],
                business_profile={"name": tenant["name"]},
            )
        except Exception as e:
            raise HTTPException(502, f"Failed to create Stripe account: {e}")
        account_id = account.id
        await db.execute(
            "UPDATE phone_agents SET stripe_connect_account_id=$2, stripe_connect_status='pending' WHERE tenant_id=$1",
            tid, account_id,
        )

    try:
        link = stripe.AccountLink.create(
            account=account_id,
            type="account_onboarding",
            return_url=f"{settings.frontend_url}/portal/{tenant['slug']}/phone?stripe=return",
            refresh_url=f"{settings.frontend_url}/portal/{tenant['slug']}/phone?stripe=refresh",
        )
    except stripe.error.InvalidRequestError as e:
        # Stored account is from test mode or doesn't exist — reset and create a fresh live account
        if "not connected to your platform" in str(e) or "does not exist" in str(e):
            await db.execute(
                "UPDATE phone_agents SET stripe_connect_account_id=NULL, stripe_connect_status='not_connected' WHERE tenant_id=$1",
                tid,
            )
            try:
                account = stripe.Account.create(
                    type="express",
                    email=current_user["email"],
                    business_profile={"name": tenant["name"]},
                )
                account_id = account.id
                await db.execute(
                    "UPDATE phone_agents SET stripe_connect_account_id=$2, stripe_connect_status='pending' WHERE tenant_id=$1",
                    tid, account_id,
                )
                link = stripe.AccountLink.create(
                    account=account_id,
                    type="account_onboarding",
                    return_url=f"{settings.frontend_url}/portal/{tenant['slug']}/phone?stripe=return",
                    refresh_url=f"{settings.frontend_url}/portal/{tenant['slug']}/phone?stripe=refresh",
                )
            except Exception as e2:
                raise HTTPException(502, f"Failed to create Stripe account: {e2}")
        else:
            raise HTTPException(502, f"Failed to create onboarding link: {e}")
    except Exception as e:
        raise HTTPException(502, f"Failed to create onboarding link: {e}")

    return {"url": link.url}


@router.post("/connect-stripe/refresh")
async def refresh_stripe_connect(current_user=Depends(_require_owner), db=Depends(get_db)):
    if not settings.stripe_secret_key:
        raise HTTPException(503, "Stripe not configured")
    stripe.api_key = settings.stripe_secret_key

    tid = current_user["tenant_id"]
    agent = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tid)
    if not agent or not agent["stripe_connect_account_id"]:
        raise HTTPException(404, "Stripe account not connected yet")

    try:
        account = stripe.Account.retrieve(agent["stripe_connect_account_id"])
    except Exception as e:
        raise HTTPException(502, f"Failed to check Stripe account: {e}")

    status = "active" if account.charges_enabled else "pending"
    await db.execute(
        "UPDATE phone_agents SET stripe_connect_status=$2 WHERE tenant_id=$1",
        tid, status,
    )
    return {"status": status}


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
            vapi_key_row = await db.fetchrow(
                "SELECT api_key FROM tenant_api_keys WHERE tenant_id=$1 AND service='vapi'", tid,
            )
            vapi_key = decrypt_data(vapi_key_row["api_key"]) if vapi_key_row else None
            tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tid)
            menu_rows = await db.fetch(
                "SELECT name, category, price, description, available FROM menu_items WHERE tenant_id=$1", tid
            )
            sp = vapi_api.build_system_prompt(tenant["name"], [dict(r) for r in menu_rows], instructions)
            await vapi_api.update_assistant(agent["vapi_assistant_id"], sp, greeting, api_key=vapi_key)
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


# ─── VAPI tool: switch_to_sms ─────────────────────────────────────────────────
# VAPI calls this when the voice agent uses the switch_to_sms tool during a call

@router.post("/tool/switch-to-sms/{tenant_id}")
async def vapi_tool_switch_to_sms(tenant_id: int, request: Request, db=Depends(get_db)):
    try:
        payload = await request.json()
    except Exception:
        return {"result": "ok"}

    # Extract customer phone and message from VAPI tool call
    tool_call = payload.get("toolCall") or payload.get("message", {}).get("toolCall", {})
    fn_args = tool_call.get("function", {}).get("arguments", {})
    if isinstance(fn_args, str):
        try:
            fn_args = json.loads(fn_args)
        except Exception:
            fn_args = {}

    customer_phone = (payload.get("call") or payload.get("message", {}).get("call", {})).get("customer", {}).get("number", "")
    sms_message = fn_args.get("message", f"Hi! Text this number to place your order. We're happy to help!")

    if not twilio_sms.is_configured():
        return {"result": "SMS not configured"}

    # Find tenant's agent to get their SMS number context
    agent = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tenant_id)
    if not agent:
        return {"result": "Agent not found"}

    # Open or reuse SMS session
    if customer_phone:
        try:
            await _get_or_create_session(db, tenant_id, customer_phone)
            await twilio_sms.send_sms(customer_phone, sms_message)
        except Exception as e:
            log.warning("Failed to send switch-to-sms: %s", e)

    return {"result": "SMS sent — customer can now text to continue their order"}


# ─── SMS webhook (Twilio inbound SMS) ────────────────────────────────────────

async def _get_or_create_session(db, tenant_id: int, customer_phone: str) -> int:
    """Return an active session id, creating one if needed."""
    row = await db.fetchrow(
        """SELECT id FROM sms_sessions
           WHERE tenant_id=$1 AND customer_phone=$2 AND status='active'
           ORDER BY started_at DESC LIMIT 1""",
        tenant_id, customer_phone,
    )
    if row:
        return row["id"]
    row = await db.fetchrow(
        "INSERT INTO sms_sessions (tenant_id, customer_phone) VALUES ($1,$2) RETURNING id",
        tenant_id, customer_phone,
    )
    return row["id"]


@router.post("/sms/webhook/{tenant_id}")
async def sms_webhook(
    tenant_id: int,
    request: Request,
    db=Depends(get_db),
):
    """Twilio posts here when an inbound SMS arrives on the business number."""
    form = await request.form()
    from_number = str(form.get("From", ""))
    body_text   = str(form.get("Body", "")).strip()

    if not from_number or not body_text:
        return _twiml("")

    log.info("Inbound SMS tenant=%s from=%s body=%s", tenant_id, from_number, body_text[:80])

    # Look up tenant + menu
    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        return _twiml("Sorry, this number is not currently active.")

    agent = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tenant_id)

    menu_rows = await db.fetch(
        "SELECT name, category, price, description, available FROM menu_items WHERE tenant_id=$1", tenant_id
    )
    menu_items = [dict(r) for r in menu_rows]

    # Get/create session
    session_id = await _get_or_create_session(db, tenant_id, from_number)

    # Save inbound message
    await db.execute(
        "INSERT INTO sms_messages (session_id, role, content) VALUES ($1,'user',$2)",
        session_id, body_text,
    )
    await db.execute(
        "UPDATE sms_sessions SET last_message_at=NOW() WHERE id=$1", session_id
    )

    # Load conversation history (last 20 messages)
    history_rows = await db.fetch(
        "SELECT role, content FROM sms_messages WHERE session_id=$1 ORDER BY created_at ASC",
        session_id,
    )
    messages = [{"role": r["role"], "content": r["content"]} for r in history_rows]

    # Get AI reply
    reply_text = ""
    if sms_ai.is_configured():
        try:
            reply_text = await sms_ai.get_response(
                tenant["name"],
                menu_items,
                messages,
                special_instructions=(agent["special_instructions"] if agent else ""),
            )
        except Exception as e:
            log.error("SMS AI error: %s", e)
            reply_text = f"Hi! Welcome to {tenant['name']}. We're experiencing a brief issue — please call us to place your order. Thank you!"
    else:
        # Fallback without AI: list the menu
        lines = [f"Hi! Welcome to {tenant['name']}. Here's our menu:"]
        by_cat: dict = {}
        for item in menu_items:
            if item.get("available"):
                cat = (item.get("category") or "other").title()
                by_cat.setdefault(cat, []).append(item)
        for cat, items in list(by_cat.items())[:4]:
            lines.append(f"\n{cat}:")
            for it in items[:5]:
                lines.append(f"  {it['name']} ${float(it.get('price',0)):.2f}")
        lines.append("\nReply with your order or text CALL ME to speak with us.")
        reply_text = "\n".join(lines)

    # Handle CALLBACK request
    if sms_ai.is_callback_request(reply_text):
        reply_text = sms_ai.clean_reply(reply_text)
        if agent and agent["vapi_assistant_id"]:
            try:
                vapi_key_row = await db.fetchrow(
                    "SELECT api_key FROM tenant_api_keys WHERE tenant_id=$1 AND service='vapi'", tenant_id,
                )
                outbound_key = decrypt_data(vapi_key_row["api_key"]) if vapi_key_row else None
                await vapi_api.initiate_outbound_call(
                    from_number,
                    agent["vapi_assistant_id"],
                    context_message="Hi! You requested a callback to continue your order. I'm ready to take it now!",
                    api_key=outbound_key,
                )
            except Exception as e:
                log.warning("Outbound call failed: %s", e)
                reply_text = "We'll call you shortly! If you don't hear from us in a moment, feel free to call us directly."
        else:
            reply_text = "We'll have someone call you shortly!"

    # Parse order if AI signalled completion
    order_data = sms_ai.parse_order_from_reply(reply_text)
    reply_clean = sms_ai.clean_reply(reply_text)

    if order_data and order_data["items"]:
        items_json = json.dumps([
            {"name": i["name"], "qty": i["qty"], "price": i["price"]}
            for i in order_data["items"]
        ])
        try:
            order_row = await db.fetchrow(
                """INSERT INTO tenant_orders (tenant_id, order_source, status, items, total, notes)
                   VALUES ($1,'sms_ai','pending',$2,$3,$4) RETURNING id""",
                tenant_id,
                items_json,
                round(order_data["total"], 2),
                f"SMS order — Customer: {order_data['customer_name']} ({from_number})",
            )
            await db.execute(
                "UPDATE sms_sessions SET status='ordered', order_id=$1 WHERE id=$2",
                order_row["id"], session_id,
            )
        except Exception as e:
            log.error("Failed to create SMS order: %s", e)

    # Save assistant reply
    await db.execute(
        "INSERT INTO sms_messages (session_id, role, content) VALUES ($1,'assistant',$2)",
        session_id, reply_clean,
    )

    return _twiml(reply_clean)


def _twiml(message: str) -> dict:
    """Return a Twilio TwiML SMS response."""
    from fastapi.responses import Response
    xml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{message}</Message></Response>'
    return Response(content=xml, media_type="application/xml")


# ─── GET SMS sessions (owner view) ───────────────────────────────────────────

@router.get("/sms/sessions")
async def get_sms_sessions(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    sessions = await db.fetch(
        """SELECT s.*, COUNT(m.id) as message_count
           FROM sms_sessions s
           LEFT JOIN sms_messages m ON m.session_id = s.id
           WHERE s.tenant_id=$1
           GROUP BY s.id
           ORDER BY s.last_message_at DESC
           LIMIT 50""",
        tid,
    )
    return [dict(s) for s in sessions]


@router.get("/sms/sessions/{session_id}/messages")
async def get_session_messages(session_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    session = await db.fetchrow(
        "SELECT * FROM sms_sessions WHERE id=$1 AND tenant_id=$2",
        session_id, current_user["tenant_id"],
    )
    if not session:
        raise HTTPException(404, "Session not found")
    msgs = await db.fetch(
        "SELECT * FROM sms_messages WHERE session_id=$1 ORDER BY created_at ASC", session_id
    )
    return {"session": dict(session), "messages": [dict(m) for m in msgs]}
