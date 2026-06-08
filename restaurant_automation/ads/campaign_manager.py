"""
ads/campaign_manager.py — Central orchestrator for all ad and social media operations.

Single entry point that:
  1. Generates AI copy + images (AdPackage)
  2. Posts organically to all social platforms simultaneously
  3. Launches paid campaigns on Meta Ads, Google Ads, TikTok Ads
  4. Records results to SQLite ad_campaigns table
  5. Returns a unified CampaignResult

Trigger modes:
  - Manual API call (POST /ads/campaign)
  - Event-driven (new_item, flash_sale, low_stock via bus)
  - Scheduled (daily_special every morning, weekly_promo on Monday)
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aiosqlite

from ads.ad_generator import AdPackage, create_ad_package
from ads.social.facebook import post_facebook_full
from ads.social.twitter import post_twitter_full
from ads.social.linkedin import post_linkedin_full
from ads.social.tiktok import post_tiktok_full
from ads.platforms.meta_ads import launch_meta_campaign
from ads.platforms.google_ads import launch_google_campaign
from ads.platforms.tiktok_ads import launch_tiktok_campaign
from orchestrator.config import settings

log = logging.getLogger(__name__)
DB_PATH = "restaurant.db"

DDL = """
CREATE TABLE IF NOT EXISTS ad_campaigns (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id           TEXT UNIQUE NOT NULL,
    item_name       TEXT NOT NULL,
    promo_type      TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    social_results  TEXT,    -- JSON: {platform: result_dict}
    paid_results    TEXT,    -- JSON: {platform: result_dict}
    status          TEXT NOT NULL DEFAULT 'pending',
    notes           TEXT
);
"""


async def init_ads_db(db_path: str = DB_PATH) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(DDL)
        await db.commit()


@dataclass
class CampaignConfig:
    """Configuration for a full campaign launch."""
    # Content
    item_name:    str
    price:        float = 0.0
    promo_type:   str   = "featured_item"
    context:      str   = ""
    website_url:  str   = ""

    # Organic social (which platforms to post to)
    post_facebook:  bool = True
    post_instagram: bool = True
    post_twitter:   bool = True
    post_linkedin:  bool = True
    post_tiktok:    bool = True

    # Paid ads (which platforms to launch campaigns on)
    run_meta_ads:    bool = False
    run_google_ads:  bool = False
    run_tiktok_ads:  bool = False

    # Paid budgets (USD per day)
    meta_daily_budget:   float = 10.0
    google_daily_budget: float = 10.0
    tiktok_daily_budget: float = 20.0

    # Auto-activate paid campaigns (False = create as PAUSED for review)
    auto_activate_paid: bool = False

    # Image generation
    generate_images: bool = True


@dataclass
class CampaignResult:
    ad_id:          str
    item_name:      str
    promo_type:     str
    created_at:     str
    social_results: dict = field(default_factory=dict)
    paid_results:   dict = field(default_factory=dict)
    errors:         list = field(default_factory=list)

    def summary(self) -> dict:
        social_ok = sum(1 for v in self.social_results.values()
                        if v.get("status") == "published" or "feed" in v)
        paid_ok   = sum(1 for v in self.paid_results.values()
                        if "campaign_id" in v or "campaign" in v)
        return {
            "ad_id":            self.ad_id,
            "item_name":        self.item_name,
            "promo_type":       self.promo_type,
            "social_platforms": social_ok,
            "paid_campaigns":   paid_ok,
            "errors":           len(self.errors),
            "created_at":       self.created_at,
        }


async def _save_campaign(result: CampaignResult, db_path: str = DB_PATH) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            INSERT OR REPLACE INTO ad_campaigns
                (ad_id, item_name, promo_type, created_at, social_results, paid_results, status)
            VALUES (?,?,?,?,?,?,'completed')
        """, (
            result.ad_id,
            result.item_name,
            result.promo_type,
            result.created_at,
            json.dumps(result.social_results),
            json.dumps(result.paid_results),
        ))
        await db.commit()


