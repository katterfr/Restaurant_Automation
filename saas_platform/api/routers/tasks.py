from __future__ import annotations
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional
import httpx
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

log = logging.getLogger(__name__)

from db.database import get_db
from api.routers.auth import get_current_user
from core.config import settings

router = APIRouter(prefix="/tasks", tags=["tasks"])

OWNER_ROLES = {"owner", "admin", "manager"}


def _require_owner(current_user=Depends(get_current_user)):
    if current_user["role"] not in OWNER_ROLES:
        raise HTTPException(403, "Owner access required")
    return current_user


# ─── DB setup ─────────────────────────────────────────────────────────────────

_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS ai_scheduled_tasks (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    created_by INTEGER REFERENCES users(id),
    label TEXT NOT NULL,
    prompt TEXT NOT NULL,
    schedule_type TEXT NOT NULL DEFAULT 'cron',
    cron_expression TEXT,
    run_at TIMESTAMPTZ,
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    is_active BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_task_runs (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES ai_scheduled_tasks(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    result_summary TEXT,
    action_type TEXT
);
"""


async def init_task_tables(db) -> None:
    await db.execute(_TABLES_SQL)


# ─── Cron helpers ─────────────────────────────────────────────────────────────

def _next_cron_run(cron_expr: str, after: datetime) -> Optional[datetime]:
    """Compute next UTC datetime after `after` for a 5-field cron expression."""
    try:
        from croniter import croniter
        it = croniter(cron_expr, after.replace(tzinfo=None))
        nxt = it.get_next(datetime)
        return nxt.replace(tzinfo=timezone.utc)
    except Exception:
        pass
    # Fallback: simple daily 09:00 UTC if croniter not available
    candidate = after.replace(hour=9, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
    if candidate <= after:
        candidate = candidate.replace(day=candidate.day + 1)
    return candidate


# ─── Task executor ────────────────────────────────────────────────────────────

_EXECUTOR_TOOLS = [
    {
        "name": "get_menu",
        "description": "Get current menu items.",
        "input_schema": {
            "type": "object",
            "properties": {
                "available_only": {"type": "boolean"},
                "category": {"type": "string"},
            },
        },
    },
    {
        "name": "add_menu_item",
        "description": "Add a new item to the menu.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "price": {"type": "number"},
                "category": {"type": "string"},
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
                "name": {"type": "string"},
                "available": {"type": "boolean"},
            },
            "required": ["name", "available"],
        },
    },
    {
        "name": "search_orders",
        "description": "Get recent orders.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer"},
                "status": {"type": "string"},
            },
        },
    },
    {
        "name": "update_order_status",
        "description": "Update the status of an order by ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "integer"},
                "status": {"type": "string", "enum": ["pending", "completed", "cancelled"]},
            },
            "required": ["order_id", "status"],
        },
    },
    {
        "name": "get_connected_platforms",
        "description": "Check connected social/ad platforms.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_social_post",
        "description": "Publish a post to connected social media platforms.",
        "input_schema": {
            "type": "object",
            "properties": {
                "platforms": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["meta", "tiktok_content", "youtube"]},
                },
                "content": {"type": "string"},
                "image_url": {"type": "string"},
                "video_url": {"type": "string"},
                "link_url": {"type": "string"},
                "media_type": {"type": "string", "enum": ["feed", "reel", "story"]},
            },
            "required": ["platforms", "content"],
        },
    },
    {
        "name": "create_accounting_entry",
        "description": "Add an income or expense accounting entry.",
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["income", "expense"]},
                "category": {"type": "string"},
                "amount": {"type": "number"},
                "description": {"type": "string"},
                "date": {"type": "string", "description": "ISO date YYYY-MM-DD, defaults to today"},
            },
            "required": ["type", "category", "amount", "description"],
        },
    },
    {
        "name": "create_ad_campaign",
        "description": "Launch a paid ad campaign.",
        "input_schema": {
            "type": "object",
            "properties": {
                "platform": {"type": "string", "enum": ["meta", "google", "tiktok", "snapchat", "pinterest"]},
                "headline": {"type": "string"},
                "body": {"type": "string"},
                "budget_daily": {"type": "number"},
                "image_url": {"type": "string"},
                "destination_url": {"type": "string"},
            },
            "required": ["platform", "headline", "body", "budget_daily"],
        },
    },
]


async def _execute_task_prompt(tenant_id: int, prompt: str, label: str, db) -> tuple[str, Optional[str]]:
    """Run a task prompt through Joyce's agentic loop. Returns (summary, action_type)."""
    if not settings.anthropic_api_key:
        return "AI not configured — add ANTHROPIC_API_KEY", None

    tenant = await db.fetchrow("SELECT name, plan, slug FROM tenants WHERE id=$1", tenant_id)
    if not tenant:
        return f"Tenant {tenant_id} not found", None

    stats = await db.fetchrow(
        """SELECT
             COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS today_orders,
             COALESCE(SUM(total) FILTER (WHERE created_at::date = CURRENT_DATE), 0) AS today_revenue
           FROM tenant_orders WHERE tenant_id=$1""",
        tenant_id,
    )
    menu = await db.fetchrow(
        "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE available) AS active FROM menu_items WHERE tenant_id=$1",
        tenant_id,
    )
    feat_rows = await db.fetch(
        "SELECT feature FROM tenant_features WHERE tenant_id=$1 AND enabled=TRUE", tenant_id
    )
    features_str = ", ".join(r["feature"] for r in feat_rows) or "none"

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    system_prompt = f"""You are Joyce, an autonomous AI scheduler running a SCHEDULED TASK for {tenant['name']}.

This is an automated execution — the owner has pre-approved this action. Execute it completely without asking for confirmation or permission.

## Restaurant Context
- Name: {tenant['name']} | Plan: {tenant['plan']}
- Today's orders: {stats['today_orders']} | Revenue: ${float(stats['today_revenue']):.2f}
- Menu items: {menu['total']} total, {menu['active']} active
- Enabled features: {features_str}
- Current time: {now_utc}

## Scheduled Task
Label: {label}

## Instructions
- Execute the task using your available tools
- Chain multiple tools as needed (e.g., get menu → write caption → post)
- Write compelling, restaurant-specific content — use the restaurant name
- Never use emojis
- After completing, give a brief 1-2 sentence summary of what was done"""

    messages: list[dict] = [{"role": "user", "content": prompt}]
    action_type: Optional[str] = None

    _headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    from integrations import meta as meta_api
    from integrations import tiktok as tiktok_api
    from integrations import youtube as youtube_api

    try:
        async with httpx.AsyncClient(timeout=120) as c:
            for _round in range(8):
                r = await c.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=_headers,
                    json={
                        "model": "claude-sonnet-4-6",
                        "max_tokens": 1024,
                        "system": system_prompt,
                        "messages": messages,
                        "tools": _EXECUTOR_TOOLS,
                    },
                )
                if not r.is_success:
                    log.error("Task executor Anthropic %s: %s", r.status_code, r.text[:200])
                    return f"AI error: {r.status_code}", None

                resp = r.json()
                tool_uses = [b for b in resp["content"] if b["type"] == "tool_use"]

                if not tool_uses:
                    reply = "\n".join(b["text"] for b in resp["content"] if b["type"] == "text")
                    return reply.strip() or "Task completed.", action_type

                tool_results = []
                for tu in tool_uses:
                    name = tu["name"]
                    inp = tu["input"]
                    tu_id = tu["id"]
                    result = ""

                    if name == "get_menu":
                        q = "SELECT name,category,price,available FROM menu_items WHERE tenant_id=$1"
                        args: list = [tenant_id]
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

                    elif name == "add_menu_item":
                        try:
                            row = await db.fetchrow(
                                "INSERT INTO menu_items (tenant_id,name,category,price,description,available) VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING *",
                                tenant_id, inp["name"], inp.get("category", "other"),
                                float(inp.get("price", 0)), inp.get("description"),
                            )
                            action_type = action_type or "menu_item_added"
                            result = f"Added '{row['name']}' at ${float(row['price']):.2f}."
                        except Exception as e:
                            result = f"Failed: {e}"

                    elif name == "toggle_menu_item":
                        row = await db.fetchrow(
                            "UPDATE menu_items SET available=$1 WHERE tenant_id=$2 AND LOWER(name)=LOWER($3) RETURNING name",
                            inp.get("available", True), tenant_id, inp.get("name", ""),
                        )
                        result = f"{'Enabled' if inp.get('available') else 'Disabled'} '{row['name']}'." if row else "Item not found."
                        action_type = action_type or "menu_toggled"

                    elif name == "search_orders":
                        limit = min(int(inp.get("limit", 5)), 10)
                        status = inp.get("status")
                        if status:
                            rows = await db.fetch(
                                "SELECT id,status,total FROM tenant_orders WHERE tenant_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT $3",
                                tenant_id, status, limit,
                            )
                        else:
                            rows = await db.fetch(
                                "SELECT id,status,total FROM tenant_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2",
                                tenant_id, limit,
                            )
                        if rows:
                            result = f"{len(rows)} orders: " + "; ".join(f"#{r['id']} {r['status']} ${float(r['total'] or 0):.2f}" for r in rows)
                        else:
                            result = "No orders found."

                    elif name == "update_order_status":
                        order_id = inp.get("order_id")
                        new_status = inp.get("status", "completed")
                        row = await db.fetchrow(
                            "UPDATE tenant_orders SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING id,status",
                            new_status, order_id, tenant_id,
                        )
                        result = f"Order #{row['id']} set to {row['status']}." if row else f"Order #{order_id} not found."
                        action_type = action_type or "order_updated"

                    elif name == "get_connected_platforms":
                        rows = await db.fetch(
                            "SELECT platform FROM platform_connections WHERE tenant_id=$1", tenant_id
                        )
                        platforms = [r["platform"] for r in rows]
                        result = f"Connected: {', '.join(platforms) or 'none'}"

                    elif name == "create_social_post":
                        platforms_req = inp.get("platforms", [])
                        content = inp.get("content", "")
                        image_url = inp.get("image_url")
                        video_url = inp.get("video_url")
                        link_url = inp.get("link_url")
                        media_type = inp.get("media_type", "feed")

                        row = await db.fetchrow(
                            "INSERT INTO social_posts (tenant_id,platforms,content,image_url,link_url,status) VALUES ($1,$2,$3,$4,$5,'publishing') RETURNING id",
                            tenant_id, json.dumps(platforms_req), content, image_url or video_url, link_url,
                        )
                        post_id = row["id"]
                        post_results: dict = {}

                        for platform in platforms_req:
                            conn = await db.fetchrow(
                                "SELECT * FROM platform_connections WHERE tenant_id=$1 AND platform=$2",
                                tenant_id, platform,
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
                                log.error("Task social post [%s]: %s", platform, e)
                                post_results[platform] = {"status": "failed", "error": str(e)[:200]}

                        ok = [p for p, v in post_results.items() if v["status"] == "published"]
                        final_status = "published" if ok else "failed"
                        await db.execute(
                            "UPDATE social_posts SET status=$1, platform_results=$2 WHERE id=$3",
                            final_status, json.dumps(post_results), post_id,
                        )
                        action_type = action_type or "social_post"
                        result = f"Posted to {', '.join(ok)}." if ok else f"Post failed: {post_results}"

                    elif name == "create_accounting_entry":
                        entry_type = inp.get("type", "expense")
                        category = inp.get("category", "Other")
                        amount = float(inp.get("amount", 0))
                        description = inp.get("description", "")
                        entry_date = inp.get("date") or datetime.now(timezone.utc).date().isoformat()
                        try:
                            row = await db.fetchrow(
                                "INSERT INTO accounting_entries (tenant_id,type,category,amount,description,date) "
                                "VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
                                tenant_id, entry_type, category, amount, description, entry_date,
                            )
                            action_type = action_type or "accounting_entry"
                            result = f"Added {entry_type} entry: {category} ${amount:.2f} — {description}"
                        except Exception as e:
                            result = f"Accounting entry failed: {e}"

                    tool_results.append({"type": "tool_result", "tool_use_id": tu_id, "content": result})

                messages.append({"role": "assistant", "content": resp["content"]})
                messages.append({"role": "user", "content": tool_results})

        return "Task completed.", action_type

    except Exception as e:
        log.error("Task executor error: %s", e)
        return f"Error: {e}", None


async def run_due_tasks(db) -> int:
    """Find and execute all tasks that are due. Returns count of tasks run."""
    await init_task_tables(db)
    now = datetime.now(timezone.utc)
    tasks = await db.fetch(
        """SELECT * FROM ai_scheduled_tasks
           WHERE is_active=TRUE
             AND next_run_at IS NOT NULL
             AND next_run_at <= $1""",
        now,
    )
    count = 0
    for task in tasks:
        task_dict = dict(task)
        task_id = task_dict["id"]
        tenant_id = task_dict["tenant_id"]

        run_row = await db.fetchrow(
            "INSERT INTO ai_task_runs (task_id,tenant_id) VALUES ($1,$2) RETURNING id",
            task_id, tenant_id,
        )
        run_id = run_row["id"]

        try:
            summary, action_type = await _execute_task_prompt(
                tenant_id, task_dict["prompt"], task_dict["label"], db
            )
            await db.execute(
                "UPDATE ai_task_runs SET status='success', completed_at=NOW(), result_summary=$1, action_type=$2 WHERE id=$3",
                summary[:1000], action_type, run_id,
            )
        except Exception as e:
            log.error("Task %s failed: %s", task_id, e)
            await db.execute(
                "UPDATE ai_task_runs SET status='failed', completed_at=NOW(), result_summary=$1 WHERE id=$2",
                str(e)[:500], run_id,
            )

        # Compute next run or deactivate one-time tasks
        if task_dict["schedule_type"] == "once":
            await db.execute(
                "UPDATE ai_scheduled_tasks SET last_run_at=NOW(), is_active=FALSE WHERE id=$1", task_id
            )
        else:
            cron_expr = task_dict.get("cron_expression") or "0 9 * * *"
            next_run = _next_cron_run(cron_expr, now)
            await db.execute(
                "UPDATE ai_scheduled_tasks SET last_run_at=NOW(), next_run_at=$1 WHERE id=$2",
                next_run, task_id,
            )
        count += 1

    return count


# ─── CRUD endpoints ───────────────────────────────────────────────────────────

class CreateTaskBody(BaseModel):
    label: str
    prompt: str
    schedule_type: str = "cron"
    cron_expression: Optional[str] = None
    run_at: Optional[str] = None
    timezone: str = "America/New_York"


@router.on_event("startup")
async def _ensure_tables():
    pass  # Tables created in main.py lifespan via init_task_tables


@router.get("")
async def list_tasks(current_user=Depends(_require_owner), db=Depends(get_db)):
    await init_task_tables(db)
    tid = current_user["tenant_id"]
    tasks = await db.fetch(
        "SELECT * FROM ai_scheduled_tasks WHERE tenant_id=$1 ORDER BY created_at DESC",
        tid,
    )
    result = []
    for t in tasks:
        td = dict(t)
        # Get last run
        last_run = await db.fetchrow(
            "SELECT status, result_summary, started_at, action_type FROM ai_task_runs "
            "WHERE task_id=$1 ORDER BY started_at DESC LIMIT 1",
            td["id"],
        )
        td["last_run"] = dict(last_run) if last_run else None
        result.append(td)
    return result


@router.post("")
async def create_task(body: CreateTaskBody, current_user=Depends(_require_owner), db=Depends(get_db)):
    await init_task_tables(db)
    tid = current_user["tenant_id"]
    uid = current_user["id"]

    # Compute next_run_at
    now = datetime.now(timezone.utc)
    next_run_at = None
    if body.schedule_type == "cron" and body.cron_expression:
        next_run_at = _next_cron_run(body.cron_expression, now)
    elif body.schedule_type == "once" and body.run_at:
        try:
            next_run_at = datetime.fromisoformat(body.run_at.replace("Z", "+00:00"))
            if next_run_at.tzinfo is None:
                next_run_at = next_run_at.replace(tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(400, "Invalid run_at datetime")

    row = await db.fetchrow(
        """INSERT INTO ai_scheduled_tasks
           (tenant_id, created_by, label, prompt, schedule_type, cron_expression, run_at, timezone, next_run_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *""",
        tid, uid, body.label, body.prompt, body.schedule_type,
        body.cron_expression, next_run_at, body.timezone, next_run_at,
    )
    return dict(row)


@router.delete("/{task_id}")
async def delete_task(task_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    row = await db.fetchrow(
        "DELETE FROM ai_scheduled_tasks WHERE id=$1 AND tenant_id=$2 RETURNING id", task_id, tid
    )
    if not row:
        raise HTTPException(404, "Task not found")
    return {"deleted": task_id}


@router.patch("/{task_id}/toggle")
async def toggle_task(task_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    row = await db.fetchrow(
        "UPDATE ai_scheduled_tasks SET is_active = NOT is_active WHERE id=$1 AND tenant_id=$2 RETURNING id, is_active",
        task_id, tid,
    )
    if not row:
        raise HTTPException(404, "Task not found")
    return {"id": row["id"], "is_active": row["is_active"]}


@router.post("/{task_id}/run-now")
async def run_task_now(task_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    task = await db.fetchrow(
        "SELECT * FROM ai_scheduled_tasks WHERE id=$1 AND tenant_id=$2", task_id, tid
    )
    if not task:
        raise HTTPException(404, "Task not found")

    run_row = await db.fetchrow(
        "INSERT INTO ai_task_runs (task_id,tenant_id) VALUES ($1,$2) RETURNING id",
        task_id, tid,
    )
    run_id = run_row["id"]

    try:
        task_dict = dict(task)
        summary, action_type = await _execute_task_prompt(
            tid, task_dict["prompt"], task_dict["label"], db
        )
        await db.execute(
            "UPDATE ai_task_runs SET status='success', completed_at=NOW(), result_summary=$1, action_type=$2 WHERE id=$3",
            summary[:1000], action_type, run_id,
        )
        await db.execute("UPDATE ai_scheduled_tasks SET last_run_at=NOW() WHERE id=$1", task_id)
        return {"status": "success", "summary": summary, "action_type": action_type}
    except Exception as e:
        await db.execute(
            "UPDATE ai_task_runs SET status='failed', completed_at=NOW(), result_summary=$1 WHERE id=$2",
            str(e)[:500], run_id,
        )
        raise HTTPException(500, str(e))


@router.get("/{task_id}/runs")
async def get_task_runs(task_id: int, current_user=Depends(_require_owner), db=Depends(get_db)):
    tid = current_user["tenant_id"]
    task = await db.fetchrow(
        "SELECT id FROM ai_scheduled_tasks WHERE id=$1 AND tenant_id=$2", task_id, tid
    )
    if not task:
        raise HTTPException(404, "Task not found")
    runs = await db.fetch(
        "SELECT * FROM ai_task_runs WHERE task_id=$1 ORDER BY started_at DESC LIMIT 20",
        task_id,
    )
    return [dict(r) for r in runs]


@router.post("/run-due")
async def trigger_run_due(request: Request, db=Depends(get_db)):
    """Called by Railway cron (or internal scheduler) to execute due tasks."""
    secret = request.headers.get("x-cron-secret") or request.query_params.get("key")
    if settings.cron_secret and secret != settings.cron_secret:
        raise HTTPException(401, "Invalid cron secret")
    count = await run_due_tasks(db)
    return {"tasks_executed": count}
