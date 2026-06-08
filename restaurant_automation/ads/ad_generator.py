"""
ads/ad_generator.py — AI-powered ad creation engine.

Uses GPT-4o to write platform-optimized ad copy and DALL-E 3 to generate
high-quality images in every required format.

Outputs a fully structured AdPackage with:
  - Headlines, body copy, CTAs, hashtags per platform
  - DALL-E 3 images in square (1:1), portrait (9:16), landscape (16:9)
  - Platform-specific character-count-compliant copy variants
  - Downloadable image bytes saved to /ads_assets/

Supported triggers:
  - Manual (any menu item or promo)
  - Automatic (daily special, low-stock flash sale, new item, weekly promo)
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
from openai import AsyncOpenAI

from orchestrator.config import settings

log = logging.getLogger(__name__)
ASSETS_DIR = Path("ads_assets")
ASSETS_DIR.mkdir(exist_ok=True)


# ── Data structures ──────────────────────────────────────────────────────────

@dataclass
class PlatformCopy:
    platform: str
    headline: str
    body: str
    cta: str
    hashtags: list[str]
    character_count: int = 0

    def full_post(self) -> str:
        tags = " ".join(f"#{h}" for h in self.hashtags)
        return f"{self.headline}\n\n{self.body}\n\n{self.cta}\n\n{tags}"

    def __post_init__(self):
        self.character_count = len(self.full_post())


@dataclass
class AdImage:
    format: str          # "square" | "portrait" | "landscape" | "banner"
    size: str            # "1024x1024" | "1024x1792" | "1792x1024"
    url: str             # DALL-E temporary URL
    local_path: str      # saved local path
    prompt_used: str


@dataclass
class AdPackage:
    ad_id: str
    restaurant_name: str
    item_name: str
    promo_type: str
    created_at: str
    platform_copy: dict[str, PlatformCopy]   # platform → copy
    images: list[AdImage]
    raw_copy: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "ad_id":           self.ad_id,
            "restaurant_name": self.restaurant_name,
            "item_name":       self.item_name,
            "promo_type":      self.promo_type,
            "created_at":      self.created_at,
            "platform_copy": {
                k: {
                    "headline":        v.headline,
                    "body":            v.body,
                    "cta":             v.cta,
                    "hashtags":        v.hashtags,
                    "character_count": v.character_count,
                    "full_post":       v.full_post(),
                }
                for k, v in self.platform_copy.items()
            },
            "images": [
                {
                    "format":      img.format,
                    "size":        img.size,
                    "local_path":  img.local_path,
                    "prompt_used": img.prompt_used,
                }
                for img in self.images
            ],
        }


# ── Copy generation ──────────────────────────────────────────────────────────

COPY_SYSTEM_PROMPT = """
You are a top-tier restaurant marketing copywriter and social media expert.
Generate ad copy for {restaurant_name} that is mouth-watering, urgent, and on-brand.

Rules:
- Facebook/Instagram: emotional, conversational, emojis OK, up to 125 chars headline, 500 chars body
- Twitter/X: punchy, max 240 chars total (headline + body + CTA combined)
- LinkedIn: professional but warm, business lunch framing, no slang
- TikTok: Gen-Z energy, extremely short, trend-aware, 2-3 hashtags max + trending ones
- Google Ads: headline max 30 chars, description max 90 chars, no exclamation in headline
- Pinterest: visual-forward, lifestyle description, long-tail hashtags

Output ONLY a valid JSON object with this exact structure:
{{
  "item_description": "...",
  "image_prompt": "A professional food photography shot of {item_name}...",
  "platforms": {{
    "facebook":  {{"headline": "...", "body": "...", "cta": "...", "hashtags": ["...", "..."]}},
    "instagram": {{"headline": "...", "body": "...", "cta": "...", "hashtags": ["...", "...", "..."]}},
    "twitter":   {{"headline": "...", "body": "...", "cta": "...", "hashtags": ["...", "..."]}},
    "linkedin":  {{"headline": "...", "body": "...", "cta": "...", "hashtags": ["...", "..."]}},
    "tiktok":    {{"headline": "...", "body": "...", "cta": "...", "hashtags": ["...", "..."]}},
    "google_ads":{{"headline": "...", "body": "...", "cta": "...", "hashtags": []}},
    "pinterest": {{"headline": "...", "body": "...", "cta": "...", "hashtags": ["...", "...", "..."]}}
  }}
}}
"""

COPY_USER_PROMPT = """
Restaurant: {restaurant_name}
Item/Promo: {item_name}
Price: ${price}
Promo Type: {promo_type}
Extra Context: {context}

Generate compelling ad copy for ALL platforms listed above.
The copy should make people hungry and compel immediate action.
"""


async def generate_ad_copy(
    item_name: str,
    price: float = 0.0,
    promo_type: str = "featured_item",
    context: str = "",
) -> dict:
    """
    Use GPT-4o to generate platform-optimized ad copy.
    Returns the raw parsed JSON dict.
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    system = COPY_SYSTEM_PROMPT.format(
        restaurant_name=settings.restaurant_name,
        item_name=item_name,
    )
    user = COPY_USER_PROMPT.format(
        restaurant_name=settings.restaurant_name,
        item_name=item_name,
        price=price,
        promo_type=promo_type,
        context=context,
    )

    log.info("COPY GEN | item=%s | promo=%s", item_name, promo_type)
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        temperature=0.8,
        max_tokens=2000,
        response_format={"type": "json_object"},
    )

    raw = json.loads(response.choices[0].message.content)
    log.info("COPY GEN complete | platforms=%s", list(raw.get("platforms", {}).keys()))
    return raw


# ── Image generation ─────────────────────────────────────────────────────────

