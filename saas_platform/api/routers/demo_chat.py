from __future__ import annotations
import re
import time
import logging
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Request, Form, Response
from pydantic import BaseModel
import httpx
from core.config import settings
from integrations import twilio_sms

router = APIRouter(prefix="/demo", tags=["demo"])
log = logging.getLogger(__name__)

# ── Rate limiting ─────────────────────────────────────────────────────────────
_rate: dict[str, list[float]] = defaultdict(list)
_LIMIT = 20
_WINDOW = 3600.0

# ── SMS sessions {e164_phone: [{"role": ..., "content": ...}]} ───────────────
_sms_sessions: dict[str, list[dict]] = {}

# ── Demo menu ─────────────────────────────────────────────────────────────────
DEMO_MENU = """
Starters: Sourdough Bread & Whipped Butter $6 | Crispy Chicken Wings $13 | Caesar Salad $9 | Tomato Bisque Soup $7
Mains: Smash Burger $15 | Grilled Chicken Sandwich $14 | Penne Arrabbiata $13 | Pan-Seared Salmon $24 | BBQ Half Rack Ribs $26
Sides: Truffle Fries $5 | Mac & Cheese $5.50 | Coleslaw $3.50 | Seasonal Roasted Vegetables $4.50
Drinks: Soft Drink $2.50 | Fresh Lemonade $3.50 | Iced Tea $2.50 | Milkshake $5.50
Desserts: Chocolate Lava Cake $8 | Creme Brulee $7.50 | Ice Cream Sundae $5
"""

# ── System prompts ────────────────────────────────────────────────────────────
VOICE_SYSTEM_PROMPT = f"""You are Joanna, a friendly AI phone agent — a live demo of Careful Server's AI technology for restaurants.

Your role:
1. First message only: give a one-sentence intro and ask what they'd like to order.
2. Take a demo food order from the menu below. Confirm each item with price.
3. When they are done, read back the full order with a total and an order number like #CS-482.
4. Close with: "In a live restaurant this order would appear instantly in your Careful Server dashboard. Visit carefulserver.com to get started."

Voice-to-text handoff:
- If the visitor says anything like "text me", "text me instead", "send me a text", "switch to SMS", or "can you text me":
  1. Reply with ONE warm sentence agreeing to switch, then ask for their mobile number.
  2. Append ##SMS_HANDOFF## on its own line at the very end (hidden from visitor — DO NOT read it aloud).

If asked about Careful Server, mention naturally:
- AI Phone Agent: answers calls 24/7, takes orders, sends them to the dashboard automatically
- Voice & Text Handoff: customers can switch between voice and SMS mid-conversation (you are doing this now!)
- Ad Manager: Google, YouTube, Snapchat, Pinterest campaigns from one place
- AI Creative Studio: professional restaurant photos/videos generated with AI
- Plans from $49/month at carefulserver.com

Demo menu:
{DEMO_MENU}

Rules:
- Keep EVERY reply to 1-3 short sentences. This is a voice interface — brevity is essential.
- Never invent menu items not listed above.
- Do not use emojis or markdown formatting.
- Be warm and natural.
"""

