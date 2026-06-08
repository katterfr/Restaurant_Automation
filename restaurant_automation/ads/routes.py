"""
ads/routes.py — REST API endpoints for the ads & social media module.
Mounts at /ads/*

Endpoints:
  POST /ads/campaign          — Generate + launch a full campaign
  POST /ads/preview           — Generate copy + images only (no posting)
  POST /ads/post-organic      — Post existing AdPackage to social only
  GET  /ads/campaigns         — List campaign history
  GET  /ads/campaigns/{ad_id} — Get single campaign details
  GET  /ads/performance       — Aggregate paid ad performance metrics
  POST /ads/daily-special     — Trigger today's daily special ad
  POST /ads/flash-sale        — Trigger a flash-sale ad
  POST /ads/new-item          — Trigger a new-menu-item ad
  GET  /ads/assets            — List generated ad image assets
"""
from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from ads.campaign_manager import (
    CampaignConfig, CampaignResult, run_campaign,
    get_campaign_history, get_all_platform_performance, init_ads_db,
)
from ads.ad_generator import (
    create_ad_package, build_daily_special_ad,
    build_flash_sale_ad, build_new_item_ad, build_low_stock_ad,
)

router = APIRouter(prefix="/ads", tags=["ads"])
log = logging.getLogger(__name__)

ASSETS_DIR = Path("ads_assets")


# ── Request / Response models ─────────────────────────────────────────────────

class CampaignRequest(BaseModel):
    item_name:    str
    price:        float = 0.0
    promo_type:   str   = Field(
        default="featured_item",
        description="featured_item | flash_sale | new_item | daily_special | weekly_promo | low_stock | event"
    )
    context:      str   = ""
    website_url:  str   = ""

    # Organic social toggles
    post_facebook:  bool = True
    post_instagram: bool = True
    post_twitter:   bool = True
    post_linkedin:  bool = True
    post_tiktok:    bool = True

    # Paid ad toggles
    run_meta_ads:   bool = False
    run_google_ads: bool = False
    run_tiktok_ads: bool = False

    # Budgets (USD/day)
    meta_daily_budget:   float = 10.0
    google_daily_budget: float = 10.0
    tiktok_daily_budget: float = 20.0

    # PAUSED by default — set True to go live immediately
    auto_activate_paid: bool = False
    generate_images:    bool = True


class PreviewRequest(BaseModel):
    item_name:   str
    price:       float = 0.0
    promo_type:  str   = "featured_item"
    context:     str   = ""
    generate_images: bool = False   # False for fast preview, True for full


class FlashSaleRequest(BaseModel):
    item_name:      str
    original_price: float
    sale_price:     float
    post_organic:   bool = True
    run_paid:       bool = False


class NewItemRequest(BaseModel):
    item_name:   str
    price:       float
    description: str = ""
    post_organic: bool = True
    run_paid:     bool = False


class DailySpecialRequest(BaseModel):
    item_name: str
    price:     float
    post_organic: bool = True
    run_paid:     bool = False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/campaign", response_model=dict)
async def launch_campaign(body: CampaignRequest, background_tasks: BackgroundTasks):
    """
    Generate AI ad copy + images and simultaneously post to all enabled social
    platforms and launch paid campaigns. Returns immediately with ad_id;
    posting continues in background.
    """
    config = CampaignConfig(
        item_name=body.item_name,
        price=body.price,
        promo_type=body.promo_type,
        context=body.context,
        website_url=body.website_url,
        post_facebook=body.post_facebook,
        post_instagram=body.post_instagram,
        post_twitter=body.post_twitter,
        post_linkedin=body.post_linkedin,
        post_tiktok=body.post_tiktok,
        run_meta_ads=body.run_meta_ads,
        run_google_ads=body.run_google_ads,
        run_tiktok_ads=body.run_tiktok_ads,
        meta_daily_budget=body.meta_daily_budget,
        google_daily_budget=body.google_daily_budget,
        tiktok_daily_budget=body.tiktok_daily_budget,
        auto_activate_paid=body.auto_activate_paid,
        generate_images=body.generate_images,
    )

    result = await run_campaign(config)
    return {
        "success": True,
        "summary": result.summary(),
        "social_results": result.social_results,
        "paid_results":   result.paid_results,
        "errors":         result.errors,
    }


