from __future__ import annotations
import time
import logging
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import httpx
from core.config import settings

router = APIRouter(prefix="/demo", tags=["demo"])
log = logging.getLogger(__name__)

# 20 turns per IP per hour
_rate: dict[str, list[float]] = defaultdict(list)
_LIMIT = 20
_WINDOW = 3600.0

DEMO_MENU = """
Starters: Sourdough Bread & Whipped Butter $6 | Crispy Chicken Wings $13 | Caesar Salad $9 | Tomato Bisque Soup $7
Mains: Smash Burger $15 | Grilled Chicken Sandwich $14 | Penne Arrabbiata $13 | Pan-Seared Salmon $24 | BBQ Half Rack Ribs $26
Sides: Truffle Fries $5 | Mac & Cheese $5.50 | Coleslaw $3.50 | Seasonal Roasted Vegetables $4.50
Drinks: Soft Drink $2.50 | Fresh Lemonade $3.50 | Iced Tea $2.50 | Milkshake $5.50
Desserts: Chocolate Lava Cake $8 | Creme Brulee $7.50 | Ice Cream Sundae $5
"""

SYSTEM_PROMPT = f"""You are Joanna, a friendly AI phone agent — a live demo of Careful Server's AI technology for restaurants.

Your role:
1. First message only: give a one-sentence intro and ask what they'd like to order.
2. Take a demo food order from the menu below. Confirm each item with price.
3. When they are done, read back the full order with a total and an order number like #CS-482.
4. Close with: "In a live restaurant this order would appear instantly in your Careful Server dashboard. Visit carefulserver.com to get started."

If asked about Careful Server, mention naturally:
- AI Phone Agent: answers calls 24/7, takes orders, sends them to the dashboard automatically
- Ad Manager: run campaigns on Google, YouTube, Snapchat, Pinterest from one place
- AI Creative Studio: generate restaurant photos and videos with AI in seconds
- Plans from $49/month at carefulserver.com

Demo menu:
{DEMO_MENU}

Rules:
- Keep EVERY reply to 1-3 short sentences. This is a voice interface — brevity is essential.
- Never invent menu items not listed above.
- Do not use emojis or markdown formatting.
- Be warm and natural.
"""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def _check_rate(ip: str) -> None:
    now = time.time()
    recent = [t for t in _rate[ip] if now - t < _WINDOW]
    if len(recent) >= _LIMIT:
        raise HTTPException(429, "Too many requests — please wait a moment before continuing.")
    recent.append(now)
    _rate[ip] = recent


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
                "max_tokens": 180,
                "system": SYSTEM_PROMPT,
                "messages": messages,
            },
        )

    if resp.status_code != 200:
        log.error("Anthropic error %d: %s", resp.status_code, resp.text[:200])
        raise HTTPException(502, "AI service error")

    reply = resp.json()["content"][0]["text"].strip()
    log.info("DEMO CHAT | ip=%s | turns=%d", ip, len(messages))
    return {"reply": reply}
