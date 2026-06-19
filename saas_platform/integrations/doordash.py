"""
DoorDash Drive API — platform-level integration for SaaS.
Platform credentials set once in Railway; per-tenant store_id stored in DB.
"""
import base64
import time
import httpx
import jwt as pyjwt
from core.config import settings

DRIVE_API = "https://openapi.doordash.com"


def is_configured() -> bool:
    return bool(
        settings.doordash_developer_id
        and settings.doordash_key_id
        and settings.doordash_signing_secret
    )


def _build_jwt() -> str:
    now = int(time.time())
    payload = {
        "aud": "doordash",
        "iss": settings.doordash_developer_id,
        "kid": settings.doordash_key_id,
        "iat": now,
        "exp": now + 300,
    }
    secret = base64.b64decode(settings.doordash_signing_secret or "")
    return pyjwt.encode(payload, secret, algorithm="HS256", headers={"dd-ver": "DD-JWT-V1"})


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_build_jwt()}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def verify_store(store_id: str) -> dict:
    """Verify store exists and platform credentials are valid."""
    if not is_configured():
        raise ValueError("DoorDash platform credentials not configured in Railway")

    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{DRIVE_API}/developer/v1/stores/{store_id}",
            headers=_headers(),
        )
        if r.status_code == 401:
            raise ValueError("DoorDash platform credentials are invalid — check Railway vars")
        if r.status_code == 404:
            raise ValueError(f"Store ID '{store_id}' not found in DoorDash")
        if not r.is_success:
            raise ValueError(f"DoorDash returned {r.status_code}: {r.text[:200]}")
        return r.json()