@router.post("/preview")
async def preview_ad(body: PreviewRequest):
    """
    Generate ad copy (and optionally images) without posting anything.
    Use this to review content before launching a campaign.
    """
    pkg = await create_ad_package(
        item_name=body.item_name,
        price=body.price,
        promo_type=body.promo_type,
        context=body.context,
        generate_images=body.generate_images,
    )
    return {
        "ad_id":      pkg.ad_id,
        "item_name":  pkg.item_name,
        "promo_type": pkg.promo_type,
        "platform_copy": {
            k: {
                "headline":   v.headline,
                "body":       v.body,
                "cta":        v.cta,
                "hashtags":   v.hashtags,
                "full_post":  v.full_post(),
                "char_count": v.character_count,
            }
            for k, v in pkg.platform_copy.items()
        },
        "images": [
            {"format": img.format, "size": img.size, "path": img.local_path}
            for img in pkg.images
        ],
    }


@router.post("/daily-special")
async def daily_special(body: DailySpecialRequest):
    """Trigger a daily special ad — optimized for 'today only' urgency."""
    pkg = await build_daily_special_ad(body.item_name, body.price)
    if not body.post_organic:
        return {"ad_id": pkg.ad_id, "status": "preview_only", "package": pkg.to_dict()}

    config = CampaignConfig(
        item_name=body.item_name, price=body.price,
        promo_type="daily_special",
        run_meta_ads=body.run_paid,
        run_google_ads=body.run_paid,
        run_tiktok_ads=body.run_paid,
    )
    result = await run_campaign(config)
    return {"success": True, "summary": result.summary(), "social": result.social_results}


@router.post("/flash-sale")
async def flash_sale(body: FlashSaleRequest):
    """Trigger a flash-sale ad with before/after pricing."""
    pkg = await build_flash_sale_ad(body.item_name, body.original_price, body.sale_price)
    if not body.post_organic:
        return {"ad_id": pkg.ad_id, "status": "preview_only"}

    discount_pct = round((1 - body.sale_price / body.original_price) * 100)
    config = CampaignConfig(
        item_name=body.item_name, price=body.sale_price,
        promo_type="flash_sale",
        context=f"{discount_pct}% off! Was ${body.original_price:.2f}, now ${body.sale_price:.2f}.",
        run_meta_ads=body.run_paid,
        run_google_ads=body.run_paid,
        run_tiktok_ads=body.run_paid,
    )
    result = await run_campaign(config)
    return {"success": True, "summary": result.summary(), "social": result.social_results}


@router.post("/new-item")
async def new_item_ad(body: NewItemRequest):
    """Announce a new menu item across all platforms."""
    pkg = await build_new_item_ad(body.item_name, body.price, body.description)
    if not body.post_organic:
        return {"ad_id": pkg.ad_id, "status": "preview_only"}

    config = CampaignConfig(
        item_name=body.item_name, price=body.price,
        promo_type="new_item",
        context=body.description,
        run_meta_ads=body.run_paid,
        run_google_ads=body.run_paid,
        run_tiktok_ads=body.run_paid,
    )
    result = await run_campaign(config)
    return {"success": True, "summary": result.summary(), "social": result.social_results}


@router.get("/campaigns")
async def list_campaigns(limit: int = 50):
    """List all past campaigns with results."""
    return await get_campaign_history(limit=limit)


@router.get("/campaigns/{ad_id}")
async def get_campaign(ad_id: str):
    """Get detailed results for a single campaign."""
    history = await get_campaign_history(limit=200)
    match = next((c for c in history if c["ad_id"] == ad_id), None)
    if not match:
        raise HTTPException(404, f"Campaign not found: {ad_id}")
    return match


@router.get("/performance")
async def platform_performance():
    """Aggregate paid ad performance from Google, Meta, and TikTok."""
    return await get_all_platform_performance()


@router.get("/assets")
async def list_assets():
    """List all generated ad image assets and manifest files."""
    if not ASSETS_DIR.exists():
        return []
    files = []
    for f in sorted(ASSETS_DIR.iterdir(), reverse=True):
        if f.suffix in (".png", ".jpg", ".jpeg"):
            files.append({
                "filename": f.name,
                "path":     str(f),
                "size_kb":  round(f.stat().st_size / 1024, 1),
            })
    return files


@router.get("/assets/{filename}")
async def get_asset_manifest(filename: str):
    """Get the manifest JSON for a specific ad ID."""
    manifest = ASSETS_DIR / filename
    if not manifest.exists():
        raise HTTPException(404, "Asset not found")
    return json.loads(manifest.read_text())