SMS_SYSTEM_PROMPT = f"""You are Joanna, a Careful Server AI demo agent — continuing an order that started on a voice call.

The visitor switched from voice to SMS to experience the Voice & Text Handoff feature.

Your role:
1. Continue taking or confirming the order naturally via text.
2. Keep replies SHORT — 1-2 sentences. This is SMS.
3. When the order is complete, give a total and order number (#CS-XXX), then say:
   "This is the Careful Server AI demo. In a live restaurant your order would hit the dashboard instantly. Visit carefulserver.com to get this for your restaurant!"

If asked about Careful Server, mention naturally:
- AI Phone Agent: 24/7 voice ordering
- Voice & Text Handoff: seamless switch between call and SMS (you just demonstrated this!)
- Ad Manager, AI Creative Studio, plans from $49/month at carefulserver.com

Demo menu:
{DEMO_MENU}

Rules:
- Never invent menu items.
- Do not use emojis.
- Be warm and concise.
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _strip_markers(text: str) -> str:
    return text.replace("##SMS_HANDOFF##", "").strip()


def _has_handoff(text: str) -> bool:
    return "##SMS_HANDOFF##" in text


def _normalize_phone(raw: str) -> str:
    """Normalize to E.164 US number (+1XXXXXXXXXX). Raises ValueError on bad input."""
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    raise ValueError(f"Unrecognized phone number: {raw!r}")


def _check_rate(ip: str) -> None:
    now = time.time()
    recent = [t for t in _rate[ip] if now - t < _WINDOW]
    if len(recent) >= _LIMIT:
        raise HTTPException(429, "Too many requests — please wait a moment.")
    recent.append(now)
    _rate[ip] = recent


async def _claude(system: str, messages: list[dict], max_tokens: int = 180) -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": max_tokens,
                "system": system,
                "messages": messages,
            },
        )
    if resp.status_code != 200:
        log.error("Anthropic error %d: %s", resp.status_code, resp.text[:200])
        raise HTTPException(502, "AI service error")
    return resp.json()["content"][0]["text"].strip()


# ── Endpoints ─────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("/chat")
async def demo_chat(body: ChatRequest, request: Request):
    ip = request.headers.get("x-forwarded-for", "")
    ip = (ip.split(",")[0].strip()) or (request.client.host if request.client else "unknown")
    _check_rate(ip)

    if not settings.anthropic_api_key:
        raise HTTPException(503, "Demo temporarily unavailable")
    if len(body.messages) > 40:
        raise HTTPException(400, "Conversation too long")

    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    raw = await _claude(VOICE_SYSTEM_PROMPT, messages)

    sms_handoff = _has_handoff(raw)
    reply = _strip_markers(raw)

    log.info("DEMO CHAT | ip=%s | turns=%d | handoff=%s", ip, len(messages), sms_handoff)
    return {"reply": reply, "sms_handoff": sms_handoff}


class HandoffRequest(BaseModel):
    phone: str
    messages: list[ChatMessage]  # conversation so far, for context in SMS session


@router.post("/sms-handoff")
async def demo_sms_handoff(body: HandoffRequest, request: Request):
    ip = request.headers.get("x-forwarded-for", "")
    ip = (ip.split(",")[0].strip()) or (request.client.host if request.client else "unknown")
    _check_rate(ip)

    if not twilio_sms.is_configured():
        raise HTTPException(503, "SMS not available for this demo")

    try:
        e164 = _normalize_phone(body.phone)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    # Seed the SMS session with the web conversation history (stripped of markers)
    history = [{"role": m.role, "content": _strip_markers(m.content)} for m in body.messages]
    _sms_sessions[e164] = history

    opening = (
        "Hi! This is Joanna, your Careful Server AI demo — continuing from your voice call. "
        "You just experienced the Voice & Text Handoff feature! "
        "Reply here to keep ordering, ask questions, or just reply MENU to see today's options."
    )

    try:
        await twilio_sms.send_sms(to=e164, body=opening)
    except Exception as exc:
        log.error("Demo SMS send failed: %s", exc)
        raise HTTPException(502, "Could not send SMS — please try again")

    log.info("DEMO SMS HANDOFF | phone=%s | history_turns=%d", e164, len(history))
    return {"ok": True, "to": e164}


@router.post("/sms-webhook")
async def demo_sms_webhook(
    From: str = Form(...),
    Body: str = Form(...),
):
    """Twilio inbound SMS webhook — responds to visitor replies in the demo SMS session."""
    if not settings.anthropic_api_key:
        return Response(content="<Response/>", media_type="application/xml")

    try:
        e164 = _normalize_phone(From)
    except ValueError:
        return Response(content="<Response/>", media_type="application/xml")

    user_text = Body.strip()
    if not user_text:
        return Response(content="<Response/>", media_type="application/xml")

    history = _sms_sessions.get(e164, [])
    history.append({"role": "user", "content": user_text})

    try:
        reply = await _claude(SMS_SYSTEM_PROMPT, history, max_tokens=200)
    except Exception as exc:
        log.error("Demo SMS AI error: %s", exc)
        reply = "Sorry, I ran into a problem. Please try again or visit carefulserver.com."

    history.append({"role": "assistant", "content": reply})
    _sms_sessions[e164] = history[-30:]  # cap at 30 turns

    try:
        await twilio_sms.send_sms(to=e164, body=reply)
    except Exception as exc:
        log.error("Demo SMS reply send failed: %s", exc)

    log.info("DEMO SMS REPLY | phone=%s | turns=%d", e164, len(history))
    # Twilio expects empty TwiML when we send the reply via the REST API directly
    return Response(content="<Response/>", media_type="application/xml")
