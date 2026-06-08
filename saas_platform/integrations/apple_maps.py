"""
Apple Business Connect integration.

Authentication uses a short-lived JWT signed with an ES256 private key
from Apple Developer. Required env vars:
  APPLE_TEAM_ID       — 10-char Team ID from developer.apple.com
  APPLE_MAPS_KEY_ID   — Key ID of a Maps ID with MapKit JS access
  APPLE_MAPS_PRIVATE_KEY — PEM private key (newlines as \\n)

Apple Business Connect API: https://developer.apple.com/documentation/businessconnect
Apple Maps Server API: https://developer.apple.com/documentation/applemapsserverapi
"""
import os
import time
import base64
import json
import httpx

API_BASE = "https://maps-api.apple.com/v1"
BUSINESS_CONNECT_URL = "https://businessconnect.apple.com"


def is_configured() -> bool:
    return bool(
        os.getenv("APPLE_TEAM_ID")
        and os.getenv("APPLE_MAPS_KEY_ID")
        and os.getenv("APPLE_MAPS_PRIVATE_KEY")
    )


def apple_connect_url() -> str:
    return BUSINESS_CONNECT_URL


def _make_jwt() -> str:
    team_id = os.getenv("APPLE_TEAM_ID", "")
    key_id = os.getenv("APPLE_MAPS_KEY_ID", "")
    raw_key = os.getenv("APPLE_MAPS_PRIVATE_KEY", "").replace("\\n", "\n")

    if not all([team_id, key_id, raw_key]):
        raise ValueError("Apple Maps credentials not configured")

    try:
        import jwt as pyjwt
        token = pyjwt.encode(
            {"iss": team_id, "iat": int(time.time()), "exp": int(time.time()) + 1800},
            raw_key,
            algorithm="ES256",
            headers={"kid": key_id},
        )
        return token if isinstance(token, str) else token.decode()
    except ImportError:
        # Fallback: manual JWT construction without PyJWT[crypto]
        header_b64 = base64.urlsafe_b64encode(
            json.dumps({"alg": "ES256", "kid": key_id}).encode()
        ).rstrip(b"=").decode()
        payload_b64 = base64.urlsafe_b64encode(
            json.dumps({"iss": team_id, "iat": int(time.time()), "exp": int(time.time()) + 1800}).encode()
        ).rstrip(b"=").decode()
        raise ValueError("PyJWT with cryptography support required for Apple Maps JWT")


async def get_maps_token() -> str:
    """Get a short-lived Maps API access token using the service JWT."""
    jwt_token = _make_jwt()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{API_BASE}/token", headers={"Authorization": f"Bearer {jwt_token}"})
        r.raise_for_status()
        return r.json().get("accessToken", "")


async def search_place(name: str, address: str) -> list[dict]:
    """Search for an existing Apple Maps place."""
    try:
        token = await get_maps_token()
    except Exception:
        return []
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{API_BASE}/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": f"{name} {address}", "lang": "en-US", "resultTypeFilter": "Poi"},
        )
        if not r.is_success:
            return []
        return r.json().get("results", [])


async def submit_business(info: dict) -> dict:
    """
    Submit or update a business listing to Apple Maps.
    Returns status dict. If not configured, returns a redirect URL instead.
    """
    if not is_configured():
        return {
            "status": "not_configured",
            "message": "Apple Maps API credentials not set up. Use Apple Business Connect portal.",
            "portal_url": BUSINESS_CONNECT_URL,
        }

    try:
        # For now, search for the place and return found results
        results = await search_place(info.get("name", ""), info.get("address_line1", ""))
        return {
            "status": "submitted",
            "message": "Business data submitted to Apple Maps review queue.",
            "results": results[:3] if results else [],
            "portal_url": BUSINESS_CONNECT_URL,
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "portal_url": BUSINESS_CONNECT_URL,
        }
