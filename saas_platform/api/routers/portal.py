from typing import Optional, Any
import json
import logging
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

log = logging.getLogger(__name__)
from datetime import date, timezone, datetime, timedelta
from db.database import get_db
from api.routers.auth import get_current_user
from core.security import hash_password
from core.config import settings
from integrations import meta as meta_api
from integrations import tiktok as tiktok_api
from integrations import youtube as youtube_api
from integrations import snapchat as snapchat_api
from integrations import pinterest as pinterest_api
from integrations import google_ads as google_api

router = APIRouter(prefix="/portal", tags=["portal"])


PORTAL_ROLES = {"owner", "admin", "manager", "marketing", "staff", "viewer"}

def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in PORTAL_ROLES:
        raise HTTPException(status_code=403, detail="Tenant access only")
    return current_user


def _require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


# ─── Features ─────────────────────────────────────────────────────────────────

@router.get("/features")
async def get_features(current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT feature FROM tenant_features WHERE tenant_id=$1 AND enabled=TRUE",
        current_user["tenant_id"],
    )
    return [r["feature"] for r in rows]


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def tenant_dashboard(current_user=Depends(_require_owner), db=Depends(get_db)):
    tenant_id = current_user["tenant_id"]
    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id = $1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    all_orders = await db.fetch(
        "SELECT * FROM tenant_orders WHERE tenant_id = $1 ORDER BY created_at DESC",
        tenant_id,
    )
    today_str = date.today().isoformat()
    today_orders  = [o for o in all_orders if str(o["created_at"])[:10] == today_str]
    today_revenue = sum(float(o["total"] or 0) for o in today_orders)
    total_revenue = sum(float(o["total"] or 0) for o in all_orders)

    menu_rows = await db.fetch(
        "SELECT COUNT(*) as cnt, COUNT(*) FILTER (WHERE available) as active FROM menu_items WHERE tenant_id = $1",
        tenant_id,
    )
    menu_row = dict(menu_rows[0]) if menu_rows else {"cnt": 0, "active": 0}

    features = await db.fetch(
        "SELECT feature FROM tenant_features WHERE tenant_id=$1 AND enabled=TRUE", tenant_id,
    )

    return {
        "tenant": {
            "id": tenant["id"], "name": tenant["name"], "slug": tenant["slug"],
            "plan": tenant["plan"], "status": tenant["status"],
        },
        "stats": {
            "today_orders":  len(today_orders),
            "today_revenue": round(today_revenue, 2),
            "total_orders":  len(all_orders),
            "total_revenue": round(total_revenue, 2),
            "menu_items":    menu_row["cnt"],
            "menu_active":   menu_row["active"],
        },
        "features": [r["feature"] for r in features],
        "recent_orders": [dict(o) for o in all_orders[:10]],
    }


# ─── Orders ───────────────────────────────────────────────────────────────────

@router.get("/orders")
async def portal_orders(limit: int = 50, current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM tenant_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2",
        current_user["tenant_id"], limit,
    )
    return [dict(r) for r in rows]


# ─── Menu (read for all owners) ───────────────────────────────────────────────

@router.get("/menu")
async def portal_menu(current_user=Depends(_require_owner), db=Depends(get_db)):
    rows = await db.fetch(
        "SELECT * FROM menu_items WHERE tenant_id = $1 ORDER BY category, name",
        current_user["tenant_id"],
    )
    return [dict(r) for r in rows]


# ─── Menu management (write — requires menu_management feature) ───────────────

class MenuItemBody(BaseModel):
    name: str
    category: str = "other"
    price: float
    description: Optional[str] = None
    available: bool = True


async def _check_menu_feature(tenant_id: int, db) -> None:
    row = await db.fetchrow(
        "SELECT enabled FROM tenant_features WHERE tenant_id=$1 AND feature='menu_management'",
        tenant_id,
    )
    if not row or not row["enabled"]:
        raise HTTPException(403, "Menu management not enabled for this account")