async def run_campaign(config: CampaignConfig) -> CampaignResult:
    """
    Full pipeline: generate → post organic → launch paid → save → return.
    All social posts run concurrently. Paid campaigns run concurrently after.
    """
    log.info("CAMPAIGN START | item=%s | promo=%s", config.item_name, config.promo_type)

    # ── Step 1: Generate AI ad package ──────────────────────────────────────
    pkg = await create_ad_package(
        item_name=config.item_name,
        price=config.price,
        promo_type=config.promo_type,
        context=config.context,
        generate_images=config.generate_images,
    )

    result = CampaignResult(
        ad_id=pkg.ad_id,
        item_name=config.item_name,
        promo_type=config.promo_type,
        created_at=pkg.created_at,
    )

    # Find images by format
    def _img(fmt: str) -> Optional[str]:
        for img in pkg.images:
            if img.format == fmt:
                return img.local_path
        return pkg.images[0].local_path if pkg.images else None

    square_img   = _img("square")
    portrait_img = _img("portrait")

    # ── Step 2: Organic social posting (all platforms concurrently) ──────────
    social_tasks = {}

    if config.post_facebook and "facebook" in pkg.platform_copy:
        social_tasks["facebook"] = post_facebook_full(pkg.platform_copy["facebook"], square_img)

    if config.post_instagram and "instagram" in pkg.platform_copy:
        social_tasks["instagram"] = post_instagram_full_wrapper(pkg, square_img, portrait_img)

    if config.post_twitter and "twitter" in pkg.platform_copy:
        social_tasks["twitter"] = post_twitter_full(pkg.platform_copy["twitter"], square_img)

    if config.post_linkedin and "linkedin" in pkg.platform_copy:
        social_tasks["linkedin"] = post_linkedin_full(pkg.platform_copy["linkedin"], square_img)

    if config.post_tiktok and "tiktok" in pkg.platform_copy:
        social_tasks["tiktok"] = post_tiktok_full(pkg.platform_copy["tiktok"], portrait_img)

    if social_tasks:
        social_results_raw = await asyncio.gather(
            *social_tasks.values(), return_exceptions=True
        )
        for platform, res in zip(social_tasks.keys(), social_results_raw):
            if isinstance(res, Exception):
                result.errors.append(f"{platform}: {str(res)}")
                result.social_results[platform] = {"status": "error", "error": str(res)}
            else:
                result.social_results[platform] = res
            log.info("SOCIAL %s | %s", platform.upper(), result.social_results[platform].get("status", "?"))

    # ── Step 3: Paid ad campaigns (concurrently) ────────────────────────────
    paid_tasks = {}

    if config.run_meta_ads:
        paid_tasks["meta_ads"] = launch_meta_campaign(
            pkg, config.meta_daily_budget,
            website_url=config.website_url,
            auto_activate=config.auto_activate_paid,
        )
    if config.run_google_ads:
        paid_tasks["google_ads"] = launch_google_campaign(
            pkg, config.google_daily_budget,
            website_url=config.website_url,
            auto_activate=config.auto_activate_paid,
        )
    if config.run_tiktok_ads:
        paid_tasks["tiktok_ads"] = launch_tiktok_campaign(
            pkg, config.tiktok_daily_budget,
            website_url=config.website_url,
            auto_activate=config.auto_activate_paid,
        )

    if paid_tasks:
        paid_results_raw = await asyncio.gather(
            *paid_tasks.values(), return_exceptions=True
        )
        for platform, res in zip(paid_tasks.keys(), paid_results_raw):
            if isinstance(res, Exception):
                result.errors.append(f"{platform}: {str(res)}")
                result.paid_results[platform] = {"status": "error", "error": str(res)}
            else:
                result.paid_results[platform] = res

    # ── Step 4: Persist ──────────────────────────────────────────────────────
    await _save_campaign(result)

    log.info("CAMPAIGN COMPLETE | id=%s | social=%d | paid=%d | errors=%d",
             result.ad_id,
             len([v for v in result.social_results.values() if v.get("status") == "published"]),
             len([v for v in result.paid_results.values() if "campaign_id" in v]),
             len(result.errors))

    return result


async def post_instagram_full_wrapper(pkg: AdPackage, square: Optional[str], portrait: Optional[str]) -> dict:
    """Wrapper to import and call Instagram posting inline."""
    from ads.social.facebook import post_instagram_full
    copy = pkg.platform_copy.get("instagram")
    if not copy:
        return {"skipped": True, "reason": "no_instagram_copy"}
    return await post_instagram_full(copy, square)


# ── Campaign history ──────────────────────────────────────────────────────────

async def get_campaign_history(limit: int = 50, db_path: str = DB_PATH) -> list[dict]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT * FROM ad_campaigns ORDER BY created_at DESC LIMIT ?
        """, (limit,)) as cur:
            rows = [dict(r) for r in await cur.fetchall()]
    for row in rows:
        row["social_results"] = json.loads(row.get("social_results") or "{}")
        row["paid_results"]   = json.loads(row.get("paid_results")   or "{}")
    return rows


async def get_all_platform_performance() -> dict:
    """Aggregate performance metrics across all paid ad platforms."""
    from ads.platforms.google_ads import get_campaign_performance as google_perf
    from ads.platforms.meta_ads import get_campaign_insights
    from ads.platforms.tiktok_ads import get_campaign_performance as tiktok_perf

    results = await asyncio.gather(
        google_perf(7),
        tiktok_perf(7),
        return_exceptions=True,
    )

    return {
        "google_ads":  results[0] if not isinstance(results[0], Exception) else [],
        "tiktok_ads":  results[1] if not isinstance(results[1], Exception) else [],
        "meta_ads":    [],  # Individual campaign IDs needed for Meta insights
    }
