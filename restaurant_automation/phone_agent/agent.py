"""
agent.py — Twilio Voice webhook handler for the AI phone agent.
Mounts on FastAPI router at /phone/*

Flow:
  POST /phone/incoming  → answer call, check hours, start session
  POST /phone/gather    → receive speech, send to GPT-4o, TwiML response
  POST /phone/voicemail → after-hours voicemail recording handler
"""
from __future__ import annotations
import json
import logging
import uuid
from pathlib import Path
from fastapi import APIRouter, Form, Request, Response
from twilio.twiml.voice_response import VoiceResponse, Gather
from twilio.request_validator import RequestValidator

from orchestrator.config import settings
from orchestrator.bus import bus, Events
from phone_agent.hours import is_open, after_hours_message
from phone_agent.conversation import ConversationManager
from phone_agent.order_parser import parse_order

router = APIRouter(prefix="/phone", tags=["phone"])
log = logging.getLogger(__name__)

# In-memory session store {call_sid: ConversationManager}
# Replace with Redis for multi-instance deployments
_sessions: dict[str, ConversationManager] = {}

# Load menu once at startup
_MENU_PATH = Path(__file__).parent.parent / "menu.json"


def _load_menu() -> list[dict]:
    if _MENU_PATH.exists():
        return json.loads(_MENU_PATH.read_text())
    return []


def _twiml_say(text: str) -> str:
    """Return TwiML that speaks text and hangs up."""
    vr = VoiceResponse()
    vr.say(text, voice="Polly.Joanna", language="en-US")
    return str(vr)


def _twiml_gather(prompt: str, call_sid: str, action_url: str) -> str:
    """Return TwiML that speaks prompt then listens for speech."""
    vr = VoiceResponse()
    gather = Gather(
        input="speech",
        action=action_url,
        method="POST",
        speech_timeout="auto",
        language="en-US",
        hints="order, pickup, delivery, menu, hours",
        action_on_empty_result=True,
    )
    gather.say(prompt, voice="Polly.Joanna", language="en-US")
    vr.append(gather)
    # Fallback if no speech detected
    vr.redirect(action_url)
    return str(vr)


@router.post("/incoming")
async def incoming_call(
    request: Request,
    CallSid: str = Form(...),
    From: str = Form(...),
    To: str = Form(...),
):
    """Entry point for every inbound call."""
    log.info("INCOMING CALL | SID=%s | from=%s", CallSid, From)

    if not is_open():
        log.info("Restaurant closed — playing after-hours message")
        return Response(content=_twiml_say(after_hours_message()),
                        media_type="application/xml")

    # Start a new conversation session
    menu = _load_menu()
    _sessions[CallSid] = ConversationManager(call_sid=CallSid, menu=menu)

    greeting = (
        f"Thank you for calling {settings.restaurant_name}! "
        "I'm your AI order assistant. How can I help you today? "
        "You can tell me what you'd like to order, ask about our menu, "
        "or inquire about our hours."
    )

    base_url = str(request.base_url).rstrip("/")
    return Response(
        content=_twiml_gather(greeting, CallSid, f"{base_url}/phone/gather"),
        media_type="application/xml",
    )


@router.post("/gather")
async def gather_speech(
    request: Request,
    CallSid: str = Form(...),
    SpeechResult: str = Form(default=""),
    Confidence: float = Form(default=0.0),
):
    """Handle each speech turn from the caller."""
    log.info("SPEECH | SID=%s | confidence=%.2f | text=%r",
             CallSid, Confidence, SpeechResult)

    base_url = str(request.base_url).rstrip("/")
    session = _sessions.get(CallSid)

    if not session:
        # Session expired or new call — restart
        return Response(
            content=_twiml_say("I'm sorry, your session expired. Please call back."),
            media_type="application/xml",
        )

    if not SpeechResult.strip():
        prompt = "I didn't catch that — could you repeat your order?"
        return Response(
            content=_twiml_gather(prompt, CallSid,
                                   f"{base_url}/phone/gather"),
            media_type="application/xml",
        )

    reply, order_complete = await session.respond(SpeechResult)

    if order_complete:
        parsed = parse_order(reply)
        if parsed:
            order_id = str(uuid.uuid4())[:8].upper()
            await bus.publish(Events.ORDER_RECEIVED, {
                "order_id": order_id,
                "call_sid": CallSid,
                "customer_name": parsed.customer_name,
                "items": [
                    {"name": i.name, "qty": i.qty,
                     "mods": i.mods, "price": i.price}
                    for i in parsed.items
                ],
                "order_type": parsed.order_type,
                "address": parsed.address,
                "total": parsed.total,
                "channel": "phone",
            })
            farewell = (
                f"Perfect! Your order #{order_id} has been placed. "
                f"{'Pickup' if parsed.order_type == 'pickup' else 'Delivery'} "
                f"total is ${parsed.total:.2f}. "
                "Thank you for calling, and enjoy your meal! Goodbye!"
            )
        else:
            farewell = (
                "Your order has been received! "
                "Thank you for calling and enjoy your meal! Goodbye!"
            )

        _sessions.pop(CallSid, None)
        return Response(content=_twiml_say(farewell),
                        media_type="application/xml")

    # Strip ORDER_COMPLETE marker from spoken reply if present
    spoken = reply.split("ORDER_COMPLETE")[0].strip()

    return Response(
        content=_twiml_gather(spoken, CallSid, f"{base_url}/phone/gather"),
        media_type="application/xml",
    )


@router.post("/voicemail")
async def voicemail(
    CallSid: str = Form(...),
    RecordingUrl: str = Form(default=""),
    RecordingDuration: int = Form(default=0),
    From: str = Form(...),
):
    """Handle after-hours voicemail recordings."""
    log.info("VOICEMAIL | SID=%s | from=%s | duration=%ds | url=%s",
             CallSid, From, RecordingDuration, RecordingUrl)

    await bus.publish("voicemail.received", {
        "call_sid": CallSid,
        "from_number": From,
        "recording_url": RecordingUrl,
        "duration_seconds": RecordingDuration,
    })

    vr = VoiceResponse()
    vr.say("Your message has been recorded. We'll call you back soon. Goodbye!",
           voice="Polly.Joanna")
    return Response(content=str(vr), media_type="application/xml")
