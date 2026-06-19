"""
Uber Eats Orders API — platform-level integration for SaaS.
Platform credentials set once in Railway; per-tenant store_id stored in DB.
"""
import time
import httpx
from core.config import settings

UBER_API = "https://api.uber.com"
_TOKEN_CACHE: dict = {}


def is_configured() -> bool:
    return bool(settings.ubereats_client_id and settings.ubereats_client_secret)


async def _get_token() -> str:
    if _TOKEN_CACHE.get("expires_at", 0) > time.time() + 30:
        return _TOKEN_CACHE["token"]

    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"{UBER_API}/oauth/v2/token",
            data={
                "client_id": settings.ubereats_client_id,
                "client_secret": settings.ubereats_client_secret,
                "grant_type": "client_credentials",
                "scope": "eats.store eats.order",
            },
        )
        if r.status_code == 401:
            raise ValueError("Uber Eats platform credentials are invalid — check Railway vars")
        r.raise_for_status()
        body = r.json()
        _TOKEN_CACHE["token"] = body["access_token"]
        _TOKEN_CACHE["expires_at"] = time.time() + body.get("expires_in", 3600)
        return _TOKEN_CACHE["token"]


async def verify_store(store_id: str) -> dict:
    """Verify store exists and platform credentials are valid."""
    if not is_configured():
        raise ValueError("Uber Eats platform credentials not configured in Railway")

    token = await _get_token()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{UBER_API}/v2/eats/stores/{store_id}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        if r.status_code == 404:
            raise ValueError(f"Store UUID '{store_id}' not found in Uber Eats")
        if not r.is_success:
            raise ValueError(f"Uber Eats returned {r.status_code}: {r.text[:200]}")
        return r.json()
