"""Admin AI assistant — full platform automation via Claude tool use."""
from __future__ import annotations
from typing import Optional
import json
import logging
from datetime import datetime, timezone
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
    # ── Navigation ─────────────────────────────────────────────────────────────
    {
        "name": "navigate_to_page",
        "description": "Navigate the admin to a specific page in the admin portal.",
        "input_schema": {
            "type": "object",
            "properties": {
                "page": {"type": "string", "enum": ["dashboard", "phone-agent", "settings", "feedback", "automations"]},
                "tenant_id": {"type": "integer", "description": "Open a specific tenant page"},
            },
            "required": ["page"],
        },
    },
    # ── Tenant management ──────────────────────────────────────────────────────
    {
        "name": "list_tenants",
        "description": "List all restaurant tenants, optionally filtered by search term or status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string"},
                "status": {"type": "string", "description": "active | inactive | suspended"},
                "plan":   {"type": "string", "description": "starter | growth | pro"},
                "limit":  {"type": "integer"},
            },
        },
    },
    {
        "name": "get_tenant_details",
        "description": "Get full details for a specific tenant including features and stats.",
        "input_schema": {
            "type": "object",
            "properties": {"tenant_id": {"type": "integer"}},
            "required": ["tenant_id"],
        },
    },
    {
        "name": "create_tenant",
        "description": "Create a new restaurant tenant on the platform.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name":           {"type": "string"},
                "slug":           {"type": "string"},
                "plan":           {"type": "string", "enum": ["starter", "growth", "pro"]},
                "owner_email":    {"type": "string"},
                "owner_password": {"type": "string"},
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
                "tenant_id": {"type": "integer"},
                "confirmed": {"type": "boolean"},
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
                "feature":   {"type": "string"},
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
            "properties": {"tenant_id": {"type": "integer"}},
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
    # ── Analytics & feedback ───────────────────────────────────────────────────
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
                "limit":     {"type": "integer"},
            },
            "required": ["tenant_id"],
        },
    },
    {
        "name": "get_user_feedback_insights",
        "description": "Retrieve aggregated feedback stats, recent comments, and top user interactions.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_improvement_suggestion",
        "description": "Create a new improvement suggestion based on feedback patterns or analysis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":       {"type": "string"},
                "description": {"type": "string"},
                "category":    {"type": "string", "enum": ["feature", "ease_of_use", "security", "performance", "ui_design", "integration"]},
                "priority":    {"type": "string", "enum": ["low", "medium", "high", "critical"]},
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
                "status": {"type": "string", "enum": ["pending", "approved", "rejected"]},
            },
        },
    },
    # ── Menu management ────────────────────────────────────────────────────────
    {
        "name": "manage_menu_item",
        "description": "Add, update, or delete a menu item for any tenant.",
        "input_schema": {
            "type": "object",
            "properties": {
                "action":      {"type": "string", "enum": ["add", "update", "delete", "toggle"]},
                "tenant_id":   {"type": "integer"},
                "item_id":     {"type": "integer"},
                "name":        {"type": "string"},
                "price":       {"type": "number"},
                "category":    {"type": "string"},
                "description": {"type": "string"},
                "available":   {"type": "boolean"},
            },
            "required": ["action", "tenant_id"],
        },
    },
    # ── Marketing: Social & Ads ────────────────────────────────────────────────
    {
        "name": "create_social_post_for_tenant",
        "description": "Publish a social media post on behalf of any restaurant tenant. Generates and posts content to their connected platforms.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "integer", "description": "The restaurant to post on behalf of"},
                "platforms": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["meta", "tiktok_content", "youtube"]},
                },
                "content":    {"type": "string", "description": "Caption or post text"},
                "image_url":  {"type": "string"},
                "video_url":  {"type": "string"},
                "media_type": {"type": "string", "enum": ["feed", "reel", "story"]},
            },
            "required": ["tenant_id", "platforms", "content"],
        },
    },
    {
        "name": "create_ad_campaign_for_tenant",
        "description": "Launch a paid ad campaign for any restaurant tenant on their connected platforms.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id":       {"type": "integer"},
                "platform":        {"type": "string", "enum": ["meta", "google", "tiktok", "snapchat", "pinterest"]},
                "headline":        {"type": "string"},
                "body":            {"type": "string"},
                "budget_daily":    {"type": "number"},
                "image_url":       {"type": "string"},
                "destination_url": {"type": "string"},
            },
            "required": ["tenant_id", "platform", "headline", "body", "budget_daily"],
        },
    },
    {
        "name": "get_tenant_ad_campaigns",
        "description": "View existing ad campaigns for a tenant.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "integer"},
                "status":    {"type": "string", "description": "active | paused | draft"},
            },
            "required": ["tenant_id"],
        },
    },
    # ── Accounting ─────────────────────────────────────────────────────────────
    {
        "name": "get_accounting_summary_for_tenant",
        "description": "View revenue, expense, and profit summary for any restaurant tenant.",
        "input_schema": {
            "type": "object",
            "properties": {"tenant_id": {"type": "integer"}},
            "required": ["tenant_id"],
        },
    },
    {
        "name": "create_accounting_entry_for_tenant",
        "description": "Add an income or expense accounting entry for any restaurant tenant.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id":   {"type": "integer"},
                "type":        {"type": "string", "enum": ["income", "expense"]},
                "category":    {"type": "string"},
                "amount":      {"type": "number"},
                "description": {"type": "string"},
                "date":        {"type": "string", "description": "YYYY-MM-DD"},
            },
            "required": ["tenant_id", "type", "category", "amount", "description"],
        },
    },
    # ── Phone Agent ────────────────────────────────────────────────────────────
    {
        "name": "get_phone_agent_for_tenant",
        "description": "View phone agent status, configuration, and recent calls for a tenant.",
        "input_schema": {
            "type": "object",
            "properties": {"tenant_id": {"type": "integer"}},
            "required": ["tenant_id"],
        },
    },
    {
        "name": "update_phone_agent_for_tenant",
        "description": "Update a tenant's AI phone agent greeting message and special instructions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tenant_id":             {"type": "integer"},
                "greeting":              {"type": "string"},
                "special_instructions":  {"type": "string"},
                "is_active":             {"type": "boolean"},
            },
            "required": ["tenant_id"],
        },
    },
    # ── Scheduling ─────────────────────────────────────────────────────────────
    {
        "name": "schedule_admin_task",
        "description": "Schedule a recurring or one-time platform automation task that runs automatically — without an admin needing to be logged in. Examples: 'send weekly platform analytics email', 'auto-suspend past-due tenants every day', 'post content for tenant #5 every Monday at 9am'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "label":           {"type": "string", "description": "Short human-readable task name"},
                "prompt":          {"type": "string", "description": "Exact instruction to execute at run time"},
                "schedule_type":   {"type": "string", "enum": ["cron", "once"]},
                "cron_expression": {"type": "string", "description": "5-field cron: '0 9 * * *'=daily 9am, '0 9 * * 1'=Mondays"},
                "run_at":          {"type": "string", "description": "ISO datetime for one-time tasks"},
                "target_tenant_id":{"type": "integer", "description": "If this task is for a specific restaurant, provide their tenant_id"},
            },
            "required": ["label", "prompt", "schedule_type"],
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

    stats = await db.fetchrow(
        """SELECT
             COUNT(*)                                      AS total_tenants,
             COUNT(*) FILTER (WHERE status='active')      AS active_tenants,
             COUNT(*) FILTER (WHERE plan='starter')       AS starter_count,
             COUNT(*) FILTER (WHERE plan='growth')        AS growth_count,
             COUNT(*) FILTER (WHERE plan='pro')           AS pro_count
           FROM tenants"""
    )
    mrr = stats["starter_count"] * 49 + stats["growth_count"] * 149 + stats["pro_count"] * 299
    recent = await db.fetch("SELECT id, name, slug, plan, status FROM tenants ORDER BY created_at DESC LIMIT 8")
    tenant_lines = "\n".join(f"  #{r['id']} {r['name']} ({r['slug']}) · {r['plan']} · {r['status']}" for r in recent)

    system_prompt = f"""You are the AI admin assistant for Careful-Server, a multi-tenant restaurant automation SaaS platform. You have FULL administrative access and can execute any operation.

## Platform Overview
- Total tenants: {stats['total_tenants']} ({stats['active_tenants']} active)
- MRR estimate: ${mrr:,}/month
- Plans: {stats['starter_count']} Starter ($49) · {stats['growth_count']} Growth ($149) · {stats['pro_count']} Pro ($299)

## Recent Tenants
{tenant_lines or '  (none yet)'}

## What You Can Do Autonomously
**Tenant Management**
- list_tenants, get_tenant_details, create_tenant, update_tenant, delete_tenant
- toggle_feature, sync_plan_features, create_owner_account

**Marketing (for any restaurant)**
- create_social_post_for_tenant — publish to Meta/Instagram/TikTok/YouTube on behalf of any restaurant
- create_ad_campaign_for_tenant — launch paid ads on Meta/Google/TikTok/Snapchat/Pinterest
- get_tenant_ad_campaigns — view existing campaigns

**Accounting (for any restaurant)**
- get_accounting_summary_for_tenant — view P&L summary
- create_accounting_entry_for_tenant — add income/expense entries

**Phone Agent (for any restaurant)**
- get_phone_agent_for_tenant — view status and recent calls
- update_phone_agent_for_tenant — update greeting and instructions, activate/deactivate

**Analytics & Feedback**
- get_saas_analytics, get_tenant_orders, get_user_feedback_insights
- create_improvement_suggestion, list_improvement_suggestions

**Scheduling**
- schedule_admin_task — schedule ANY of the above to run automatically on a cron or one-time schedule

## How to Handle Requests
- "Post about specials for restaurant #3 every Monday" → schedule_admin_task with cron '0 9 * * 1', prompt includes create_social_post_for_tenant
- "Show me accounting for Burger Palace" → list_tenants to find it, then get_accounting_summary_for_tenant
- "Activate phone agent for tenant #7" → update_phone_agent_for_tenant with is_active=true
- "Run a Meta ad for all active Pro tenants" → list_tenants (plan=pro), then create_ad_campaign_for_tenant for each

## Behavior
- Always chain tools as needed — find tenant → execute action
- For destructive ops (delete tenant), require confirmed=true
- Be concise — confirm what you did, not what you could do
- No emojis — professional plain text and markdown
- When analyzing pasted images: food photos → add menu items, menus → extract all items, receipts → read vendor and amount"""

    messages = _fmt_messages(body.messages)
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    if not messages:
        return {
            "reply": "Hi! I'm your admin AI with full platform access.\n\nI can manage tenants, run marketing for any restaurant, record accounting, manage phone agents, view analytics — and schedule any of these to run automatically.\n\nWhat do you need?",
            "navigate": None,
            "action_result": None,
        }

    _headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    from integrations import meta as meta_api
    from integrations import tiktok as tiktok_api
    from integrations import youtube as youtube_api
    from integrations import google_ads as google_api
    from integrations import snapchat as snapchat_api
    from integrations import pinterest as pinterest_api

    navigate: Optional[str] = None
    action_result: Optional[dict] = None
    current_messages = list(messages)

    try:
        async with httpx.AsyncClient(timeout=90) as c:
            for _round in range(8):
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
                    log.error("Admin chat Anthropic %s: %s", r.status_code, r.text[:300])
                    return {"reply": "Sorry, I ran into an error. Please try again.", "navigate": None, "action_result": None}

                resp = r.json()
                tool_uses = [b for b in resp["content"] if b["type"] == "tool_use"]

                if not tool_uses:
                    text = "\n".join(b["text"] for b in resp["content"] if b["type"] == "text")
                    return {"reply": text, "navigate": navigate, "action_result": action_result}

                tool_results = []
                for tu in tool_uses:
                    name  = tu["name"]
                    inp   = tu["input"]
                    tu_id = tu["id"]
                    result = ""

                    # ── Navigation ──────────────────────────────────────────────
                    if name == "navigate_to_page":
                        page = inp.get("page", "dashboard")
                        tid_nav = inp.get("tenant_id")
                        navigate = f"/tenants/{tid_nav}" if tid_nav else f"/{page}"
                        result = f"Navigating to {navigate}."

                    # ── Tenant: list ────────────────────────────────────────────
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
                            args.append(status); q += f" AND status=${len(args)}"
                        if plan:
                            args.append(plan); q += f" AND plan=${len(args)}"
                        args.append(limit); q += f" ORDER BY created_at DESC LIMIT ${len(args)}"
                        rows = await db.fetch(q, *args)
                        result = (f"Found {len(rows)} tenants:\n" + "\n".join(f"#{r['id']} {r['name']} ({r['slug']}) · {r['plan']} · {r['status']}" for r in rows)) if rows else "No tenants found."
                        action_result = {"type": "tenant_list", "tenants": [dict(r) for r in rows]}

                    # ── Tenant: details ─────────────────────────────────────────
                    elif name == "get_tenant_details":
                        tid = int(inp["tenant_id"])
                        tenant = await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tid)
                        if not tenant:
                            result = f"No tenant #{tid}."
                        else:
                            feats = await db.fetch("SELECT feature,enabled FROM tenant_features WHERE tenant_id=$1", tid)
                            orders_count = await db.fetchval("SELECT COUNT(*) FROM tenant_orders WHERE tenant_id=$1", tid)
                            owners = await db.fetch("SELECT email FROM users WHERE tenant_id=$1 AND role='owner'", tid)
                            result = (
                                f"Tenant #{tid}: {tenant['name']} ({tenant['slug']})\n"
                                f"Plan: {tenant['plan']} · Status: {tenant['status']}\n"
                                f"Orders: {orders_count}\n"
                                f"Owners: {', '.join(o['email'] for o in owners) or 'none'}\n"
                                f"Features: {', '.join(f['feature'] for f in feats if f['enabled']) or 'none'}"
                            )
                            action_result = {"type": "tenant_details", "tenant": dict(tenant)}

                    # ── Tenant: create ──────────────────────────────────────────
                    elif name == "create_tenant":
                        try:
                            row = await db.fetchrow(
                                "INSERT INTO tenants (name,slug,plan,status) VALUES ($1,$2,$3,'active') RETURNING *",
                                inp["name"], inp["slug"].lower().replace(" ", "-"), inp.get("plan", "starter"),
                            )
                            if inp.get("owner_email") and inp.get("owner_password"):
                                hashed = hash_password(inp["owner_password"])
                                await db.execute(
                                    "INSERT INTO users (email,password_hash,role,tenant_id) VALUES ($1,$2,'owner',$3)",
                                    inp["owner_email"], hashed, row["id"],
                                )
                            action_result = {"type": "tenant_created", "tenant": dict(row)}
                            result = f"Created tenant '{inp['name']}' (#{row['id']}) on {row['plan']} plan."
                        except Exception as e:
                            result = f"Failed: {e}"

                    # ── Tenant: update ──────────────────────────────────────────
                    elif name == "update_tenant":
                        tid = int(inp["tenant_id"])
                        sets, vals = [], [tid]
                        for field in ("name", "slug", "status", "plan"):
                            if field in inp:
                                vals.append(inp[field]); sets.append(f"{field}=${len(vals)}")
                        if sets:
                            row = await db.fetchrow(f"UPDATE tenants SET {', '.join(sets)} WHERE id=$1 RETURNING *", *vals)
                            action_result = {"type": "tenant_updated", "tenant": dict(row)}
                            result = f"Updated tenant #{tid}."
                        else:
                            result = "No fields to update."

                    # ── Tenant: delete ──────────────────────────────────────────
                    elif name == "delete_tenant":
                        tid = int(inp["tenant_id"])
                        if not inp.get("confirmed"):
                            result = "Not confirmed. Set confirmed=true to proceed."
                        else:
                            t = await db.fetchrow("SELECT name FROM tenants WHERE id=$1", tid)
                            await db.execute("DELETE FROM tenants WHERE id=$1", tid)
                            action_result = {"type": "tenant_deleted", "tenant_id": tid}
                            result = f"Deleted tenant #{tid} ({t['name'] if t else '?'})."

                    # ── Feature toggle ──────────────────────────────────────────
                    elif name == "toggle_feature":
                        tid = int(inp["tenant_id"]); feature = inp["feature"]; enabled = bool(inp["enabled"])
                        await db.execute(
                            "INSERT INTO tenant_features (tenant_id,feature,enabled) VALUES ($1,$2,$3) ON CONFLICT (tenant_id,feature) DO UPDATE SET enabled=$3",
                            tid, feature, enabled,
                        )
                        action_result = {"type": "feature_toggled", "tenant_id": tid, "feature": feature, "enabled": enabled}
                        result = f"{'Enabled' if enabled else 'Disabled'} '{feature}' for tenant #{tid}."

                    # ── Sync plan features ──────────────────────────────────────
                    elif name == "sync_plan_features":
                        tid = int(inp["tenant_id"])
                        tenant = await db.fetchrow("SELECT plan FROM tenants WHERE id=$1", tid)
                        if tenant:
                            plan = tenant["plan"]
                            STARTER = ["menu_management", "order_management"]
                            GROWTH  = STARTER + ["ads_meta","ads_google","ads_youtube","ads_tiktok","ads_snapchat","ads_pinterest","social_meta","social_youtube","social_tiktok","listings_google","listings_apple","delivery","ai_creative"]
                            PRO     = GROWTH + ["phone_agent","accounting"]
                            feature_set = {"pro": PRO, "growth": GROWTH}.get(plan, STARTER)
                            for f in PRO:
                                await db.execute(
                                    "INSERT INTO tenant_features (tenant_id,feature,enabled) VALUES ($1,$2,$3) ON CONFLICT (tenant_id,feature) DO UPDATE SET enabled=$3",
                                    tid, f, f in feature_set,
                                )
                            action_result = {"type": "features_synced", "tenant_id": tid, "plan": plan}
                            result = f"Synced features for tenant #{tid} ({plan} plan)."
                        else:
                            result = f"Tenant #{tid} not found."

                    # ── Create owner account ────────────────────────────────────
                    elif name == "create_owner_account":
                        tid = int(inp["tenant_id"])
                        try:
                            hashed = hash_password(inp["password"])
                            await db.execute(
                                "INSERT INTO users (email,password_hash,role,tenant_id) VALUES ($1,$2,'owner',$3)",
                                inp["email"], hashed, tid,
                            )
                            action_result = {"type": "owner_created", "tenant_id": tid, "email": inp["email"]}
                            result = f"Created owner account {inp['email']} for tenant #{tid}."
                        except Exception as e:
                            result = f"Failed: {e}"

                    # ── SaaS analytics ──────────────────────────────────────────
                    elif name == "get_saas_analytics":
                        s = await db.fetchrow(
                            "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='active') AS active, COUNT(*) FILTER (WHERE plan='starter') AS starter, COUNT(*) FILTER (WHERE plan='growth') AS growth, COUNT(*) FILTER (WHERE plan='pro') AS pro FROM tenants"
                        )
                        monthly = await db.fetch("SELECT DATE_TRUNC('month',created_at) AS month, COUNT(*) AS count FROM tenants GROUP BY 1 ORDER BY 1 DESC LIMIT 6")
                        mrr_val = s["starter"]*49 + s["growth"]*149 + s["pro"]*299
                        growth_str = " | ".join(r["month"].strftime("%b") + ":" + str(r["count"]) for r in monthly)
                        result = f"Platform stats:\n  Tenants: {s['total']} ({s['active']} active)\n  MRR: ${mrr_val:,}/mo (Starter×{s['starter']} Growth×{s['growth']} Pro×{s['pro']})\n  Monthly: {growth_str}"
                        action_result = {"type": "analytics", "mrr": mrr_val, "total": s["total"]}

                    # ── Tenant orders ───────────────────────────────────────────
                    elif name == "get_tenant_orders":
                        tid = int(inp["tenant_id"]); limit = min(int(inp.get("limit", 5)), 20)
                        rows = await db.fetch("SELECT id,status,total,created_at FROM tenant_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2", tid, limit)
                        result = f"{len(rows)} orders:\n" + "\n".join(f"  #{r['id']} {r['status']} ${float(r.get('total') or 0):.2f}" for r in rows) if rows else "No orders."
                        action_result = {"type": "orders", "orders": [dict(r) for r in rows]}

                    # ── Feedback insights ───────────────────────────────────────
                    elif name == "get_user_feedback_insights":
                        fb = await db.fetchrow("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='pending') AS pending, ROUND(AVG(star_rating)::numeric,2) AS avg_rating FROM tenant_feedback")
                        recent = await db.fetch("SELECT restaurant_name,comment,star_rating FROM tenant_feedback WHERE comment IS NOT NULL ORDER BY created_at DESC LIMIT 6")
                        top_actions = await db.fetch("SELECT action,page,COUNT(*) AS cnt FROM user_interactions GROUP BY action,page ORDER BY cnt DESC LIMIT 8")
                        result = (
                            f"Feedback: {fb['total']} total | {fb['pending']} pending | {fb['avg_rating']} avg rating\n"
                            "Recent:\n" + "\n".join(f"  [{r['star_rating']}★] {r['restaurant_name']}: {(r['comment'] or '')[:100]}" for r in recent) +
                            "\nTop interactions:\n" + "\n".join(f"  {r['action']} on {r['page'] or 'n/a'}: {r['cnt']}x" for r in top_actions)
                        )
                        action_result = {"type": "insights"}

                    # ── Improvement suggestions ─────────────────────────────────
                    elif name == "create_improvement_suggestion":
                        row = await db.fetchrow(
                            "INSERT INTO improvement_suggestions (title,description,category,priority,source) VALUES ($1,$2,$3,$4,'ai') RETURNING id",
                            inp["title"], inp["description"], inp.get("category","feature"), inp.get("priority","medium"),
                        )
                        result = f"Suggestion #{row['id']} created: '{inp['title']}'."
                        action_result = {"type": "suggestion_created", "id": row["id"]}

                    elif name == "list_improvement_suggestions":
                        status_f = inp.get("status")
                        rows = await db.fetch("SELECT * FROM improvement_suggestions WHERE ($1::text IS NULL OR status=$1) ORDER BY created_at DESC LIMIT 20", status_f)
                        result = "\n".join(f"#{r['id']} [{r['priority'].upper()}] {r['title']} — {r['status']}" for r in rows) or "No suggestions."
                        action_result = {"type": "suggestions_list", "suggestions": [dict(r) for r in rows]}

                    # ── Menu management ─────────────────────────────────────────
                    elif name == "manage_menu_item":
                        action = inp["action"]; tid = int(inp["tenant_id"]); item_id = inp.get("item_id")
                        if action == "add":
                            row = await db.fetchrow("INSERT INTO menu_items (tenant_id,name,category,price,description,available) VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING *", tid, inp.get("name"), inp.get("category","other"), float(inp.get("price",0)), inp.get("description"))
                            action_result = {"type": "menu_item_added", "item": dict(row)}
                            result = f"Added '{row['name']}' ${float(row['price']):.2f} to tenant #{tid}."
                        elif action == "update" and item_id:
                            row = await db.fetchrow("UPDATE menu_items SET name=$1,category=$2,price=$3,description=$4,available=$5 WHERE id=$6 AND tenant_id=$7 RETURNING *", inp.get("name"), inp.get("category","other"), float(inp.get("price",0)), inp.get("description"), inp.get("available",True), item_id, tid)
                            action_result = {"type": "menu_item_updated"}; result = f"Updated item #{item_id}."
                        elif action == "delete" and item_id:
                            await db.execute("DELETE FROM menu_items WHERE id=$1 AND tenant_id=$2", item_id, tid)
                            action_result = {"type": "menu_item_deleted", "item_id": item_id}; result = f"Deleted item #{item_id}."
                        elif action == "toggle" and item_id:
                            avail = bool(inp.get("available", True))
                            await db.execute("UPDATE menu_items SET available=$1 WHERE id=$2 AND tenant_id=$3", avail, item_id, tid)
                            action_result = {"type": "menu_item_toggled"}; result = f"Toggled item #{item_id}."
                        else:
                            result = "Invalid action or missing item_id."

                    # ── Marketing: social post ──────────────────────────────────
                    elif name == "create_social_post_for_tenant":
                        tid = int(inp["tenant_id"])
                        platforms_req = inp.get("platforms", [])
                        content = inp.get("content", "")
                        image_url = inp.get("image_url"); video_url = inp.get("video_url")
                        media_type = inp.get("media_type", "feed")
                        tenant = await db.fetchrow("SELECT name FROM tenants WHERE id=$1", tid)
                        row = await db.fetchrow("INSERT INTO social_posts (tenant_id,platforms,content,image_url,status) VALUES ($1,$2,$3,$4,'publishing') RETURNING id", tid, json.dumps(platforms_req), content, image_url or video_url)
                        post_id = row["id"]; post_results: dict = {}
                        for platform in platforms_req:
                            conn = await db.fetchrow("SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2", tid, platform)
                            if not conn:
                                post_results[platform] = {"status": "not_connected"}; continue
                            try:
                                if platform == "meta":
                                    raw = (conn.get("refresh_token") or ""); parts = raw.split(":", 2)
                                    if len(parts) == 3:
                                        page_id, page_token, ig_id = parts
                                    else:
                                        page_id = conn.get("ad_account_id",""); page_token = conn.get("access_token",""); ig_id = ""
                                    if media_type in ("reel","story") and ig_id:
                                        pid = await meta_api.create_ig_post(page_token, ig_id, content, image_url=image_url, video_url=video_url, media_type=media_type)
                                    else:
                                        pid = await meta_api.create_page_post(page_token or conn["access_token"], page_id, content, image_url, video_url, None)
                                elif platform == "tiktok_content":
                                    pid = await tiktok_api.create_post(conn["access_token"], conn["ad_account_id"] or "", content, image_url=image_url, video_url=video_url)
                                elif platform == "youtube":
                                    pid = await youtube_api.create_post(conn["access_token"], conn["ad_account_id"] or "", content, video_url or image_url)
                                else:
                                    post_results[platform] = {"status": "not_supported"}; continue
                                post_results[platform] = {"status": "published", "id": pid}
                            except Exception as e:
                                post_results[platform] = {"status": "failed", "error": str(e)[:200]}
                        ok = [p for p, v in post_results.items() if v["status"] == "published"]
                        final_status = "published" if ok else "failed"
                        await db.execute("UPDATE social_posts SET status=$1, platform_results=$2 WHERE id=$3", final_status, json.dumps(post_results), post_id)
                        action_result = {"type": "social_post", "tenant_id": tid, "post_id": post_id, "results": post_results}
                        result = f"Posted for {tenant['name'] if tenant else f'tenant #{tid}'}: {', '.join(ok) if ok else 'failed — ' + str(post_results)}"

                    # ── Marketing: ad campaign ──────────────────────────────────
                    elif name == "create_ad_campaign_for_tenant":
                        tid = int(inp["tenant_id"]); platform = inp["platform"]
                        budget = float(inp.get("budget_daily", 10))
                        conn = await db.fetchrow("SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2", tid, platform)
                        if not conn:
                            result = f"{platform} not connected for tenant #{tid}."
                        else:
                            campaign = {"headline": inp["headline"], "body": inp["body"], "budget_daily": budget, "image_url": inp.get("image_url"), "destination_url": inp.get("destination_url", "")}
                            try:
                                if platform == "meta": camp_id = await meta_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                elif platform == "google": camp_id = await google_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                elif platform == "tiktok": camp_id = await tiktok_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                elif platform == "snapchat": camp_id = await snapchat_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                elif platform == "pinterest": camp_id = await pinterest_api.deploy_campaign(conn["access_token"], conn["ad_account_id"] or "", campaign)
                                else: camp_id = None
                                if camp_id:
                                    await db.execute("INSERT INTO ad_campaigns (tenant_id,platform,status,headline,body,image_url,destination_url,cta,budget_daily,location,radius_miles,start_date,end_date,error_message,platform_campaign_id) VALUES ($1,$2,'active',$3,$4,$5,$6,'LEARN_MORE',$7,NULL,10,NULL,NULL,NULL,$8)", tid, platform, inp["headline"], inp["body"], inp.get("image_url"), inp.get("destination_url",""), budget, str(camp_id))
                                    action_result = {"type": "ad_campaign", "tenant_id": tid, "platform": platform, "campaign_id": camp_id}
                                    result = f"Launched {platform} campaign '{ inp['headline']}' for tenant #{tid} at ${budget}/day."
                                else:
                                    result = "Campaign returned no ID."
                            except Exception as e:
                                result = f"Campaign failed: {e}"

                    elif name == "get_tenant_ad_campaigns":
                        tid = int(inp["tenant_id"]); status_f = inp.get("status")
                        rows = await db.fetch("SELECT id,platform,status,headline,budget_daily,created_at FROM ad_campaigns WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT 20", tid, status_f)
                        result = "\n".join(f"#{r['id']} {r['platform']} [{r['status']}] {r['headline']} ${float(r.get('budget_daily') or 0):.0f}/day" for r in rows) or "No campaigns."
                        action_result = {"type": "ad_campaigns_list", "campaigns": [dict(r) for r in rows]}

                    # ── Accounting ──────────────────────────────────────────────
                    elif name == "get_accounting_summary_for_tenant":
                        tid = int(inp["tenant_id"])
                        tenant = await db.fetchrow("SELECT name FROM tenants WHERE id=$1", tid)
                        rows = await db.fetch("SELECT type, SUM(amount) AS total FROM accounting_entries WHERE tenant_id=$1 GROUP BY type", tid)
                        income = next((float(r["total"]) for r in rows if r["type"] == "income"), 0.0)
                        expense = next((float(r["total"]) for r in rows if r["type"] == "expense"), 0.0)
                        result = f"Accounting for {tenant['name'] if tenant else f'tenant #{tid}'}:\n  Income: ${income:,.2f}\n  Expenses: ${expense:,.2f}\n  Net: ${income-expense:,.2f}"
                        action_result = {"type": "accounting_summary", "tenant_id": tid, "income": income, "expense": expense}

                    elif name == "create_accounting_entry_for_tenant":
                        tid = int(inp["tenant_id"])
                        entry_date = inp.get("date") or datetime.now(timezone.utc).date().isoformat()
                        try:
                            row = await db.fetchrow("INSERT INTO accounting_entries (tenant_id,type,category,amount,description,date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", tid, inp["type"], inp["category"], float(inp["amount"]), inp["description"], entry_date)
                            action_result = {"type": "accounting_entry", "tenant_id": tid, "id": row["id"]}
                            result = f"Added {inp['type']} entry for tenant #{tid}: {inp['category']} ${float(inp['amount']):.2f} — {inp['description']}"
                        except Exception as e:
                            result = f"Failed: {e}"

                    # ── Phone Agent ─────────────────────────────────────────────
                    elif name == "get_phone_agent_for_tenant":
                        tid = int(inp["tenant_id"])
                        agent = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tid)
                        calls = await db.fetch("SELECT id,caller_number,duration_secs,summary,created_at FROM phone_calls WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 5", tid)
                        if not agent:
                            result = f"No phone agent configured for tenant #{tid}."
                        else:
                            result = (
                                f"Phone agent for tenant #{tid}:\n"
                                f"  Status: {'ACTIVE' if agent['is_active'] else 'inactive'}\n"
                                f"  Number: {agent.get('phone_number') or 'not assigned'}\n"
                                f"  Total calls: {agent.get('total_calls', 0)}\n"
                                f"  Greeting: {(agent.get('greeting') or '')[:80]}"
                            )
                            if calls:
                                result += "\nRecent calls:\n" + "\n".join(f"  {r['caller_number'] or '?'} — {r['duration_secs']}s — {(r['summary'] or 'no summary')[:60]}" for r in calls)
                        action_result = {"type": "phone_agent_status", "tenant_id": tid, "active": agent["is_active"] if agent else False}

                    elif name == "update_phone_agent_for_tenant":
                        tid = int(inp["tenant_id"])
                        agent = await db.fetchrow("SELECT id FROM phone_agents WHERE tenant_id=$1", tid)
                        sets, vals = [], [tid]
                        for field in ("greeting", "special_instructions", "is_active"):
                            if field in inp:
                                vals.append(inp[field]); sets.append(f"{field}=${len(vals)}")
                        if sets:
                            if agent:
                                await db.execute(f"UPDATE phone_agents SET {', '.join(sets)}, updated_at=NOW() WHERE tenant_id=$1", *vals)
                            else:
                                await db.execute("INSERT INTO phone_agents (tenant_id,greeting,special_instructions,is_active) VALUES ($1,$2,$3,$4)", tid, inp.get("greeting","Thank you for calling! How can I help you today?"), inp.get("special_instructions",""), bool(inp.get("is_active",False)))
                            action_result = {"type": "phone_agent_updated", "tenant_id": tid}
                            result = f"Updated phone agent for tenant #{tid}: {', '.join(sets)}."
                        else:
                            result = "No fields to update."

                    # ── Scheduling ──────────────────────────────────────────────
                    elif name == "schedule_admin_task":
                        try:
                            from api.routers.tasks import init_task_tables, _next_cron_run
                            await init_task_tables(db)
                            user_dict = dict(current_user)
                            uid = user_dict.get("id")
                            label = inp.get("label", "Admin Task")
                            prompt_text = inp.get("prompt", "")
                            sched_type = inp.get("schedule_type", "cron")
                            cron_expr = inp.get("cron_expression")
                            run_at_str = inp.get("run_at")
                            target_tid = inp.get("target_tenant_id", 0)  # 0 = platform-level

                            now_dt = datetime.now(timezone.utc)
                            next_run = None
                            if sched_type == "cron" and cron_expr:
                                next_run = _next_cron_run(cron_expr, now_dt)
                            elif sched_type == "once" and run_at_str:
                                next_run = datetime.fromisoformat(run_at_str.replace("Z", "+00:00"))
                                if next_run.tzinfo is None:
                                    next_run = next_run.replace(tzinfo=timezone.utc)

                            task_row = await db.fetchrow(
                                """INSERT INTO ai_scheduled_tasks
                                   (tenant_id,created_by,label,prompt,schedule_type,cron_expression,run_at,timezone,next_run_at)
                                   VALUES ($1,$2,$3,$4,$5,$6,$7,'UTC',$8) RETURNING id""",
                                target_tid or 0, uid, label, prompt_text, sched_type,
                                cron_expr, next_run, next_run,
                            )
                            action_result = {
                                "type": "scheduled_task",
                                "task_id": task_row["id"],
                                "label": label,
                                "cron_expression": cron_expr,
                                "next_run_at": next_run.isoformat() if next_run else None,
                            }
                            result = f"Scheduled admin task '{label}' (ID #{task_row['id']})."
                            if next_run:
                                result += f" Next run: {next_run.strftime('%b %d at %H:%M UTC')}."
                        except Exception as e:
                            log.error("Admin schedule_task failed: %s", e)
                            result = f"Failed to schedule task: {e}"

                    tool_results.append({"type": "tool_result", "tool_use_id": tu_id, "content": result})

                current_messages.append({"role": "assistant", "content": resp["content"]})
                current_messages.append({"role": "user", "content": tool_results})

            return {"reply": "Actions completed.", "navigate": navigate, "action_result": action_result}

    except Exception as e:
        log.error("Admin chat error: %s", e)
        return {"reply": "Sorry, I ran into an error. Please try again.", "navigate": None, "action_result": None}