IMAGE_FORMATS = [
    ("square",    "1024x1024",  "perfect for Instagram feed, Facebook post, Pinterest"),
    ("portrait",  "1024x1792", "perfect for Instagram Stories, TikTok, Reels, Pinterest Pin"),
    ("landscape", "1792x1024", "perfect for Facebook cover, Twitter header, LinkedIn banner"),
]

IMAGE_SYSTEM_PROMPT = """
Food photography style. Ultra-realistic, professional restaurant advertisement.
{item_description}
Vibrant colors, perfect lighting, appetizing presentation.
Clean background or relevant restaurant ambiance.
No text, no watermarks, no logos.
{format_hint}
"""


async def generate_ad_image(
    base_prompt: str,
    format_name: str,
    size: str,
    format_hint: str,
    ad_id: str,
) -> AdImage:
    """Generate a single DALL-E 3 image and save it locally."""
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    full_prompt = IMAGE_SYSTEM_PROMPT.format(
        item_description=base_prompt,
        format_hint=format_hint,
    )

    log.info("IMAGE GEN | ad=%s | format=%s | size=%s", ad_id, format_name, size)
    response = await client.images.generate(
        model="dall-e-3",
        prompt=full_prompt,
        size=size,
        quality="hd",
        n=1,
    )

    image_url = response.data[0].url

    # Download and save locally
    local_filename = f"{ad_id}_{format_name}.png"
    local_path = ASSETS_DIR / local_filename

    async with httpx.AsyncClient(timeout=60) as http:
        img_resp = await http.get(image_url)
    local_path.write_bytes(img_resp.content)
    log.info("IMAGE SAVED | %s (%d KB)", local_path, len(img_resp.content) // 1024)

    return AdImage(
        format=format_name,
        size=size,
        url=image_url,
        local_path=str(local_path),
        prompt_used=full_prompt[:200],
    )


async def generate_all_images(
    image_prompt: str,
    ad_id: str,
    formats: list[tuple] = None,
) -> list[AdImage]:
    """Generate images in all formats concurrently."""
    targets = formats or IMAGE_FORMATS
    tasks = [
        generate_ad_image(
            base_prompt=image_prompt,
            format_name=fmt,
            size=size,
            format_hint=hint,
            ad_id=ad_id,
        )
        for fmt, size, hint in targets
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    images = []
    for r in results:
        if isinstance(r, Exception):
            log.error("IMAGE GEN FAILED | %s", r)
        else:
            images.append(r)
    return images


# ── Main entry point ─────────────────────────────────────────────────────────

async def create_ad_package(
    item_name: str,
    price: float = 0.0,
    promo_type: str = "featured_item",
    context: str = "",
    generate_images: bool = True,
) -> AdPackage:
    """
    Full pipeline: generate copy + images for all platforms.

    promo_type options:
      featured_item  — standard menu feature
      flash_sale     — limited-time discount
      new_item       — new menu addition
      daily_special  — today's special
      weekly_promo   — weekly deal
      event          — special event or holiday
      low_stock      — "last chance" urgency for near-depleted item
    """
    ad_id    = f"AD-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    created  = datetime.now(timezone.utc).isoformat()

    # Run copy generation and image generation concurrently
    copy_task   = generate_ad_copy(item_name, price, promo_type, context)
    image_coro  = None

    raw_copy = await copy_task
    image_prompt = raw_copy.get("image_prompt", f"Professional food photo of {item_name}")

    if generate_images:
        images = await generate_all_images(image_prompt, ad_id)
    else:
        images = []

    # Build per-platform copy objects
    platform_copy: dict[str, PlatformCopy] = {}
    for platform, data in raw_copy.get("platforms", {}).items():
        platform_copy[platform] = PlatformCopy(
            platform=platform,
            headline=data.get("headline", ""),
            body=data.get("body", ""),
            cta=data.get("cta", ""),
            hashtags=data.get("hashtags", []),
        )

    pkg = AdPackage(
        ad_id=ad_id,
        restaurant_name=settings.restaurant_name,
        item_name=item_name,
        promo_type=promo_type,
        created_at=created,
        platform_copy=platform_copy,
        images=images,
        raw_copy=raw_copy,
    )

    # Save package manifest
    manifest_path = ASSETS_DIR / f"{ad_id}_manifest.json"
    manifest_path.write_text(json.dumps(pkg.to_dict(), indent=2))
    log.info("AD PACKAGE READY | id=%s | platforms=%d | images=%d",
             ad_id, len(platform_copy), len(images))

    return pkg


# ── Convenience builders ─────────────────────────────────────────────────────

async def build_daily_special_ad(item_name: str, price: float) -> AdPackage:
    return await create_ad_package(
        item_name=item_name, price=price,
        promo_type="daily_special",
        context="This is today's special — create urgency around availability today only.",
    )


async def build_flash_sale_ad(item_name: str, original_price: float, sale_price: float) -> AdPackage:
    discount_pct = round((1 - sale_price / original_price) * 100)
    return await create_ad_package(
        item_name=item_name, price=sale_price,
        promo_type="flash_sale",
        context=f"{discount_pct}% off — flash sale, limited time only. Original price ${original_price:.2f}.",
    )


async def build_new_item_ad(item_name: str, price: float, description: str = "") -> AdPackage:
    return await create_ad_package(
        item_name=item_name, price=price,
        promo_type="new_item",
        context=f"Brand new menu item! {description}. Just launched — first to try it.",
    )


async def build_low_stock_ad(item_name: str, qty_remaining: int) -> AdPackage:
    return await create_ad_package(
        item_name=item_name, price=0.0,
        promo_type="low_stock",
        context=f"Only {qty_remaining} left! Last chance to get this before it's gone.",
        generate_images=False,   # Skip images for speed on urgent alerts
    )
