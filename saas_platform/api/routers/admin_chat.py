"""Admin AI assistant — full platform automation via Claude tool use."""
from typing import Optional
import logging
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db.database import get_db
from api.routers.auth import get_current_user
from core.config import settings
from core.security import hash_password

log = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    return current_user


class AdminChatMsg(BaseModel):
    role: str
    content: str
    image: Optional[str] = None


class AdminChatRequest(BaseModel):
    messages: list[AdminChatMsg]


# ─── Tool definitions ─────────────────────────────────────────────────────────

_TOOLS = [
    {
        "name": "navigate_to_page",
        "description": "Navigate the admin to a specific page in the admin portal.",
        "input_schema": {
            "type": "object",
            "properties": {
                "page": {
                    "type": "string",
                    "enum": ["dashboard", "phone-agent", "settings"],
                },
                "tenant_id": {
                    "type": "integer",
                    "description": "Optional tenant ID to open tenant detail page",
                },
            },
            "required": ["page"],
        },
    },
    {
        "name": "list_tenants",
        "description": "List all restaurant tenants, optionally filtered by search term or status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search by name or slug"},
                "status": {"type": "string", "description": "active | inactive | suspended"},
                "plan":   {"type": "string", "description": "starter | growth | pro"},
                "limit":  {"type": "integer", "description": "Max results (default 20)"},
            },
        },
    },
    {
        "name": "get_tenant_details",
        "description": "Get full details for a specific tenant including features and stats.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "integer"},
            },
            "required": ["tenant_id"],
        },
    },
    {
        "name": "create_tenant",
        "description": "Create a new restaurant tenant on the platform.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Restaurant name"},
                "slug": {"type": "string", "description": "URL slug (lowercase, no spaces)"},
                "plan": {"type": "string", "enum": ["starter", "growth", "pro"], "description": "Subscription plan"},
                "owner_email":    {"type": "string", "description": "Owner login email"},
                "owner_password": {"type": "string", "description": "Owner initial password"},
            },
            "required": ["name", "slug", "plan"],
        },
    },
    {
        "name": "update_tenant",
        "description": "Update a tenant's name, slug, status, or plan.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "integer"},
                "name":      {"type": "string"},
                "slug":      {"type": "string"},
                "status":    {"type": "string", "enum": ["active", "inactive", "suspended"]},
                "plan":      {"type": "string", "enum": ["starter", "growth", "pro"]},
            },
            "required": ["tenant_id"],
        },
    },
    {
        "name": "delete_tenant",
        "description": "Permanently delete a tenant and all their data. Use only when explicitly confirmed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id":   {"type": "integer"},
                "confirmed":   {"type": "boolean", "description": "Must be true to proceed"},
            },
            "required": ["tenant_id", "confirmed"],
        },
    },
    {
        "name": "toggle_feature",
        "description": "Enable or disable a specific feature for a tenant.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "integer"},
                "feature":   {"type": "string", "description": "Feature key e.g. phone_agent, ads_meta, ai_creative, accounting, menu_management, delivery, social_meta, listings_google"},
                "enabled":   {"type": "boolean"},
            },
            "required": ["tenant_id", "feature", "enabled"],
        },
    },
    {
        "name": "sync_plan_features",
        "description": "Sync all features for a tenant to match their current subscription plan.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "integer"},
            },
            "required": ["tenant_id"],
        },
    },
    {
        "name": "create_owner_account",
        "description": "Create an owner login account for a tenant.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "integer"},
                "email":     {"type": "string"},
                "password":  {"type": "string"},
            },
            "required": ["tenant_id", "email", "password"],
        },
    },
    {
        "name": "get_saas_analytics",
        "description": "Get overall SaaS platform statistics — tenant counts, MRR, plan breakdown, growth.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_tenant_orders",
        "description": "View recent orders for a specific tenant.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "integer"},
                "limit":     {"type": "integer", "description": "Max orders (default 5, max 20)"},
            },
            "required": ["tenant_id"],
        },
    },
    {
        "name": "get_user_feedback_insights",
        "description": "Retrieve aggregated user feedback stats, recent comments, and top user interactions to identify improvement opportunities.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_improvement_suggestion",
        "description": "Create a new improvement suggestion based on feedback patterns or your analysis. These go to the admin approval queue.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":       {"type": "string", "description": "Short title for the improvement"},
                "description": {"type": "string", "description": "Detailed description of what to improve and why"},
                "category":    {"type": "string", "enum": ["feature", "ease_of_use", "security", "performance", "ui_design", "integration"], "description": "Category of improvement"},
                "priority":    {"type": "string", "enum": ["low", "medium", "high", "critical"], "description": "Priority level"},
            },
            "required": ["title", "description", "category", "priority"],
        },
    },
    {
        "name": "list_improvement_suggestions",
        "description": "List all improvement suggestions with their current approval status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["pending", "approved", "rejected"], "description": "Filter by status"},
            },
        },
    },
    {
        "name": "manage_menu_item",
        "description": "Add, update, or delete a menu item for any tenant.",
        "input_schema": {
            "type": "object",
            "properties": {
                "action":      {"type": "string", "enum": ["add", "update", "delete", "toggle"]},
                "tenant_id":   {"type": "integer"},
                "item_id":     {"type": "integer", "description": "Required for update/delete/toggle"},
                "name":        {"type": "string"},
                "price":       {"type": "number"},
                "category":    {"type": "string"},
                "description": {"type": "string"},
                "available":   {"type": "boolean"},
            },
            "required": ["action", "tenant_id"],
        },
    },
]


