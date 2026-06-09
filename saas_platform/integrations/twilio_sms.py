import httpx
from core.config import settings


def is_configured() -> bool:
    return bool(settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_sms_number)


def _base_url() -> str:
    return f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}"


def _auth() -> tuple:
    return (settings.twilio_account_sid, settings.twilio_auth_token)


async def send_sms(to: str, body: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_base_url()}/Messages.json",
            auth=_auth(),
            data={"To": to, "From": settings.twilio_sms_number, "Body": body},
        )
        resp.raise_for_status()
        return resp.json()


async def get_number_info(phone_number_sid: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{_base_url()}/IncomingPhoneNumbers/{phone_number_sid}.json",
            auth=_auth(),
        )
        resp.raise_for_status()
        return resp.json()


async def set_sms_webhook(phone_number_sid: str, webhook_url: str) -> dict:
    """Point a Twilio number's inbound SMS webhook at our endpoint."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{_base_url()}/IncomingPhoneNumbers/{phone_number_sid}.json",
            auth=_auth(),
            data={"SmsUrl": webhook_url, "SmsMethod": "POST"},
        )
        resp.raise_for_status()
        return resp.json()
