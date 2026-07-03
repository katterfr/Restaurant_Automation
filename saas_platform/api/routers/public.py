from typing import Optional
import logging
import re
import random
import string
import httpx

log = logging.getLogger(__name__)
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from core.config import settings
from core.security import hash_password

# Features automatically enabled per plan on signup (cumulative)
_GROWTH_FEATURES = [
    "menu_management",
    "ads_google", "ads_youtube", "ads_snapchat", "ads_pinterest",
    "social_youtube",
    "delivery", "listings_google", "listings_apple", "ai_creative",
    "staff_tools", "automations", "goals", "messaging",
]
_PRO_FEATURES = _GROWTH_FEATURES + ["phone_agent", "accounting"]

PLAN_FEATURES: dict[str, list[str]] = {
    "starter":    ["menu_management"],
    "growth":     _GROWTH_FEATURES,
    "pro":        _PRO_FEATURES,
    "business":   _PRO_FEATURES,
    "enterprise": _PRO_FEATURES,
}


async def provision_plan_features(tenant_id: int, plan: str, db) -> None:
    features = PLAN_FEATURES.get(plan, PLAN_FEATURES["starter"])
    for feature in features:
        await db.execute(
            """INSERT INTO tenant_features (tenant_id, feature, enabled, enabled_at)
               VALUES ($1, $2, TRUE, NOW())
               ON CONFLICT (tenant_id, feature) DO UPDATE SET enabled = TRUE, enabled_at = NOW()""",
            tenant_id, feature,
        )

router = APIRouter(prefix="/public", tags=["public"])


# ── Public stats (used by landing page counters) ──────────────────────────────

@router.get("/stats")
async def public_stats(db=Depends(get_db)):
    restaurant_count = await db.fetchval(
        "SELECT COUNT(*) FROM tenants WHERE status = 'active'"
    ) or 0
    order_count = await db.fetchval(
        "SELECT COUNT(*) FROM tenant_orders"
    ) or 0
    return {"restaurant_count": int(restaurant_count), "order_count": int(order_count)}


# ── Contact form ──────────────────────────────────────────────────────────────

class ContactForm(BaseModel):
    name: str
    email: str
    restaurant_name: Optional[str] = None
    phone: Optional[str] = None
    plan_interest: Optional[str] = None
    message: str


@router.post("/contact")
async def submit_contact(body: ContactForm, db=Depends(get_db)):
    await db.execute(
        """INSERT INTO contact_submissions
               (name, email, restaurant_name, phone, plan_interest, message)
           VALUES ($1,$2,$3,$4,$5,$6)""",
        body.name, body.email, body.restaurant_name,
        body.phone, body.plan_interest, body.message,
    )
    return {"ok": True}


# ── Visitor chat ──────────────────────────────────────────────────────────────

class VisitorMsg(BaseModel):
    role: str
    content: str


class VisitorChatReq(BaseModel):
    messages: list[VisitorMsg]