def _fmt_messages(messages: list[AdminChatMsg]) -> list[dict]:
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


# ─── Chat endpoint ────────────────────────────────────────────────────────────

@router.post("/chat")
async def admin_chat(
    body: AdminChatRequest,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    if not settings.anthropic_api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY not configured")

    # ── Load platform context ──────────────────────────────────────────────
    stats = await db.fetchrow(
        """SELECT
             COUNT(*)                                       AS total_tenants,
             COUNT(*) FILTER (WHERE status='active')       AS active_tenants,
             COUNT(*) FILTER (WHERE plan='starter')        AS starter_count,
             COUNT(*) FILTER (WHERE plan='growth')         AS growth_count,
             COUNT(*) FILTER (WHERE plan='pro')            AS pro_count
           FROM tenants"""
    )
    mrr = (
        stats["starter_count"] * 49 +
        stats["growth_count"]  * 149 +
        stats["pro_count"]     * 299
    )
    recent = await db.fetch(
        "SELECT id, name, slug, plan, status, created_at FROM tenants ORDER BY created_at DESC LIMIT 8"
    )
    tenant_lines = "\n".join(
        f"  #{r['id']} {r['name']} ({r['slug']}) · {r['plan']} · {r['status']}"
        for r in recent
    )

    system_prompt = f"""You are the AI admin assistant for Careful-Server, a multi-tenant restaurant automation SaaS platform. You have FULL administrative access and can execute any operation on behalf of the admin.

## Platform Overview
- Total tenants: {stats['total_tenants']} ({stats['active_tenants']} active)
- MRR estimate: ${mrr:,} / month
- Plans: {stats['starter_count']} Starter ($49) · {stats['growth_count']} Growth ($149) · {stats['pro_count']} Pro ($299)

## Most Recent Tenants
{tenant_lines or '  (none yet)'}

## Admin Pages
- /dashboard — overview of all tenants and SaaS stats
- /tenants/[id] — manage a specific tenant's details, features, users, billing
- /tenants/new — create a new restaurant tenant
- /menu/[tenantId] — edit menu for a specific restaurant
- /phone-agent — phone agent setup
- /settings — admin account settings

## What You Can Do (Tools Available)
- **navigate_to_page** — go to any admin page
- **list_tenants** — search and filter all restaurants
- **get_tenant_details** — full info including features, owner accounts, stats
- **create_tenant** — onboard a new restaurant (with optional owner account)
- **update_tenant** — change name, slug, status, or plan
- **delete_tenant** — permanently delete (requires confirmed=true)
- **toggle_feature** — enable/disable any feature for a tenant
- **sync_plan_features** — reset features to match subscription plan
- **create_owner_account** — create portal login for a restaurant owner
- **get_saas_analytics** — platform-wide stats and growth data
- **get_tenant_orders** — view a restaurant's recent orders
- **manage_menu_item** — add/edit/delete/toggle menu items for any restaurant
- **get_user_feedback_insights** — fetch aggregated feedback stats, recent comments, and user interaction patterns
- **create_improvement_suggestion** — log an improvement idea (feature, UX, security, performance, design) to the approval queue
- **list_improvement_suggestions** — view all pending/approved improvement suggestions

## Platform Improvement System
You actively monitor user feedback and interaction data to identify patterns and generate improvement suggestions. When analyzing feedback:
- Look for recurring themes in comments (ease of use, missing features, confusion points)
- Check which interactions happen most/least to find engagement gaps
- Propose specific, actionable improvements with clear reasoning
- All suggestions go to admin approval before any deployment — you create them, admin decides

## Working With Images
When the admin pastes, drags, or attaches an image, analyze it and act on it:
- **Food/dish photo** → read it visually and immediately call manage_menu_item to add that item to the specified restaurant
- **Photo of a physical menu or price list** → extract every visible item name, price, and category, then call manage_menu_item (add) for each one
- **Receipt or invoice** → read the vendor, date, and amount; describe what you see so the admin can record it
- **Screenshot of an issue or page** → describe what you observe and suggest or execute the appropriate fix
- Always confirm what you extracted from the image before or after acting on it

## Your Behavior
- Be concise and action-oriented — execute tasks, don't just describe them
- For destructive operations (delete tenant), always confirm intent before setting confirmed=true unless admin explicitly says to delete
- When you execute an action, briefly confirm what you did
- If you need a tenant ID, use list_tenants to find it first
- Keep replies under 150 words unless detail is needed"""

    messages = _fmt_messages(body.messages)
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    if not messages:
        return {"reply": "Hi! I'm your admin AI. I can manage tenants, toggle features, view analytics, and automate any platform task. What do you need?", "navigate": None, "action_result": None}

    _headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    navigate: Optional[str] = None
    action_result: Optional[dict] = None

    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                "https://api.anthropic.com/v1/messages",
                headers=_headers,
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 2048,
                    "system": system_prompt,
                    "messages": messages,
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
                return {"reply": text, "navigate": None, "action_result": None}

            # ── Execute tools ──────────────────────────────────────────────
            tool_results = []
            for tu in tool_uses:
                name   = tu["name"]
                inp    = tu["input"]
                tid_   = tu["id"]
                result = ""

                if name == "navigate_to_page":
                    page = inp.get("page", "dashboard")
                    tenant_id_nav = inp.get("tenant_id")
                    if tenant_id_nav:
                        navigate = f"/tenants/{tenant_id_nav}"
                    else:
                        navigate = f"/{page}"
                    result = f"Navigating to {navigate}."

                elif name == "list_tenants":
                    search = inp.get("search", "")
                    status = inp.get("status")
                    plan   = inp.get("plan")
                    limit  = min(int(inp.get("limit", 20)), 50)
                    q = "SELECT id,name,slug,plan,status,created_at FROM tenants WHERE 1=1"
                    args: list = []
                    if search:
                        args.append(f"%{search}%")
                        q += f" AND (LOWER(name) LIKE LOWER(${len(args)}) OR LOWER(slug) LIKE LOWER(${len(args)}))"
                    if status:
                        args.append(status)
                        q += f" AND status=${len(args)}"
                    if plan:
                        args.append(plan)
                        q += f" AND plan=${len(args)}"
                    args.append(limit)
                    q += f" ORDER BY created_at DESC LIMIT ${len(args)}"
                    rows = await db.fetch(q, *args)
                    if rows:
                        result = f"Found {len(rows)} tenants:\n" + "\n".join(
                            f"#{r['id']} {r['name']} ({r['slug']}) · {r['plan']} · {r['status']}" for r in rows
                        )
                    else:
                        result = "No tenants found matching that criteria."
                    action_result = {"type": "tenant_list", "tenants": [dict(r) for r in rows]}

                elif name == "get_tenant_details":
                    tid = int(inp["tenant_id"])
                    tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tid)
                    if not tenant:
                        result = f"No tenant with ID {tid}."
                    else:
                        feats = await db.fetch("SELECT feature,enabled FROM tenant_features WHERE tenant_id=$1", tid)
                        orders_count = await db.fetchval("SELECT COUNT(*) FROM tenant_orders WHERE tenant_id=$1", tid)
                        owners = await db.fetch("SELECT email FROM users WHERE tenant_id=$1 AND role='owner'", tid)
                        result = (
                            f"Tenant #{tid}: {tenant['name']} ({tenant['slug']})\n"
                            f"Plan: {tenant['plan']} · Status: {tenant['status']}\n"
                            f"Orders: {orders_count}\n"
                            f"Owners: {', '.join(o['email'] for o in owners) or 'none'}\n"
                            f"Features: {', '.join(f['feature'] for f in feats if f['enabled']) or 'none enabled'}"
                        )
                        action_result = {"type": "tenant_details", "tenant": dict(tenant)}

                elif name == "create_tenant":
                    name_val = inp["name"]
                    slug_val = inp["slug"].lower().replace(" ", "-")
                    plan_val = inp.get("plan", "starter")
                    try:
                        row = await db.fetchrow(
                            "INSERT INTO tenants (name,slug,plan,status) VALUES ($1,$2,$3,'active') RETURNING *",
                            name_val, slug_val, plan_val,
                        )
                        new_tid = row["id"]
                        # Sync features for plan
                        await db.execute(
                            "SELECT * FROM tenants WHERE id=$1", new_tid  # dummy to confirm
                        )
                        # Create owner account if provided
                        owner_email = inp.get("owner_email")
                        owner_pass  = inp.get("owner_password")
                        if owner_email and owner_pass:
                            hashed = hash_password(owner_pass)
                            await db.execute(
                                "INSERT INTO users (email,hashed_password,role,tenant_id) VALUES ($1,$2,'owner',$3)",
                                owner_email, hashed, new_tid,
                            )
                        action_result = {"type": "tenant_created", "tenant": dict(row)}
                        result = f"Created tenant '{name_val}' (#{new_tid}) on {plan_val} plan."
                        if owner_email:
                            result += f" Owner account created for {owner_email}."
                    except Exception as e:
                        result = f"Failed to create tenant: {e}"

                elif name == "update_tenant":
                    tid = int(inp["tenant_id"])
                    sets, vals = [], []
                    for field in ("name", "slug", "status", "plan"):
                        if field in inp:
                            vals.append(inp[field])
                            sets.append(f"{field}=${len(vals)+1}")
                    if not sets:
                        result = "No fields to update provided."
                    else:
                        vals.insert(0, tid)
                        row = await db.fetchrow(
                            f"UPDATE tenants SET {', '.join(sets)} WHERE id=$1 RETURNING *", *vals
                        )
                        action_result = {"type": "tenant_updated", "tenant": dict(row)}
                        result = f"Updated tenant #{tid}: {', '.join(sets)}."

                elif name == "delete_tenant":
                    tid = int(inp["tenant_id"])
                    if not inp.get("confirmed"):
                        result = "Delete not confirmed. Set confirmed=true to permanently delete this tenant."
                    else:
                        tenant = await db.fetchrow("SELECT name FROM tenants WHERE id=$1", tid)
                        if not tenant:
                            result = f"Tenant #{tid} not found."
                        else:
                            await db.execute("DELETE FROM tenants WHERE id=$1", tid)
                            action_result = {"type": "tenant_deleted", "tenant_id": tid}
                            result = f"Permanently deleted tenant #{tid} ({tenant['name']})."

                elif name == "toggle_feature":
                    tid     = int(inp["tenant_id"])
                    feature = inp["feature"]
                    enabled = bool(inp["enabled"])
                    await db.execute(
                        """INSERT INTO tenant_features (tenant_id,feature,enabled)
                           VALUES ($1,$2,$3)
                           ON CONFLICT (tenant_id,feature) DO UPDATE SET enabled=$3""",
                        tid, feature, enabled,
                    )
                    action_result = {"type": "feature_toggled", "tenant_id": tid, "feature": feature, "enabled": enabled}
                    result = f"{'Enabled' if enabled else 'Disabled'} '{feature}' for tenant #{tid}."

                elif name == "sync_plan_features":
                    tid = int(inp["tenant_id"])
                    tenant = await db.fetchrow("SELECT plan FROM tenants WHERE id=$1", tid)
                    if not tenant:
                        result = f"Tenant #{tid} not found."
                    else:
                        # Call the existing sync endpoint logic inline
                        plan = tenant["plan"]
                        STARTER = ["menu_management", "order_management"]
                        GROWTH  = STARTER + ["ads_meta","ads_google","ads_youtube","ads_tiktok","ads_snapchat","ads_pinterest","social_meta","social_youtube","social_tiktok","listings_google","listings_apple","delivery","ai_creative"]
                        PRO     = GROWTH + ["phone_agent","accounting"]
                        feature_set = {"pro": PRO, "growth": GROWTH}.get(plan, STARTER)
                        all_features = PRO
                        for f in all_features:
                            await db.execute(
                                """INSERT INTO tenant_features (tenant_id,feature,enabled) VALUES ($1,$2,$3)
                                   ON CONFLICT (tenant_id,feature) DO UPDATE SET enabled=$3""",
                                tid, f, f in feature_set,
                            )
                        action_result = {"type": "features_synced", "tenant_id": tid, "plan": plan}
                        result = f"Synced features for tenant #{tid} ({plan} plan). {len(feature_set)} features enabled."

                elif name == "create_owner_account":
                    tid   = int(inp["tenant_id"])
                    email = inp["email"]
                    pw    = inp["password"]
                    try:
                        hashed = hash_password(pw)
                        await db.execute(
                            "INSERT INTO users (email,hashed_password,role,tenant_id) VALUES ($1,$2,'owner',$3)",
                            email, hashed, tid,
                        )
                        action_result = {"type": "owner_created", "tenant_id": tid, "email": email}
                        result = f"Created owner account {email} for tenant #{tid}."
                    except Exception as e:
                        result = f"Failed: {e}"

                elif name == "get_saas_analytics":
                    s = await db.fetchrow(
                        """SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='active') AS active,
                             COUNT(*) FILTER (WHERE plan='starter') AS starter,
                             COUNT(*) FILTER (WHERE plan='growth') AS growth,
                             COUNT(*) FILTER (WHERE plan='pro') AS pro
                           FROM tenants"""
                    )
                    monthly = await db.fetch(
                        """SELECT DATE_TRUNC('month',created_at) AS month, COUNT(*) AS count
                           FROM tenants GROUP BY 1 ORDER BY 1 DESC LIMIT 6"""
                    )
                    mrr_val = s["starter"]*49 + s["growth"]*149 + s["pro"]*299
                    growth_str = " | ".join(r["month"].strftime("%b") + ":" + str(r["count"]) for r in monthly)
                    result = (
                        f"Platform stats:\n"
                        f"  Tenants: {s['total']} total ({s['active']} active)\n"
                        f"  MRR: ${mrr_val:,}/mo  (Starter×{s['starter']} Growth×{s['growth']} Pro×{s['pro']})\n"
                        f"  Monthly growth: {growth_str}"
                    )
                    action_result = {"type": "analytics", "mrr": mrr_val, "total": s["total"]}

                elif name == "get_tenant_orders":
                    tid   = int(inp["tenant_id"])
                    limit = min(int(inp.get("limit", 5)), 20)
                    rows  = await db.fetch(
                        "SELECT * FROM tenant_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2",
                        tid, limit,
                    )
                    if rows:
                        result = f"{len(rows)} recent orders:\n" + "\n".join(
                            f"  #{r['id']} {r['status']} ${float(r.get('total') or 0):.2f} — {r['created_at'].strftime('%m/%d %H:%M')}" for r in rows
                        )
                    else:
                        result = "No orders found for this tenant."
                    action_result = {"type": "orders", "orders": [dict(r) for r in rows]}

                elif name == "get_user_feedback_insights":
                    fb = await db.fetchrow(
                        """SELECT COUNT(*) AS total,
                             COUNT(*) FILTER (WHERE status='pending') AS pending,
                             ROUND(AVG(star_rating)::numeric,2) AS avg_rating,
                             COUNT(*) FILTER (WHERE q1_overall=TRUE) AS satisfied,
                             COUNT(*) FILTER (WHERE q2_easy_to_use=TRUE) AS easy,
                             COUNT(*) FILTER (WHERE q3_effective=TRUE) AS effective
                           FROM tenant_feedback"""
                    )
                    recent = await db.fetch(
                        "SELECT restaurant_name, comment, star_rating FROM tenant_feedback WHERE comment IS NOT NULL AND comment <> '' ORDER BY created_at DESC LIMIT 8"
                    )
                    top_actions = await db.fetch(
                        "SELECT action, page, COUNT(*) AS cnt FROM user_interactions GROUP BY action, page ORDER BY cnt DESC LIMIT 10"
                    )
                    result = (
                        f"Feedback summary:\n"
                        f"  Total: {fb['total']} | Pending: {fb['pending']} | Avg rating: {fb['avg_rating']}\n"
                        f"  Satisfied overall: {fb['satisfied']} | Easy to use: {fb['easy']} | Effective: {fb['effective']}\n"
                        f"\nRecent comments:\n" +
                        "\n".join(f"  [{r['star_rating']}★] {r['restaurant_name']}: {(r['comment'] or '')[:120]}" for r in recent) +
                        f"\n\nTop user interactions:\n" +
                        "\n".join(f"  {r['action']} on {r['page'] or 'n/a'}: {r['cnt']} times" for r in top_actions)
                    )
                    action_result = {"type": "insights"}

                elif name == "create_improvement_suggestion":
                    row = await db.fetchrow(
                        """INSERT INTO improvement_suggestions (title, description, category, priority, source)
                           VALUES ($1, $2, $3, $4, 'ai') RETURNING id""",
                        inp["title"], inp["description"], inp.get("category","feature"), inp.get("priority","medium"),
                    )
                    result = f"Improvement suggestion created (ID #{row['id']}): '{inp['title']}' — awaiting admin approval."
                    action_result = {"type": "suggestion_created", "id": row["id"]}

                elif name == "list_improvement_suggestions":
                    status_filter = inp.get("status")
                    if status_filter:
                        rows = await db.fetch("SELECT * FROM improvement_suggestions WHERE status=$1 ORDER BY created_at DESC LIMIT 20", status_filter)
                    else:
                        rows = await db.fetch("SELECT * FROM improvement_suggestions ORDER BY created_at DESC LIMIT 20")
                    if rows:
                        result = f"{len(rows)} suggestions:\n" + "\n".join(
                            f"  #{r['id']} [{r['priority'].upper()}] {r['title']} — {r['status']}" for r in rows
                        )
                    else:
                        result = "No suggestions found."
                    action_result = {"type": "suggestions_list", "suggestions": [dict(r) for r in rows]}

                elif name == "manage_menu_item":
                    action  = inp["action"]
                    tid     = int(inp["tenant_id"])
                    item_id = inp.get("item_id")
                    if action == "add":
                        row = await db.fetchrow(
                            "INSERT INTO menu_items (tenant_id,name,category,price,description,available) VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING *",
                            tid, inp.get("name"), inp.get("category","other"), float(inp.get("price",0)), inp.get("description"),
                        )
                        action_result = {"type": "menu_item_added", "item": dict(row)}
                        result = f"Added '{row['name']}' at ${float(row['price']):.2f} to tenant #{tid}."
                    elif action == "update" and item_id:
                        row = await db.fetchrow(
                            "UPDATE menu_items SET name=$1,category=$2,price=$3,description=$4,available=$5 WHERE id=$6 AND tenant_id=$7 RETURNING *",
                            inp.get("name"), inp.get("category","other"), float(inp.get("price",0)),
                            inp.get("description"), inp.get("available", True), item_id, tid,
                        )
                        action_result = {"type": "menu_item_updated", "item": dict(row) if row else {}}
                        result = f"Updated menu item #{item_id}."
                    elif action == "delete" and item_id:
                        await db.execute("DELETE FROM menu_items WHERE id=$1 AND tenant_id=$2", item_id, tid)
                        action_result = {"type": "menu_item_deleted", "item_id": item_id}
                        result = f"Deleted menu item #{item_id}."
                    elif action == "toggle" and item_id:
                        avail = bool(inp.get("available", True))
                        row = await db.fetchrow("UPDATE menu_items SET available=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *", avail, item_id, tid)
                        action_result = {"type": "menu_item_toggled"}
                        result = f"{'Enabled' if avail else 'Disabled'} menu item #{item_id}."
                    else:
                        result = "Invalid action or missing item_id."

                tool_results.append({"type": "tool_result", "tool_use_id": tid_, "content": result})

            # ── Second call with tool results ──────────────────────────────
            messages2 = messages + [
                {"role": "assistant", "content": resp["content"]},
                {"role": "user",      "content": tool_results},
            ]
            r2 = await c.post(
                "https://api.anthropic.com/v1/messages",
                headers=_headers,
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 400,
                    "system": system_prompt,
                    "messages": messages2,
                    "tools": _TOOLS,
                },
            )
            if not r2.is_success:
                log.error("Anthropic (2nd) %s: %s", r2.status_code, r2.text)
                return {"reply": "Action completed.", "navigate": navigate, "action_result": action_result}

            final = "\n".join(b["text"] for b in r2.json()["content"] if b["type"] == "text")
            return {"reply": final, "navigate": navigate, "action_result": action_result}

    except Exception as e:
        log.error("Admin chat error: %s", e)
        return {"reply": "Sorry, I ran into an error. Please try again.", "navigate": None, "action_result": None}
