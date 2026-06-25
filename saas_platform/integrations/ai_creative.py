"""
AI image and video generation via Replicate.
Images : black-forest-labs/flux-schnell  (~$0.003/image, ~4s)
Videos : minimax/video-01 (text-to-video) + stability-ai/stable-video-diffusion (image-to-video)
"""
import asyncio
import httpx
from core.config import settings

REPLICATE_BASE = "https://api.replicate.com/v1"

IMAGE_MODEL  = "black-forest-labs/flux-schnell"
VIDEO_T2V    = "minimax/video-01"
VIDEO_I2V    = "stability-ai/stable-video-diffusion"


def _token() -> str:
    return settings.replicate_api_token or settings.replicate_api_key or ""


def is_configured() -> bool:
    return bool(_token())


def _headers() -> dict:
    return {
        "Authorization": f"Token {_token()}",
        "Content-Type": "application/json",
        "Prefer": "wait",  # synchronous mode for fast models
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
        "smooth camera movement, professional lighting, appetizing, high quality"
    )


# ── Image generation ─────────────────────────────────────────────────────────

async def generate_image(prompt: str, aspect_ratio: str = "1:1") -> dict:
    """Returns {"url": "...", "width": n, "height": n}"""
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{REPLICATE_BASE}/models/{IMAGE_MODEL}/predictions",
            headers=_headers(),
            json={
                "input": {
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                    "num_outputs": 1,
                    "output_format": "webp",
                    "output_quality": 90,
                    "go_fast": True,
                }
            },
        )
        resp.raise_for_status()
        data = resp.json()

    # With Prefer: wait, the prediction is already complete
    if data.get("status") == "succeeded" and data.get("output"):
        url = data["output"][0] if isinstance(data["output"], list) else data["output"]
        return {"url": url, "width": 1024, "height": 1024}

    # If still processing, poll until done
    prediction_id = data.get("id")
    if not prediction_id:
        raise Exception("No prediction ID returned from Replicate")

    return await _poll_prediction(prediction_id, is_video=False)


# ── Video generation ──────────────────────────────────────────────────────────

async def submit_video(
    prompt: str,
    image_url: str | None = None,
    duration: int = 5,
    aspect_ratio: str = "16:9",
) -> dict:
    """Submit video job. Returns {"request_id", "status_url"}"""
    headers = _headers()
    headers.pop("Prefer", None)  # video generation is always async

    if image_url:
        model = VIDEO_I2V
        payload = {
            "input": {
                "input_image": image_url,
                "sizing_strategy": "maintain_aspect_ratio",
                "frames_per_second": 6,
                "motion_bucket_id": 127,
            }
        }
    else:
        model = VIDEO_T2V
        payload = {
            "input": {
                "prompt": prompt,
                "prompt_optimizer": True,
            }
        }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{REPLICATE_BASE}/models/{model}/predictions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    prediction_id = data.get("id")
    if not prediction_id:
        raise Exception("No prediction ID returned")

    status_url = f"{REPLICATE_BASE}/predictions/{prediction_id}"
    return {
        "request_id": prediction_id,
        "status_url": status_url,
        "response_url": status_url,
    }


async def poll_video_status(status_url: str) -> dict:
    """Returns {"status": "COMPLETED"|"FAILED"|"IN_PROGRESS", "video_url": str|None}"""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(status_url, headers={
            "Authorization": f"Token {_token()}",
        })
        resp.raise_for_status()
        data = resp.json()

    replicate_status = data.get("status", "starting")
    video_url = None

    if replicate_status == "succeeded":
        output = data.get("output")
        if isinstance(output, list) and output:
            video_url = output[0]
        elif isinstance(output, str):
            video_url = output
        return {"status": "COMPLETED", "video_url": video_url}

    if replicate_status == "failed":
        return {"status": "FAILED", "video_url": None}

    return {"status": "IN_PROGRESS", "video_url": None}


# ── Internal polling helper ───────────────────────────────────────────────────

async def _poll_prediction(prediction_id: str, is_video: bool, max_wait: int = 120) -> dict:
    url = f"{REPLICATE_BASE}/predictions/{prediction_id}"
    headers = {"Authorization": f"Token {_token()}"}
    deadline = asyncio.get_event_loop().time() + max_wait

    async with httpx.AsyncClient(timeout=30) as client:
        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(3)
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            status = data.get("status")

            if status == "succeeded":
                output = data.get("output")
                result_url = (output[0] if isinstance(output, list) else output) or ""
                if is_video:
                    return {"status": "COMPLETED", "video_url": result_url}
                return {"url": result_url, "width": 1024, "height": 1024}

            if status == "failed":
                raise Exception(data.get("error") or "Replicate generation failed")

    raise Exception("Generation timed out")