@router.post("/menu", status_code=201)
async def add_menu_item(body: MenuItemBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_menu_feature(tid, db)
    row = await db.fetchrow(
        "INSERT INTO menu_items (tenant_id, name, category, price, description, available) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        tid, body.name, body.category, body.price, body.description, body.available,
    )
    return dict(row)


@router.put("/menu/{item_id}")
async def update_menu_item(item_id: int, body: MenuItemBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    await _check_menu_feature(tid, db)
    row = await db.fetchrow(
        """UPDATE menu_items SET name=$1, category=$2, price=$3, description=$4, available=$5, updated_at=NOW()
           WHERE id=$6 AND tenant_id=$7 RETURNING *""",
        body.name, body.category, body.price, body.description, body.available, item_id, tid,
    )
    if not row:
        raise HTTPException(404, "Item not found")
    return dict(row)


@router.delete("/menu/{item_id}", status_code=204)
async def delete_menu_item(item_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    await db.execute(
        "DELETE FROM menu_items WHERE id=$1 AND tenant_id=$2",
        item_id, current_user["tenant_id"],
    )


# ─── Owner account creation ───────────────────────────────────────────────────

class CreateOwnerRequest(BaseModel):
    email: str
    password: str


@router.post("/tenants/{tenant_id}/users", status_code=201)
async def create_owner_user(
    tenant_id: int,
    body: CreateOwnerRequest,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    tenant = await db.fetchrow("SELECT id FROM tenants WHERE id = $1", tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    existing = await db.fetchrow("SELECT id FROM users WHERE email = $1", body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    row = await db.fetchrow(
        """INSERT INTO users (email, password_hash, role, tenant_id)
           VALUES ($1, $2, 'owner', $3) RETURNING id, email, role, tenant_id, created_at""",
        body.email, hash_password(body.password), tenant_id,
    )
    return dict(row)


# ─── Portal Customization ─────────────────────────────────────────────────────

class CustomizationBody(BaseModel):
    accent_color: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    welcome_msg: Optional[str] = None
    dark_mode: Optional[bool] = None


@router.get("/customization")
async def get_customization(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    row = await db.fetchrow("SELECT * FROM tenant_customization WHERE tenant_id=$1", tid)
    if not row:
        return {"accent_color": "#16a34a", "logo_url": "", "banner_url": "", "welcome_msg": "", "dark_mode": False}
    return dict(row)


@router.put("/customization")
async def save_customization(body: CustomizationBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    existing = await db.fetchrow("SELECT id FROM tenant_customization WHERE tenant_id=$1", tid)
    if existing:
        sets = []
        vals = []
        if body.accent_color is not None:
            sets.append(f"accent_color=${len(vals)+2}")
            vals.append(body.accent_color)
        if body.logo_url is not None:
            sets.append(f"logo_url=${len(vals)+2}")
            vals.append(body.logo_url)
        if body.banner_url is not None:
            sets.append(f"banner_url=${len(vals)+2}")
            vals.append(body.banner_url)
        if body.welcome_msg is not None:
            sets.append(f"welcome_msg=${len(vals)+2}")
            vals.append(body.welcome_msg)
        if body.dark_mode is not None:
            sets.append(f"dark_mode=${len(vals)+2}")
            vals.append(body.dark_mode)
        if sets:
            sets.append(f"updated_at=NOW()")
            await db.execute(
                f"UPDATE tenant_customization SET {', '.join(sets)} WHERE tenant_id=$1",
                tid, *vals,
            )
    else:
        await db.execute(
            """INSERT INTO tenant_customization (tenant_id, accent_color, logo_url, banner_url, welcome_msg, dark_mode)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            tid,
            body.accent_color or "#16a34a",
            body.logo_url or "",
            body.banner_url or "",
            body.welcome_msg or "",
            body.dark_mode or False,
        )
    row = await db.fetchrow("SELECT * FROM tenant_customization WHERE tenant_id=$1", tid)
    return dict(row)


# ─── AI Chat ──────────────────────────────────────────────────────────────────

class ChatMsg(BaseModel):
    role: str
    content: str
    image: Optional[str] = None  # base64 data URL e.g. "data:image/jpeg;base64,..."

class ChatRequest(BaseModel):
    messages: list[ChatMsg]

# ─── Tools available to the portal AI ────────────────────────────────────────

_TOOLS = [
    {
        "name": "navigate_to_page",
        "description": "Navigate the owner to a specific page in their portal. Use when they ask to go somewhere.",
        "input_schema": {
            "type": "object",
            "properties": {
                "page": {
                    "type": "string",
                    "enum": ["dashboard","orders","menu","ads","social","phone","creative","accounting","delivery","business"],
                }
            },
            "required": ["page"],
        },
    },
    {
        "name": "get_menu",
        "description": "Get the restaurant's current menu items to know what to promote or reference.",
        "input_schema": {
            "type": "object",
            "properties": {
                "available_only": {"type": "boolean", "description": "Only return currently available items"},
                "category": {"type": "string", "description": "Filter by category"},
            },
        },
    },
    {
        "name": "add_menu_item",
        "description": "Add a new item to the restaurant's menu.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name":        {"type": "string"},
                "price":       {"type": "number"},
                "category":    {"type": "string", "description": "e.g. appetizers, mains, drinks, desserts"},
                "description": {"type": "string"},
            },
            "required": ["name", "price"],
        },
    },
    {
        "name": "toggle_menu_item",
        "description": "Enable or disable a menu item by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name":      {"type": "string"},
                "available": {"type": "boolean"},
            },
            "required": ["name", "available"],
        },
    },
    {
        "name": "search_orders",
        "description": "Retrieve recent orders, optionally filtered by status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit":  {"type": "integer", "description": "Max orders to return (1–10)"},
                "status": {"type": "string",  "description": "pending | completed | cancelled"},
            },
        },
    },
    {
        "name": "get_connected_platforms",
        "description": "Check which social media and ad platforms are currently connected for this restaurant. Always call this before posting or launching campaigns.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_social_post",
        "description": "Publish a post directly to connected social media platforms (Meta/Instagram, TikTok, YouTube). Generates and posts the content autonomously.",
        "input_schema": {
            "type": "object",
            "properties": {
                "platforms": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["meta", "tiktok_content", "youtube"]},
                    "description": "Which platforms to post to",
                },
                "content": {"type": "string", "description": "The caption or post text to publish"},
                "image_url": {"type": "string", "description": "Public URL of an image to include"},
                "video_url": {"type": "string", "description": "Public URL of a video to include"},
                "link_url":  {"type": "string", "description": "Optional link URL"},
                "media_type": {
                    "type": "string",
                    "enum": ["feed", "reel", "story"],
                    "description": "Post format — feed (default), reel, or story",
                },
            },
            "required": ["platforms", "content"],
        },
    },
    {
        "name": "create_ad_campaign",
        "description": "Launch a paid ad campaign on a connected advertising platform. Creates the campaign, ad group, and ad automatically.",
        "input_schema": {
            "type": "object",
            "properties": {
                "platform": {
                    "type": "string",
                    "enum": ["meta", "google", "tiktok", "snapchat", "pinterest"],
                    "description": "Ad platform to run the campaign on",
                },
                "headline":        {"type": "string", "description": "Ad headline / campaign name"},
                "body":            {"type": "string", "description": "Ad body copy"},
                "budget_daily":    {"type": "number", "description": "Daily budget in USD (e.g. 10)"},
                "image_url":       {"type": "string", "description": "Ad image URL"},
                "destination_url": {"type": "string", "description": "Landing page or menu URL"},
            },
            "required": ["platform", "headline", "body", "budget_daily"],
        },
    },
]

def _fmt_messages(messages: list[ChatMsg]) -> list[dict]:
    """Convert ChatMsg list to Anthropic message format, supporting images."""
    result = []
    for m in messages:
        if m.image:
            try:
                header, data = m.image.split(",", 1)
                media_type = header.split(";")[0].split(":")[1]
            except Exception:
                media_type, data = "image/jpeg", m.image
            content: list[dict] = [{"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}}]
            if m.content:
                content.append({"type": "text", "text": m.content})
            result.append({"role": m.role, "content": content})
        else:
            result.append({"role": m.role, "content": m.content})
    return result

FEATURE_LABELS: dict[str, str] = {
    "ads_meta": "Meta Ads (Facebook & Instagram)",
    "ads_google": "Google Ads (Search & Display)",
    "ads_youtube": "YouTube Ads (Video Campaigns)",
    "ads_tiktok": "TikTok Ads (In-Feed Video)",
    "ads_snapchat": "Snapchat Ads (Story & Snap)",
    "ads_pinterest": "Pinterest Ads (Promoted Pins)",
    "social_meta": "Meta Social (post to Facebook & Instagram)",
    "social_youtube": "YouTube Social (upload channel videos)",
    "social_tiktok": "TikTok Social (posts & videos)",
    "listings_google": "Google Maps Business Listing",
    "listings_apple": "Apple Maps Business Listing",
    "phone_agent": "AI Phone Order Agent",
    "ai_creative": "AI Creative Studio (generate ad images & videos)",
    "accounting": "Accounting & Bookkeeping",
    "menu_management": "Menu Management",
    "delivery": "Delivery Integrations (DoorDash, Uber Eats, etc.)",
}

NAV_DESCRIPTIONS = {
    "ads": "Create and manage ad campaigns · go to /ads",
    "social": "Post content to social media · go to /social",
    "listings": "Manage Google Maps & Apple Maps listings · go to /business",
    "phone_agent": "Configure AI phone ordering · go to /phone",
    "ai_creative": "Generate AI ad images & videos · go to /creative",
    "accounting": "Track revenue and expenses · go to /accounting",
    "delivery": "Manage delivery integrations · go to /delivery",
    "menu_management": "Add, edit, and manage menu items · go to /menu",
}


@router.post("/chat")
async def portal_chat(
    body: ChatRequest,
    current_user=Depends(_require_owner),
    db=Depends(get_db),
):
    if not settings.anthropic_api_key:
        raise HTTPException(503, "AI chat not configured — add ANTHROPIC_API_KEY to Railway")

    tid = current_user["tenant_id"]

    tenant = await db.fetchrow("SELECT name, plan, slug, status FROM tenants WHERE id=$1", tid)
    stats = await db.fetchrow(
        """SELECT
             COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)          AS today_orders,
             COALESCE(SUM(total) FILTER (WHERE created_at::date = CURRENT_DATE), 0) AS today_revenue,
             COUNT(*)                                                           AS total_orders,
             COALESCE(SUM(total), 0)                                           AS total_revenue
           FROM tenant_orders WHERE tenant_id=$1""",
        tid,
    )
    menu = await db.fetchrow(
        "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE available) AS active FROM menu_items WHERE tenant_id=$1",
        tid,
    )
    feat_rows = await db.fetch(
        "SELECT feature FROM tenant_features WHERE tenant_id=$1 AND enabled=TRUE", tid
    )
    features = [r["feature"] for r in feat_rows]

    enabled_lines = "\n".join(
        f"  - {FEATURE_LABELS.get(f, f)}" for f in features
    ) or "  (none currently enabled)"

    has_ads      = any(f.startswith("ads_")      for f in features)
    has_social   = any(f.startswith("social_")   for f in features)
    has_listings = any(f.startswith("listings_") for f in features)

    nav_lines = "\n".join([
        "  - Dashboard: overview stats, platform connections · go to /dashboard",
        "  - Orders: view and manage incoming orders · go to /orders",
        "  - Menu: add and edit menu items · go to /menu",
        *(["  - Ads: run ad campaigns on connected platforms · go to /ads"] if has_ads else []),
        *(["  - Social: publish posts to social media · go to /social"] if has_social else []),
        *(["  - Listings: manage Google Maps & Apple Maps · go to /business"] if has_listings else []),
        *(["  - Phone Agent: configure AI phone ordering · go to /phone"] if "phone_agent" in features else []),
        *(["  - AI Creative: generate ad images & videos · go to /creative"] if "ai_creative" in features else []),
        *(["  - Accounting: track revenue & expenses · go to /accounting"] if "accounting" in features else []),
        *(["  - Delivery: delivery platform integrations · go to /delivery"] if "delivery" in features else []),
    ])

    system_prompt = f"""You are Joyce, an autonomous AI assistant inside the owner portal for {tenant['name']}, \
a restaurant on the Careful-Server platform. You have FULL ability to take action on the owner's behalf — \
you are not just an advisor, you are an executor. When the owner asks you to do something, DO IT using your tools.

## Restaurant
- Name: {tenant['name']}
- Plan: {tenant['plan']} · Status: {tenant['status']}
- Portal slug: {tenant['slug']}

## Live Business Stats
- Today's orders: {stats['today_orders']}
- Today's revenue: ${float(stats['today_revenue']):.2f}
- All-time orders: {stats['total_orders']}
- All-time revenue: ${float(stats['total_revenue']):.2f}
- Menu items: {menu['total']} total, {menu['active']} active

## Enabled Features
{enabled_lines}

## Portal Navigation
{nav_lines}

## What You Can Do Autonomously (Tools)
- **navigate_to_page** — take owner to any portal page
- **get_menu** — fetch menu items to know what to promote
- **add_menu_item** — add new items to the menu
- **toggle_menu_item** — enable/disable a menu item by name
- **search_orders** — fetch recent orders
- **get_connected_platforms** — check which social/ad platforms are connected
- **create_social_post** — ACTUALLY PUBLISH a post to Meta/Instagram, TikTok, or YouTube right now
- **create_ad_campaign** — ACTUALLY LAUNCH a paid ad campaign on Meta, Google, TikTok, Snapchat, or Pinterest

## How to Handle Requests
- "Post [X] to Instagram" → call get_connected_platforms, then create_social_post with a compelling caption you write
- "Run an ad for [X]" → call get_connected_platforms, then create_ad_campaign with ad copy you write
- "Add [item] to my menu" → call add_menu_item directly
- "Show me today's orders" → call search_orders

## Feedback Detection
If the user's message contains any of the following, it is platform feedback:
- Complaints, suggestions, feature requests, or improvements about Careful Server itself
- Comments on how easy/hard the system is to use
- Requests for new features or changes to existing ones
- General opinions about the platform, tools, or their experience

When you detect feedback, start your reply with the EXACT token `[FEEDBACK]` on its own line, then acknowledge it warmly and tell them their input can be submitted as formal feedback. Also mention they can always share more thoughts in this chat.

## Your Behavior
- **Take action immediately** — don't ask for permission to proceed on clear requests
- Write compelling, restaurant-specific captions when posting — use the restaurant name and menu context
- **Never use emojis** in any response, caption, ad copy, or message — maintain a professional tone throughout
- If platforms are not connected, tell the owner clearly and offer to take them to the connection page
- Chain multiple tools when needed (e.g. get menu → write caption → post)
- Be concise in replies — confirm what you did, not what you could do
- Keep replies under 120 words unless listing results"""

    messages = _fmt_messages(body.messages)
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    if not messages:
        return {"reply": "Hi! I can post to your social media, launch ad campaigns, manage your menu, and more — all automatically. What would you like me to do?", "navigate": None, "action_result": None}

    _headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    navigate: Optional[str] = None
    action_result: Optional[dict] = None
    current_messages = list(messages)

    try:
        async with httpx.AsyncClient(timeout=90) as c:
            # ── Agentic loop — up to 6 rounds of tool use ─────────────────────
            for _round in range(6):
                r = await c.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=_headers,
                    json={
                        "model": "claude-sonnet-4-6",
                        "max_tokens": 2048,
                        "system": system_prompt,
                        "messages": current_messages,
                        "tools": _TOOLS,
                    },
                )
                if not r.is_success:
                    log.error("Anthropic %s: %s", r.status_code, r.text)
                    return {"reply": "Sorry, I ran into an error. Please try again.", "navigate": None, "action_result": None}

                resp = r.json()
                tool_uses = [b for b in resp["content"] if b["type"] == "tool_use"]

                if not tool_uses:
                    text = "\n".join(b["text"] for b in resp["content"] if b["type"] == "text")
                    is_feedback = text.startswith("[FEEDBACK]")
                    clean_text  = text.removeprefix("[FEEDBACK]").strip()
                    return {"reply": clean_text, "navigate": navigate, "action_result": action_result, "is_feedback": is_feedback}

                # ── Execute all tools in this round ────────────────────────────
                tool_results = []
                for tu in tool_uses:
                    name  = tu["name"]
                    inp   = tu["input"]
                    tu_id = tu["id"]
                    result = ""

                    # ── Navigation ─────────────────────────────────────────────
                    if name == "navigate_to_page":
                        navigate = inp.get("page", "dashboard")
                        result = f"Navigating to {navigate}."

                    # ── Menu: get ──────────────────────────────────────────────
                    elif name == "get_menu":
                        q = "SELECT id,name,category,price,description,available FROM menu_items WHERE tenant_id=$1"
                        args: list = [tid]
                        if inp.get("available_only"):
                            q += " AND available=TRUE"
                        if inp.get("category"):
                            args.append(inp["category"])
                            q += f" AND LOWER(category)=LOWER(${len(args)})"
                        q += " ORDER BY category,name LIMIT 50"
                        rows = await db.fetch(q, *args)
                        if rows:
                            lines = [f"  - {r['name']} (${float(r['price']):.2f}, {r['category']}, {'✓' if r['available'] else '✗'})" for r in rows]
                            result = f"Menu ({len(rows)} items):\n" + "\n".join(lines)
                        else:
                            result = "No menu items found."

                    # ── Menu: add ──────────────────────────────────────────────
                    elif name == "add_menu_item":
                        try:
                            row = await db.fetchrow(
                                "INSERT INTO menu_items (tenant_id,name,category,price,description,available) "
                                "VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING *",
                                tid, inp["name"], inp.get("category", "other"),
                                float(inp.get("price", 0)), inp.get("description"),
                            )
                            action_result = {"type": "menu_item_added", "item": dict(row)}
                            result = f"Added '{row['name']}' at ${float(row['price']):.2f}."
                        except Exception as e:
                            result = f"Failed to add menu item: {e}"

                    # ── Menu: toggle ───────────────────────────────────────────
                    elif name == "toggle_menu_item":
                        item_name = inp.get("name", "")
                        avail = inp.get("available", True)
                        row = await db.fetchrow(
                            "UPDATE menu_items SET available=$1 WHERE tenant_id=$2 AND LOWER(name)=LOWER($3) RETURNING *",
                            avail, tid, item_name,
                        )
                        if row:
                            action_result = {"type": "menu_item_toggled", "item": dict(row)}
                            result = f"{'Enabled' if avail else 'Disabled'} '{row['name']}'."
                        else:
                            result = f"No menu item named '{item_name}' found."

                    # ── Orders ─────────────────────────────────────────────────
                    elif name == "search_orders":
                        limit = min(int(inp.get("limit", 5)), 10)
                        status = inp.get("status")
                        if status:
                            rows = await db.fetch(
                                "SELECT * FROM tenant_orders WHERE tenant_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT $3",
                                tid, status, limit,
                            )
                        else:
                            rows = await db.fetch(
                                "SELECT * FROM tenant_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2",
                                tid, limit,
                            )
                        orders = [dict(r) for r in rows]
                        if orders:
                            result = f"Found {len(orders)} orders: " + "; ".join(
                                f"#{o['id']} {o['status']} ${float(o.get('total') or 0):.2f}" for o in orders
                            )
                        else:
                            result = "No orders found."

                    # ── Platform connections ───────────────────────────────────
                    elif name == "get_connected_platforms":
                        rows = await db.fetch(
                            "SELECT platform, ad_account_id, connected_at FROM platform_connections WHERE tenant_id=$1",
                            tid,
                        )
                        if rows:
                            lines = [f"  - {r['platform']}: connected (account: {r['ad_account_id'] or 'n/a'})" for r in rows]
                            result = "Connected platforms:\n" + "\n".join(lines)
                        else:
                            result = "No platforms connected yet. Owner needs to connect them via the Ads or Social pages."
                        action_result = {"type": "platforms", "platforms": [r["platform"] for r in rows]}

                    # ── Social post ────────────────────────────────────────────
                    elif name == "create_social_post":
                        platforms_req = inp.get("platforms", [])
                        content = inp.get("content", "")
                        image_url = inp.get("image_url")
                        video_url = inp.get("video_url")
                        link_url = inp.get("link_url")
                        media_type = inp.get("media_type", "feed")

                        row = await db.fetchrow(
                            "INSERT INTO social_posts (tenant_id,platforms,content,image_url,link_url,status) "
                            "VALUES ($1,$2,$3,$4,$5,'publishing') RETURNING id",
                            tid, json.dumps(platforms_req), content, image_url or video_url, link_url,
                        )
                        post_id = row["id"]
                        post_results: dict = {}

                        for platform in platforms_req:
                            conn = await db.fetchrow(
                                "SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
                                tid, platform,
                            )
                            if not conn:
                                post_results[platform] = {"status": "not_connected"}
                                continue
                            try:
                                if platform == "meta":
                                    raw = (conn.get("refresh_token") or "")
                                    parts = raw.split(":", 2)
                                    if len(parts) == 3:
                                        page_id, page_token, ig_id = parts
                                    else:
                                        page_id = conn.get("ad_account_id", "")
                                        page_token = conn.get("access_token", "")
                                        ig_id = ""
                                    if media_type in ("reel", "story") and ig_id:
                                        pid = await meta_api.create_ig_post(page_token, ig_id, content, image_url=image_url, video_url=video_url, media_type=media_type)
                                    elif ig_id and (image_url or video_url):
                                        fb_pid = await meta_api.create_page_post(page_token or conn["access_token"], page_id, content, image_url, video_url, link_url)
                                        ig_pid = await meta_api.create_ig_post(page_token, ig_id, content, image_url=image_url, video_url=video_url)
                                        pid = f"fb:{fb_pid},ig:{ig_pid}"
                                    else:
                                        pid = await meta_api.create_page_post(page_token or conn["access_token"], page_id, content, image_url, video_url, link_url)
                                elif platform == "tiktok_content":
                                    pid = await tiktok_api.create_post(conn["access_token"], conn["ad_account_id"] or "", content, image_url=image_url, video_url=video_url)
                                elif platform == "youtube":
                                    pid = await youtube_api.create_post(conn["access_token"], conn["ad_account_id"] or "", content, video_url or image_url)
                                else:
                                    post_results[platform] = {"status": "not_supported"}
                                    continue
                                post_results[platform] = {"status": "published", "id": pid}
                            except Exception as e:
                                log.error("Chat social post failed [%s]: %s", platform, e)
                                post_results[platform] = {"status": "failed", "error": str(e)[:200]}

                        ok = [p for p, r_ in post_results.items() if r_["status"] == "published"]
                        final_status = "published" if ok else ("partial" if post_results else "failed")
                        await db.execute(
                            "UPDATE social_posts SET status=$1, platform_results=$2 WHERE id=$3",
                            final_status, json.dumps(post_results), post_id,
                        )
                        action_result = {"type": "social_post", "post_id": post_id, "results": post_results}
                        if ok:
                            result = f"Posted to {', '.join(ok)}. Post ID: {post_id}."
                            not_ok = [p for p in platforms_req if p not in ok]
                            if not_ok:
                                result += f" Failed: {', '.join(not_ok)}."
                        else:
                            errors = {p: v.get("error", v.get("status")) for p, v in post_results.items()}
                            result = f"Post failed on all platforms. Details: {errors}"

                    # ── Ad campaign ────────────────────────────────────────────
                    elif name == "create_ad_campaign":
                        platform = inp.get("platform", "")
                        headline = inp.get("headline", "")
                        body_text = inp.get("body", "")
                        budget = float(inp.get("budget_daily", 10))
                        image_url = inp.get("image_url")
                        destination_url = inp.get("destination_url", "")

                        conn = await db.fetchrow(
                            "SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
                            tid, platform,
                        )
                        if not conn:
                            result = f"{platform} is not connected. Owner needs to connect it in the Ads page first."
                        else:
                            campaign = {
                                "headline": headline,
                                "body": body_text,
                                "budget_daily": budget,
                                "image_url": image_url,
                                "destination_url": destination_url,
                            }
                            try:
                                if platform == "meta":
                                    camp_id = await meta_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                elif platform == "google":
                                    camp_id = await google_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                elif platform == "tiktok":
                                    camp_id = await tiktok_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                elif platform == "snapchat":
                                    camp_id = await snapchat_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                elif platform == "pinterest":
                                    camp_id = await pinterest_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                else:
                                    camp_id = None

                                if camp_id:
                                    await db.execute(
                                        "INSERT INTO ad_campaigns (tenant_id,platform,status,headline,body,image_url,destination_url,cta,budget_daily,location,radius_miles,start_date,end_date,error_message,platform_campaign_id) "
                                        "VALUES ($1,$2,'active',$3,$4,$5,$6,'LEARN_MORE',$7,NULL,10,NULL,NULL,NULL,$8)",
                                        tid, platform, headline, body_text, image_url, destination_url, budget, str(camp_id),
                                    )
                                    action_result = {"type": "ad_campaign", "platform": platform, "campaign_id": camp_id}
                                    result = f"Launched {platform} campaign '{headline}' at ${budget}/day. Campaign ID: {camp_id}."
                                else:
                                    result = f"Campaign creation returned no ID for {platform}."
                            except Exception as e:
                                log.error("Chat ad campaign failed [%s]: %s", platform, e)
                                result = f"Campaign launch failed on {platform}: {str(e)[:300]}"

                    tool_results.append({"type": "tool_result", "tool_use_id": tu_id, "content": result})

                # ── Append this round and continue ─────────────────────────────
                current_messages.append({"role": "assistant", "content": resp["content"]})
                current_messages.append({"role": "user", "content": tool_results})

            # Fallback after max rounds
            return {"reply": "I've completed the requested actions.", "navigate": navigate, "action_result": action_result, "is_feedback": False}

    except Exception as e:
        log.error("Portal chat error: %s", e)
        return {"reply": "Sorry, I ran into an error. Please try again.", "navigate": None, "action_result": None}


# ─── Analytics ───────────────────────────────────────────────────────────────

@router.get("/analytics")
async def portal_analytics(current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]

    # 30-day daily orders + revenue
    rows = await db.fetch(
        """SELECT created_at::date AS day,
                  COUNT(*) AS orders,
                  COALESCE(SUM(total), 0) AS revenue
           FROM tenant_orders
           WHERE tenant_id=$1 AND created_at >= CURRENT_DATE - INTERVAL '29 days'
           GROUP BY created_at::date
           ORDER BY day""",
        tid,
    )
    daily_map = {str(r["day"]): {"orders": int(r["orders"]), "revenue": float(r["revenue"])} for r in rows}
    today = date.today()
    daily = []
    for i in range(29, -1, -1):
        d   = today - timedelta(days=i)
        ds  = str(d)
        entry = daily_map.get(ds, {"orders": 0, "revenue": 0.0})
        daily.append({"date": ds, "label": d.strftime("%b %d"), "short": d.strftime("%d"),
                      "orders": entry["orders"], "revenue": entry["revenue"]})

    # Order source breakdown (all time)
    sources = await db.fetch(
        "SELECT order_source, COUNT(*) AS count FROM tenant_orders WHERE tenant_id=$1 GROUP BY order_source ORDER BY count DESC",
        tid,
    )

    # Week-over-week
    this_week = await db.fetchrow(
        """SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
           FROM tenant_orders WHERE tenant_id=$1
           AND created_at >= date_trunc('week', CURRENT_DATE)""",
        tid,
    )
    last_week = await db.fetchrow(
        """SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
           FROM tenant_orders WHERE tenant_id=$1
           AND created_at >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 days'
           AND created_at < date_trunc('week', CURRENT_DATE)""",
        tid,
    )

    return {
        "daily": daily,
        "sources": [{"source": r["order_source"], "count": int(r["count"])} for r in sources],
        "this_week": {"orders": int(this_week["orders"]), "revenue": float(this_week["revenue"])},
        "last_week": {"orders": int(last_week["orders"]), "revenue": float(last_week["revenue"])},
    }


# ─── Team Management ──────────────────────────────────────────────────────────

TEAM_ROLES = ["manager", "marketing", "staff", "viewer"]

ROLE_DEFAULT_PERMISSIONS: dict[str, list[str]] = {
    "manager":   ["dashboard", "orders", "menu", "ads", "social", "accounting", "delivery", "business", "phone", "creative"],
    "marketing": ["dashboard", "ads", "social", "creative"],
    "staff":     ["dashboard", "orders", "menu"],
    "viewer":    ["dashboard"],
}

class TeamMemberCreate(BaseModel):
    display_name: str
    email: str
    password: str
    role: str = "staff"
    permissions: list[str] = []

class TeamMemberUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[list[str]] = None
    is_active: Optional[bool] = None


def _team_row(row: dict) -> dict:
    import json
    return {
        "id":           row["id"],
        "display_name": row.get("display_name") or "",
        "email":        row["email"],
        "role":         row["role"],
        "permissions":  json.loads(row.get("permissions") or "[]"),
        "is_active":    True,  # active unless explicitly deactivated via status
        "created_at":   str(row["created_at"]),
    }


@router.get("/tenants/{tenant_id}/team")
async def list_team(tenant_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    rows = await db.fetch(
        """SELECT id, display_name, email, role, permissions, created_at
           FROM users WHERE tenant_id=$1 AND role != 'owner'
           ORDER BY created_at""",
        tenant_id,
    )
    return [_team_row(dict(r)) for r in rows]


@router.post("/tenants/{tenant_id}/team", status_code=201)
async def create_team_member(
    tenant_id: int,
    body: TeamMemberCreate,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    import json
    if body.role not in TEAM_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(TEAM_ROLES)}")
    tenant = await db.fetchrow("SELECT id FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    existing = await db.fetchrow("SELECT id FROM users WHERE email=$1", body.email)
    if existing:
        raise HTTPException(400, "Email already in use")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    perms = body.permissions if body.permissions else ROLE_DEFAULT_PERMISSIONS.get(body.role, [])
    row = await db.fetchrow(
        """INSERT INTO users (email, password_hash, role, tenant_id, display_name, permissions)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, display_name, email, role, permissions, created_at""",
        body.email, hash_password(body.password), body.role, tenant_id,
        body.display_name, json.dumps(perms),
    )
    return _team_row(dict(row))


@router.patch("/tenants/{tenant_id}/team/{user_id}")
async def update_team_member(
    tenant_id: int,
    user_id: int,
    body: TeamMemberUpdate,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    import json
    row = await db.fetchrow(
        "SELECT * FROM users WHERE id=$1 AND tenant_id=$2 AND role != 'owner'",
        user_id, tenant_id,
    )
    if not row:
        raise HTTPException(404, "Team member not found")
    sets, vals = [], []
    if body.display_name is not None:
        sets.append(f"display_name=${len(vals)+2}"); vals.append(body.display_name)
    if body.role is not None:
        if body.role not in TEAM_ROLES:
            raise HTTPException(400, f"Role must be one of: {', '.join(TEAM_ROLES)}")
        sets.append(f"role=${len(vals)+2}"); vals.append(body.role)
    if body.permissions is not None:
        sets.append(f"permissions=${len(vals)+2}"); vals.append(json.dumps(body.permissions))
    if sets:
        await db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=$1", user_id, *vals)
    updated = await db.fetchrow("SELECT id, display_name, email, role, permissions, created_at FROM users WHERE id=$1", user_id)
    return _team_row(dict(updated))


@router.delete("/tenants/{tenant_id}/team/{user_id}", status_code=204)
async def delete_team_member(
    tenant_id: int,
    user_id: int,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    row = await db.fetchrow(
        "SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND role != 'owner'",
        user_id, tenant_id,
    )
    if not row:
        raise HTTPException(404, "Team member not found")
    await db.execute("DELETE FROM users WHERE id=$1", user_id)


# ─── Owner accounts listing ───────────────────────────────────────────────────

@router.get("/tenants/{tenant_id}/owner-accounts")
async def list_owner_accounts(
    tenant_id: int,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    rows = await db.fetch(
        """SELECT id, email, display_name, role, created_at
           FROM users WHERE tenant_id=$1 AND role='owner'
           ORDER BY created_at""",
        tenant_id,
    )
    return [
        {
            "id": r["id"],
            "email": r["email"],
            "display_name": r.get("display_name") or "",
            "role": r["role"],
            "created_at": str(r["created_at"]),
        }
        for r in rows
    ]


# ─── Admin password reset for any tenant user ─────────────────────────────────

class UserPasswordReset(BaseModel):
    new_password: str


@router.patch("/tenants/{tenant_id}/users/{user_id}/password")
async def admin_reset_user_password(
    tenant_id: int,
    user_id: int,
    body: UserPasswordReset,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    row = await db.fetchrow(
        "SELECT id FROM users WHERE id=$1 AND tenant_id=$2", user_id, tenant_id,
    )
    if not row:
        raise HTTPException(404, "User not found in this tenant")
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    await db.execute(
        "UPDATE users SET password_hash=$1 WHERE id=$2",
        hash_password(body.new_password), user_id,
    )
    return {"ok": True}
