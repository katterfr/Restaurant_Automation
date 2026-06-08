"""
orchestrator/scheduler.py — APScheduler background jobs.
Jobs:
  - Nightly @ 2:00 AM   : Generate full XLSX workbook + email with attachment
  - Every 15 min        : Check low-stock items, emit alerts, send digest
  - Hourly              : Full inventory sync to all platforms
  - Weekly (Mon 3 AM)   : Weekly P&L workbook + email summary
"""
from __future__ import annotations
import logging
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from orchestrator.config import settings

log = logging.getLogger(__name__)
_scheduler = AsyncIOScheduler(timezone=settings.restaurant_timezone)


# ── Jobs ─────────────────────────────────────────────────────────────────────

async def _generate_nightly_report() -> None:
    """Generate yesterday's full accounting workbook and email it."""
    from accounting.spreadsheet import generate_workbook
    from notifications.email_alerts import send_nightly_report

    today     = date.today()
    yesterday = today - timedelta(days=1)
    out_dir   = Path("reports") / today.strftime("%Y-%m")
    filename  = f"accounting_{yesterday.isoformat()}.xlsx"
    out_path  = out_dir / filename

    try:
        path = await generate_workbook(
            start_date=yesterday,
            end_date=yesterday,
            restaurant_name=settings.restaurant_name,
            output_path=out_path,
        )
        log.info("📊 NIGHTLY REPORT | saved → %s", path)

        # Email report with XLSX attachment
        sent = await send_nightly_report(
            report_path=path,
            start=yesterday,
            end=yesterday,
        )
        log.info("NIGHTLY REPORT EMAIL | sent=%s", sent)
    except Exception as e:
        log.error("NIGHTLY REPORT FAILED | %s", e)


async def _check_low_stock() -> None:
    """
    Scan inventory for low-stock items:
      - Emit INVENTORY_LOW bus event per item (triggers throttled per-item email)
      - Send a single batched digest email if 2+ items are low
    """
    from inventory.inventory_db import get_low_stock
    from orchestrator.bus import bus, Events
    from notifications.email_alerts import send_low_stock_digest

    try:
        low_items = await get_low_stock()

        for item in low_items:
            await bus.publish(Events.INVENTORY_LOW, item)

        # Send digest only when multiple items are low (avoids email spam)
        if len(low_items) >= 2:
            await send_low_stock_digest(low_items)
            log.info("LOW STOCK DIGEST | sent for %d items", len(low_items))
        elif low_items:
            log.warning("LOW STOCK CHECK | 1 item below reorder: %s", low_items[0]["sku"])

    except Exception as e:
        log.error("LOW STOCK CHECK FAILED | %s", e)


async def _sync_all_platforms() -> None:
    """Full inventory sync to website, DoorDash, and Uber Eats."""
    from inventory.inventory_db import get_all_items
    from sync.website_sync import push_menu_item
    from sync.doordash_sync import update_item_availability as dd_avail
    from sync.ubereats_sync import update_item_availability as ue_avail
    from notifications.email_alerts import send_platform_sync_failure

    try:
        items = await get_all_items()
        sync_errors: list[tuple[str, str]] = []

        for item in items:
            available = item["qty_on_hand"] > 0
            try:
                await push_menu_item({**item, "available": available})
            except Exception as e:
                sync_errors.append(("website", str(e)))

            try:
                await dd_avail(item["sku"], available)
            except Exception as e:
                sync_errors.append(("doordash", str(e)))

            try:
                await ue_avail(item["sku"], available)
            except Exception as e:
                sync_errors.append(("ubereats", str(e)))

        log.info("PLATFORM SYNC | %d items synced | %d errors", len(items), len(sync_errors))

        # Email on persistent sync failures
        for platform, error in sync_errors[:3]:   # cap at 3 alerts per cycle
            await send_platform_sync_failure(platform, error)

    except Exception as e:
        log.error("PLATFORM SYNC FAILED | %s", e)


async def _generate_weekly_report() -> None:
    """Weekly P&L report covering the past 7 days — emailed with XLSX attachment."""
    from accounting.spreadsheet import generate_workbook
    from accounting.pnl import get_pnl_statement
    from notifications.email_alerts import send_weekly_pnl

    today = date.today()
    start = today - timedelta(days=7)
    out_path = Path("reports") / f"weekly_pnl_{start.isoformat()}_{today.isoformat()}.xlsx"

    try:
        path = await generate_workbook(
            start_date=start,
            end_date=today,
            restaurant_name=settings.restaurant_name,
            output_path=out_path,
        )
        pnl = await get_pnl_statement(start, today)
        sent = await send_weekly_pnl(report_path=path, start=start, end=today, pnl=pnl)
        log.info("📈 WEEKLY REPORT | saved → %s | emailed=%s", path, sent)
    except Exception as e:
        log.error("WEEKLY REPORT FAILED | %s", e)


# ── Scheduler lifecycle ───────────────────────────────────────────────────────

def start_scheduler() -> None:
    _scheduler.add_job(
        _generate_nightly_report,
        CronTrigger(hour=2, minute=0, timezone=settings.restaurant_timezone),
        id="nightly_report", replace_existing=True,
    )
    _scheduler.add_job(
        _check_low_stock,
        CronTrigger(minute="*/15", timezone=settings.restaurant_timezone),
        id="low_stock_check", replace_existing=True,
    )
    _scheduler.add_job(
        _sync_all_platforms,
        CronTrigger(minute=0, timezone=settings.restaurant_timezone),
        id="platform_sync", replace_existing=True,
    )
    _scheduler.add_job(
        _generate_weekly_report,
        CronTrigger(day_of_week="mon", hour=3, minute=0,
                    timezone=settings.restaurant_timezone),
        id="weekly_report", replace_existing=True,
    )
    _scheduler.start()
    log.info("⏱  Scheduler started | 4 jobs registered")


def stop_scheduler() -> None:
    _scheduler.shutdown(wait=False)
    log.info("⏱  Scheduler stopped")
