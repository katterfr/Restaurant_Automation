"""
AI image and video generation via fal.ai.
Images: fal-ai/flux-pro (Flux Pro — photorealistic, great for food)
Videos: fal-ai/kling-video/v1.6/standard (text-to-video + image-to-video)
"""
import httpx
from core.config import settings

FAL_BASE = "https://fal.run"
FAL_QUEUE = "https://queue.fal.run"

IMAGE_MODEL = "fal-ai/flux-pro"
VIDEO_MODEL_T2V = "fal-ai/kling-video/v1.6/standard/text-to-video"
VIDEO_MODEL_I2V = "fal-ai/kling-video/v1.6/standard/image-to-video"


def is_configured() -> bool:
    return bool(settings.fal_api_key)


def _headers() -> dict:
    return {
        "Authorization": f"Key {settings.fal_api_key}",
        "Content-Type": "application/json",
    }


# ── Prompt enhancement ────────────────────────────────────────────────────────

def enhance_image_prompt(user_prompt: str, restaurant_name: str, style: str) -> str:
    style_suffixes = {
        "photorealistic": "professional food photography, DSLR quality, perfect lighting, shallow depth of field, 8K",
        "vibrant":        "vibrant colors, bold composition, eye-catching, high saturation, advertising quality",
        "minimal":        "clean minimalist style, white background, elegant plating, editorial photography",
        "dark_moody":     "dark moody atmosphere, dramatic lighting, cinematic, chiaroscuro, restaurant ambiance",
        "social":         "Instagram-worthy, lifestyle photography, casual and inviting, warm tones",
    }
    suffix = style_suffixes.get(style, "professional advertising photography, high quality")
    return f"{user_prompt}, for {restaurant_name} restaurant advertisement, {suffix}, no text overlays"


def enhance_video_prompt(user_prompt: str, restaurant_name: str) -> str:
    return (
        f"{user_prompt}, cinematic food advertising video for {restaurant_name}, "
        "smooth camera movement, professional lighting, appetizing, high quality, 4K"
    )


# ── Image generation (synchronous — fal.ai runs Flux in ~10s) ────────────────

async def generate_image(prompt: str, aspect_ratio: str = "1:1") -> dict:
    """Returns {"url": "...", "width": n, "height": n}"""
    # fal.ai Flux Pro uses image_size string format
    size_map = {
        "1:1":   "square_hd",
        "16:9":  "landscape_16_9",
        "9:16":  "portrait_16_9",
        "4:5":   "portrait_4_5",
    }
    image_size = size_map.get(aspect_ratio, "square_hd")

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{FAL_BASE}/{IMAGE_MODEL}",
            headers=_headers(),
            json={
                "prompt": prompt,
                "image_size": image_size,
                "num_images": 1,
                "enable_safety_checker": True,
                "safety_tolerance": "2",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        img = data["images"][0]
        return {"url": img["url"], "width": img.get("width", 1024), "height": img.get("height", 1024)}


# ── Video generation (async queue — Kling takes 60-120s) ─────────────────────

async def submit_video(
    prompt: str,
    image_url: str | None = None,
    duration: int = 5,
    aspect_ratio: str = "16:9",
) -> dict:
    """
    Submits video to fal.ai queue.
    Returns {"request_id": "...", "status_url": "...", "response_url": "..."}
    """
    model = VIDEO_MODEL_I2V if image_url else VIDEO_MODEL_T2V
    payload: dict = {
        "prompt": prompt,
        "duration": str(duration),
        "aspect_ratio": aspect_ratio,
    }
    if image_url:
        payload["image_url"] = image_url

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{FAL_QUEUE}/{model}",
            headers=_headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "request_id": data["request_id"],
            "status_url":   data["status_url"],
            "response_url": data["response_url"],
        }


async def poll_video_status(status_url: str) -> dict:
    """
    Returns {"status": "IN_QUEUE"|"IN_PROGRESS"|"COMPLETED"|"FAILED", "video_url": str|None}
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(status_url, headers=_headers())
        resp.raise_for_status()
        data = resp.json()

    status = data.get("status", "IN_QUEUE")
    video_url = None

    if status == "COMPLETED":
        output = data.get("output") or {}
        videos = output.get("video") or output.get("videos") or []
        if isinstance(videos, list) and videos:
            video_url = videos[0].get("url") if isinstance(videos[0], dict) else videos[0]
        elif isinstance(videos, dict):
            video_url = videos.get("url")

    return {"status": status, "video_url": video_url, "raw": data}