VISITOR_PROMPT = """You are Alice, a friendly and enthusiastic sales assistant for Careful-Server — an AI-powered all-in-one restaurant management platform.

## What Careful-Server Offers
1. **AI Phone Agent** — AI answers every call 24/7, takes orders, submits them to the dashboard automatically
2. **Voice ↔ Text Bridge** — Callers can switch to SMS mid-call and vice versa, all handled by AI
3. **Ad Campaign Manager** — Run ads on Meta, Google, YouTube, TikTok, Snapchat, Pinterest from one place
4. **Social Media Posting** — Post to Facebook, Instagram, YouTube, TikTok simultaneously with one click
5. **AI Creative Studio** — Generate professional restaurant ad images & videos with AI (no designer needed)
6. **Order Management** — All orders (phone, delivery, online) appear in one unified dashboard
7. **Menu Management** — Digital menu with live availability toggles per item
8. **Accounting & Bookkeeping** — Revenue and expense tracking, profit reports
9. **Delivery Integrations** — DoorDash, Uber Eats, and more connected automatically
10. **Google & Apple Maps** — Manage your Google Business Profile and Apple Maps listing
11. **Custom Branded Portal** — Each restaurant gets their own portal with custom colors, logo, dark mode
12. **AI Portal Assistant** — AI chatbot inside the portal that knows real-time business stats

## Pricing
- **Starter** ($49/mo) — Order management, menu management, basic reporting
- **Growth** ($149/mo) — Everything in Starter + 6-platform ads, social posting, delivery, listings
- **Pro** ($299/mo) — Everything in Growth + AI Phone Agent, AI Creative Studio, Accounting

## Your Tone
Be warm, concise, and professional. Keep replies under 80 words. Use bullet points when listing features. Never use emojis.
If asked about pricing specifics or custom enterprise plans, suggest contacting via the form on the page.

## Navigation
If a visitor asks to sign up, get started, create an account, or try Careful-Server, end your reply with exactly: [NAV:/signup]
If a visitor asks to log in, access their portal, or go to the owner dashboard, end your reply with exactly: [NAV:/portal/login]
Put the NAV tag on its own line at the very end. Only include it when the visitor explicitly wants to navigate somewhere."""


@router.post("/chat")
async def visitor_chat(body: VisitorChatReq):
    fallback = "Great question! Careful-Server is an AI-powered restaurant management platform. To learn more or get a demo, fill out the contact form below and we'll reach out within 24 hours!"

    if not settings.anthropic_api_key:
        return {"reply": fallback}

    # Anthropic requires conversations to start with a user message — drop any leading assistant turns
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    if not messages:
        return {"reply": fallback}

    log.info("Sending to Anthropic: %s", messages)
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 250,
                    "system": VISITOR_PROMPT,
                    "messages": messages,
                },
            )
            if not r.is_success:
                log.error("Anthropic %s: %s", r.status_code, r.text)
                return {"reply": fallback, "navigate": None}
            text = r.json()["content"][0]["text"]
            nav_match = re.search(r'\[NAV:([^\]]+)\]', text)
            navigate = nav_match.group(1) if nav_match else None
            clean = re.sub(r'\s*\[NAV:[^\]]+\]', '', text).strip()
            return {"reply": clean, "navigate": navigate}
    except Exception as e:
        log.error("Visitor chat error: %s", e)
        return {"reply": fallback}


# ── Self-service signup ───────────────────────────────────────────────────────

class SignupData(BaseModel):
    restaurant_name: str
    owner_email: str
    owner_password: str
    phone: Optional[str] = None
    city: Optional[str] = None
    plan: str = "starter"


@router.post("/signup")
async def public_signup(body: SignupData, db=Depends(get_db)):
    existing = await db.fetchrow("SELECT id FROM users WHERE email=$1", body.owner_email)
    if existing:
        raise HTTPException(409, "An account with this email already exists. Please sign in.")

    slug = re.sub(r"[^a-z0-9]+", "-", body.restaurant_name.lower()).strip("-")[:50] or "restaurant"
    if await db.fetchrow("SELECT id FROM tenants WHERE slug=$1", slug):
        slug += "-" + "".join(random.choices(string.ascii_lowercase + string.digits, k=5))

    row = await db.fetchrow(
        "INSERT INTO tenants (name, slug, plan, status) VALUES ($1,$2,$3,'active') RETURNING id, slug",
        body.restaurant_name, slug, body.plan,
    )
    tid = row["id"]

    await db.execute(
        "INSERT INTO users (email, password_hash, role, tenant_id) VALUES ($1,$2,'owner',$3)",
        body.owner_email, hash_password(body.owner_password), tid,
    )

    await provision_plan_features(tid, body.plan, db)

    return {"ok": True, "tenant_id": tid, "slug": row["slug"], "portal_url": f"/portal/{row['slug']}/login"}