# ─── Approve / Reject suggestions ────────────────────────────────────────────

@router.patch("/suggestions/{suggestion_id}/approve")
async def approve_suggestion(suggestion_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE improvement_suggestions SET status='approved', reviewed_at=NOW() WHERE id=$1 RETURNING id,status",
        suggestion_id,
    )
    if not row:
        raise HTTPException(404, "Suggestion not found")
    return dict(row)


@router.patch("/suggestions/{suggestion_id}/reject")
async def reject_suggestion(suggestion_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    row = await db.fetchrow(
        "UPDATE improvement_suggestions SET status='rejected', reviewed_at=NOW() WHERE id=$1 RETURNING id,status",
        suggestion_id,
    )
    if not row:
        raise HTTPException(404, "Suggestion not found")
    return dict(row)


@router.get("/suggestions")
async def list_suggestions(status: Optional[str] = None, current_user=Depends(_require_admin), db=Depends(get_db)):
    if status:
        rows = await db.fetch("SELECT * FROM improvement_suggestions WHERE status=$1 ORDER BY created_at DESC", status)
    else:
        rows = await db.fetch("SELECT * FROM improvement_suggestions ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.get("/insights")
async def get_insights(current_user=Depends(_require_admin), db=Depends(get_db)):
    fb = await db.fetchrow("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='pending') AS pending, ROUND(AVG(star_rating)::numeric,2) AS avg_rating, COUNT(*) FILTER (WHERE q1_overall=TRUE) AS satisfied, COUNT(*) FILTER (WHERE q2_easy_to_use=TRUE) AS easy, COUNT(*) FILTER (WHERE q3_effective=TRUE) AS effective FROM tenant_feedback")
    recent = await db.fetch("SELECT restaurant_name, comment, star_rating, created_at FROM tenant_feedback WHERE comment IS NOT NULL AND comment <> '' ORDER BY created_at DESC LIMIT 10")
    top_interactions = await db.fetch("SELECT action, page, COUNT(*) AS count FROM user_interactions GROUP BY action, page ORDER BY count DESC LIMIT 15")
    return {"feedback": dict(fb) if fb else {}, "recent_comments": [dict(r) for r in recent], "top_interactions": [dict(r) for r in top_interactions]}


@router.get("/feedback")
async def list_feedback(status: Optional[str] = None, current_user=Depends(_require_admin), db=Depends(get_db)):
    if status:
        rows = await db.fetch("SELECT * FROM tenant_feedback WHERE status=$1 ORDER BY created_at DESC", status)
    else:
        rows = await db.fetch("SELECT * FROM tenant_feedback ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.patch("/feedback/{feedback_id}/approve")
async def approve_feedback(feedback_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    row = await db.fetchrow("UPDATE tenant_feedback SET status='approved', approved_at=NOW() WHERE id=$1 RETURNING id,status", feedback_id)
    if not row:
        raise HTTPException(404, "Feedback not found")
    return dict(row)


@router.patch("/feedback/{feedback_id}/reject")
async def reject_feedback(feedback_id: int, current_user=Depends(_require_admin), db=Depends(get_db)):
    row = await db.fetchrow("UPDATE tenant_feedback SET status='rejected' WHERE id=$1 RETURNING id,status", feedback_id)
    if not row:
        raise HTTPException(404, "Feedback not found")
    return dict(row)


# ─── Admin Accounting ─────────────────────────────────────────────────────────

@router.get("/accounting")
async def admin_accounting_overview(current_user=Depends(_require_admin), db=Depends(get_db)):
    """Accounting summary for all tenants."""
    tenants = await db.fetch(
        "SELECT id, name, slug, plan FROM tenants WHERE status='active' ORDER BY name"
    )
    result = []
    for t in tenants:
        tid = t["id"]
        totals = await db.fetch(
            "SELECT type, SUM(amount) AS total FROM accounting_entries WHERE tenant_id=$1 GROUP BY type",
            tid,
        )
        income  = next((float(r["total"]) for r in totals if r["type"] == "income"),  0.0)
        expense = next((float(r["total"]) for r in totals if r["type"] == "expense"), 0.0)
        result.append({
            "tenant_id":   tid,
            "tenant_name": t["name"],
            "slug":        t["slug"],
            "plan":        t["plan"],
            "income":      income,
            "expense":     expense,
            "net":         income - expense,
        })
    return result


@router.get("/accounting/{tenant_id}/entries")
async def admin_tenant_entries(
    tenant_id: int,
    type: Optional[str] = None,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    """List accounting entries for a specific tenant."""
    tenant = await db.fetchrow("SELECT name FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    q = "SELECT * FROM accounting_entries WHERE tenant_id=$1"
    args: list = [tenant_id]
    if type:
        args.append(type); q += f" AND type=${len(args)}"
    q += " ORDER BY date DESC, id DESC LIMIT 100"
    rows = await db.fetch(q, *args)
    return [dict(r) for r in rows]


class AdminAccountingEntryBody(BaseModel):
    type: str
    category: str
    amount: float
    description: str
    date: Optional[str] = None


@router.post("/accounting/{tenant_id}/entries", status_code=201)
async def admin_create_entry(
    tenant_id: int,
    body: AdminAccountingEntryBody,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    """Add an accounting entry for any tenant."""
    tenant = await db.fetchrow("SELECT name FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    entry_date = body.date or datetime.now(timezone.utc).date().isoformat()
    row = await db.fetchrow(
        "INSERT INTO accounting_entries (tenant_id,type,category,amount,description,date,source) "
        "VALUES ($1,$2,$3,$4,$5,$6,'admin') RETURNING *",
        tenant_id, body.type, body.category, body.amount, body.description, entry_date,
    )
    return dict(row)


@router.delete("/accounting/entries/{entry_id}", status_code=204)
async def admin_delete_entry(
    entry_id: int,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    """Delete any accounting entry by ID."""
    await db.execute("DELETE FROM accounting_entries WHERE id=$1", entry_id)


# ─── Admin Phone Agents ───────────────────────────────────────────────────────

@router.get("/phone-agents")
async def admin_phone_agents(current_user=Depends(_require_admin), db=Depends(get_db)):
    """List all phone agents across all tenants."""
    rows = await db.fetch(
        """SELECT pa.*, t.name AS tenant_name, t.slug, t.plan
           FROM phone_agents pa
           JOIN tenants t ON t.id = pa.tenant_id
           ORDER BY t.name"""
    )
    result = []
    for r in rows:
        d = dict(r)
        # Recent call count (last 30 days)
        calls = await db.fetchval(
            "SELECT COUNT(*) FROM phone_calls WHERE tenant_id=$1 AND created_at >= NOW() - INTERVAL '30 days'",
            r["tenant_id"],
        )
        d["calls_last_30d"] = calls
        result.append(d)
    return result


@router.get("/phone-agents/tenants")
async def admin_phone_agent_tenants(current_user=Depends(_require_admin), db=Depends(get_db)):
    """List all tenants with phone_agent feature enabled, with or without an agent configured."""
    rows = await db.fetch(
        """SELECT t.id, t.name, t.slug, t.plan,
                  pa.id AS agent_id, pa.is_active, pa.phone_number,
                  pa.greeting, pa.special_instructions, pa.total_calls, pa.last_call_at
           FROM tenants t
           JOIN tenant_features tf ON tf.tenant_id = t.id AND tf.feature='phone_agent' AND tf.enabled=TRUE
           LEFT JOIN phone_agents pa ON pa.tenant_id = t.id
           WHERE t.status='active'
           ORDER BY t.name"""
    )
    return [dict(r) for r in rows]


class AdminPhoneAgentBody(BaseModel):
    greeting: Optional[str] = None
    special_instructions: Optional[str] = None
    is_active: Optional[bool] = None


@router.patch("/phone-agents/{tenant_id}")
async def admin_update_phone_agent(
    tenant_id: int,
    body: AdminPhoneAgentBody,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    """Update or activate/deactivate a tenant's phone agent."""
    tenant = await db.fetchrow("SELECT name FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    agent = await db.fetchrow("SELECT id FROM phone_agents WHERE tenant_id=$1", tenant_id)
    sets: list[str] = []
    vals: list = [tenant_id]

    for field in ("greeting", "special_instructions", "is_active"):
        val = getattr(body, field)
        if val is not None:
            vals.append(val)
            sets.append(f"{field}=${len(vals)}")

    if not sets:
        raise HTTPException(400, "No fields to update")

    if agent:
        await db.execute(
            f"UPDATE phone_agents SET {', '.join(sets)}, updated_at=NOW() WHERE tenant_id=$1",
            *vals,
        )
    else:
        await db.execute(
            "INSERT INTO phone_agents (tenant_id, greeting, special_instructions, is_active) VALUES ($1,$2,$3,$4)",
            tenant_id,
            body.greeting or "Thank you for calling! How can I help you today?",
            body.special_instructions or "",
            bool(body.is_active),
        )

    updated = await db.fetchrow("SELECT * FROM phone_agents WHERE tenant_id=$1", tenant_id)
    return dict(updated)


@router.get("/phone-agents/{tenant_id}/calls")
async def admin_phone_agent_calls(
    tenant_id: int,
    current_user=Depends(_require_admin),
    db=Depends(get_db),
):
    """Get recent calls for a tenant's phone agent."""
    rows = await db.fetch(
        "SELECT id, caller_number, duration_secs, summary, order_created, created_at "
        "FROM phone_calls WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50",
        tenant_id,
    )
    return [dict(r) for r in rows]
