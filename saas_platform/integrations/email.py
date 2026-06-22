import logging
import httpx
from core.config import settings

log = logging.getLogger(__name__)

_FROM = "Careful Server <noreply@carefulserver.com>"


def _from_addr() -> str:
    return settings.email_from or "noreply@carefulserver.com"


async def send_email(to: str, subject: str, html: str) -> bool:
    if not settings.sendgrid_api_key:
        log.warning("SENDGRID_API_KEY not set — skipping email to %s", to)
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={
                    "Authorization": f"Bearer {settings.sendgrid_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "personalizations": [{"to": [{"email": to}]}],
                    "from": {"email": _from_addr(), "name": "Careful Server"},
                    "subject": subject,
                    "content": [{"type": "text/html", "value": html}],
                },
            )
            if not r.is_success:
                log.error("SendGrid %s: %s", r.status_code, r.text[:300])
                return False
            return True
    except Exception as e:
        log.error("Email send error: %s", e)
        return False


def _base(content: str) -> str:
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body {{margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}}
  .wrap {{max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7}}
  .hdr {{background:#16a34a;padding:28px 32px;text-align:center}}
  .hdr-logo {{width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:8px}}
  .hdr h1 {{color:#fff;font-size:20px;font-weight:700;margin:0}}
  .body {{padding:32px}}
  .body p {{color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px}}
  .btn {{display:inline-block;background:#16a34a;color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;margin:8px 0 24px}}
  .footer {{padding:20px 32px;border-top:1px solid #f3f4f6;text-align:center}}
  .footer p {{color:#9ca3af;font-size:12px;margin:0}}
</style></head><body>
<div class="wrap">
  <div class="hdr">
    <div class="hdr-logo">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>
    </div>
    <h1>Careful Server</h1>
  </div>
  <div class="body">{content}</div>
  <div class="footer"><p>© 2026 Careful Server · <a href="https://carefulserver.com" style="color:#9ca3af">carefulserver.com</a></p></div>
</div></body></html>"""


async def send_welcome(to: str, name: str, verify_url: str) -> bool:
    content = f"""<p>Hi {name or 'there'},</p>
<p>Welcome to <strong>Careful Server</strong>! Your restaurant owner account has been created.</p>
<p>Click the button below to confirm your email address and activate your account:</p>
<a href="{verify_url}" class="btn">Confirm my account</a>
<p style="color:#6b7280;font-size:13px">This link expires in 48 hours. If you didn't request this, you can safely ignore this email.</p>"""
    return await send_email(to, "Confirm your Careful Server account", _base(content))


async def send_password_reset(to: str, reset_url: str) -> bool:
    content = f"""<p>We received a request to reset your Careful Server password.</p>
<p>Click the button below to choose a new password:</p>
<a href="{reset_url}" class="btn">Reset my password</a>
<p style="color:#6b7280;font-size:13px">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't be changed.</p>"""
    return await send_email(to, "Reset your Careful Server password", _base(content))
