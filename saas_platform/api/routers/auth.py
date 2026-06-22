import random
import secrets
import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel

from core.security import verify_password, hash_password, create_access_token, decode_token
from core.config import settings
from db.database import get_db
from integrations import email as email_svc
from integrations import twilio_sms as sms_svc

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme), db=Depends(get_db)):
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_jwt(user: dict) -> str:
    return create_access_token({
        "sub": str(user["id"]),
        "tenant": user["tenant_id"],
        "role": user["role"],
        "permissions": user.get("permissions") or "[]",
        "display_name": user.get("display_name") or "",
    })


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _create_auth_token(db, user_id: int, token_type: str, hours: int = 24) -> str:
    token = secrets.token_urlsafe(32)
    expires = _now() + timedelta(hours=hours)
    await db.execute(
        "INSERT INTO auth_tokens (user_id, token, type, expires_at) VALUES ($1,$2,$3,$4)",
        user_id, token, token_type, expires,
    )
    return token


async def _use_auth_token(db, token: str, token_type: str):
    row = await db.fetchrow(
        "SELECT * FROM auth_tokens WHERE token=$1 AND type=$2 AND used=FALSE",
        token, token_type,
    )
    if not row:
        raise HTTPException(400, "Invalid or expired link")
    if row["expires_at"].replace(tzinfo=timezone.utc) < _now():
        raise HTTPException(400, "This link has expired. Please request a new one.")
    await db.execute("UPDATE auth_tokens SET used=TRUE WHERE id=$1", row["id"])
    return row


# ─── Basic email/password login ───────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    user = await db.fetchrow("SELECT * FROM users WHERE email = $1", form.username)
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=_make_jwt(user))


@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "role": current_user["role"],
        "phone": current_user.get("phone"),
        "email_verified": current_user.get("email_verified", False),
        "google_linked": bool(current_user.get("google_id")),
        "display_name": current_user.get("display_name") or "",
    }


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, current_user=Depends(get_current_user), db=Depends(get_db)):
    if not verify_password(body.current_password, current_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    await db.execute(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        hash_password(body.new_password), current_user["id"],
    )
    return {"message": "Password updated successfully"}


# ─── Google Sign-In ───────────────────────────────────────────────────────────

class GoogleLoginBody(BaseModel):
    id_token: str


class GoogleLinkBody(BaseModel):
    id_token: str
    email: str
    password: str


@router.post("/google")
async def google_login(body: GoogleLoginBody, db=Depends(get_db)):
    """Verify Google id_token, find/link account, return JWT."""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={body.id_token}")
            if not r.is_success:
                raise HTTPException(401, "Invalid Google token")
            info = r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Google verification failed: {e}")

    google_id = info.get("sub")
    google_email = info.get("email", "").lower()
    google_name = info.get("name", "")
    if not google_id or not google_email:
        raise HTTPException(400, "Invalid Google token payload")

    # 1. Find by google_id (already linked)
    user = await db.fetchrow("SELECT * FROM users WHERE google_id=$1", google_id)
    if user:
        return TokenResponse(access_token=_make_jwt(user))

    # 2. Find by matching email → auto-link
    user = await db.fetchrow("SELECT * FROM users WHERE LOWER(email)=$1", google_email)
    if user:
        await db.execute("UPDATE users SET google_id=$1 WHERE id=$2", google_id, user["id"])
        return TokenResponse(access_token=_make_jwt(user))

    # 3. No account found — frontend will prompt for portal credentials to link
    return {
        "status": "not_linked",
        "google_email": google_email,
        "google_name": google_name,
        "google_id": google_id,
    }


@router.post("/google/link")
async def google_link(body: GoogleLinkBody, db=Depends(get_db)):
    """Link a Google account to an existing portal account."""
    # Verify Google token
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={body.id_token}")
            info = r.json() if r.is_success else {}
    except Exception:
        info = {}
    google_id = info.get("sub")
    if not google_id:
        raise HTTPException(400, "Invalid Google token")

    # Verify portal credentials
    user = await db.fetchrow("SELECT * FROM users WHERE LOWER(email)=LOWER($1)", body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    # Link and return JWT
    await db.execute("UPDATE users SET google_id=$1 WHERE id=$2", google_id, user["id"])
    return TokenResponse(access_token=_make_jwt(user))


# ─── Phone OTP login ──────────────────────────────────────────────────────────

class PhoneSendBody(BaseModel):
    phone: str


class PhoneVerifyBody(BaseModel):
    phone: str
    otp: str


class PhoneLinkBody(BaseModel):
    phone: str
    otp: str
    email: str
    password: str


def _normalize_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit() or c == "+")
    if not digits.startswith("+"):
        digits = "+1" + digits.lstrip("1")
    return digits


@router.post("/phone/send-otp")
async def send_phone_otp(body: PhoneSendBody, db=Depends(get_db)):
    phone = _normalize_phone(body.phone)
    otp = str(random.randint(100000, 999999))
    expires = _now() + timedelta(minutes=10)

    # Find user by phone (optional — OTP can be sent to unlinked numbers too)
    user = await db.fetchrow("SELECT id FROM users WHERE phone=$1", phone)

    await db.execute(
        "INSERT INTO phone_otps (phone, otp, user_id, expires_at) VALUES ($1,$2,$3,$4)",
        phone, otp, user["id"] if user else None, expires,
    )

    if sms_svc.is_configured():
        try:
            await sms_svc.send_sms(phone, f"Your Careful Server login code: {otp}\n\nExpires in 10 minutes.")
        except Exception as e:
            log.error("OTP SMS failed: %s", e)
            raise HTTPException(500, "Failed to send SMS. Check Twilio configuration.")
    else:
        log.warning("Twilio not configured — OTP for %s is %s", phone, otp)

    return {"sent": True, "phone": phone, "linked": bool(user)}


@router.post("/phone/verify-otp")
async def verify_phone_otp(body: PhoneVerifyBody, db=Depends(get_db)):
    phone = _normalize_phone(body.phone)
    row = await db.fetchrow(
        "SELECT * FROM phone_otps WHERE phone=$1 AND otp=$2 AND used=FALSE ORDER BY created_at DESC LIMIT 1",
        phone, body.otp,
    )
    if not row:
        raise HTTPException(400, "Invalid code")
    if row["expires_at"].replace(tzinfo=timezone.utc) < _now():
        raise HTTPException(400, "Code expired. Please request a new one.")
    await db.execute("UPDATE phone_otps SET used=TRUE WHERE id=$1", row["id"])

    user = await db.fetchrow("SELECT * FROM users WHERE phone=$1", phone)
    if not user:
        return {"status": "not_linked", "phone": phone}

    return TokenResponse(access_token=_make_jwt(user))


@router.post("/phone/link")
async def phone_link(body: PhoneLinkBody, db=Depends(get_db)):
    """Link phone to existing portal account after verifying OTP + password."""
    phone = _normalize_phone(body.phone)
    row = await db.fetchrow(
        "SELECT * FROM phone_otps WHERE phone=$1 AND otp=$2 AND used=FALSE ORDER BY created_at DESC LIMIT 1",
        phone, body.otp,
    )
    if not row:
        raise HTTPException(400, "Invalid or expired code")
    if row["expires_at"].replace(tzinfo=timezone.utc) < _now():
        raise HTTPException(400, "Code expired")
    await db.execute("UPDATE phone_otps SET used=TRUE WHERE id=$1", row["id"])

    user = await db.fetchrow("SELECT * FROM users WHERE LOWER(email)=LOWER($1)", body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    await db.execute("UPDATE users SET phone=$1 WHERE id=$2", phone, user["id"])
    return TokenResponse(access_token=_make_jwt(user))


# ─── Forgot / reset password ──────────────────────────────────────────────────

class ForgotPasswordBody(BaseModel):
    email_or_phone: str
    slug: str = ""  # portal slug for building redirect URLs


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str


class ResetViaSMSBody(BaseModel):
    phone: str
    otp: str
    new_password: str


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordBody, db=Depends(get_db)):
    val = body.email_or_phone.strip()
    user = None
    method = "email"

    if "@" in val:
        user = await db.fetchrow("SELECT * FROM users WHERE LOWER(email)=LOWER($1)", val)
    else:
        phone = _normalize_phone(val)
        user = await db.fetchrow("SELECT * FROM users WHERE phone=$1", phone)
        method = "sms"

    # Always return 200 to prevent enumeration
    if not user:
        return {"sent": True, "method": method}

    if method == "email":
        token = await _create_auth_token(db, user["id"], "password_reset", hours=1)
        slug_part = f"{body.slug}/" if body.slug else ""
        reset_url = f"{settings.frontend_url}/portal/{slug_part}reset-password?token={token}"
        await email_svc.send_password_reset(user["email"], reset_url)
    else:
        # Send SMS OTP for reset
        otp = str(random.randint(100000, 999999))
        expires = _now() + timedelta(minutes=15)
        await db.execute(
            "INSERT INTO phone_otps (phone, otp, user_id, expires_at) VALUES ($1,$2,$3,$4)",
            user["phone"], otp, user["id"], expires,
        )
        if sms_svc.is_configured():
            await sms_svc.send_sms(user["phone"], f"Your Careful Server password reset code: {otp}\n\nExpires in 15 minutes.")

    return {"sent": True, "method": method}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordBody, db=Depends(get_db)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    token_row = await _use_auth_token(db, body.token, "password_reset")
    await db.execute(
        "UPDATE users SET password_hash=$1 WHERE id=$2",
        hash_password(body.new_password), token_row["user_id"],
    )
    return {"ok": True}


@router.post("/reset-password/sms")
async def reset_password_sms(body: ResetViaSMSBody, db=Depends(get_db)):
    """Reset password using SMS OTP."""
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    phone = _normalize_phone(body.phone)
    row = await db.fetchrow(
        "SELECT * FROM phone_otps WHERE phone=$1 AND otp=$2 AND used=FALSE ORDER BY created_at DESC LIMIT 1",
        phone, body.otp,
    )
    if not row or row["expires_at"].replace(tzinfo=timezone.utc) < _now():
        raise HTTPException(400, "Invalid or expired code")
    await db.execute("UPDATE phone_otps SET used=TRUE WHERE id=$1", row["id"])

    user = await db.fetchrow("SELECT * FROM users WHERE phone=$1", phone)
    if not user:
        raise HTTPException(404, "No account linked to this phone number")
    await db.execute(
        "UPDATE users SET password_hash=$1 WHERE id=$2",
        hash_password(body.new_password), user["id"],
    )
    return {"ok": True}


# ─── Email verification ───────────────────────────────────────────────────────

@router.post("/send-verification")
async def send_verification(current_user=Depends(get_current_user), db=Depends(get_db)):
    if current_user.get("email_verified"):
        return {"already_verified": True}
    token = await _create_auth_token(db, current_user["id"], "email_verify", hours=48)
    verify_url = f"{settings.frontend_url}/portal/verify-email?token={token}"
    await email_svc.send_welcome(current_user["email"], current_user.get("display_name") or "", verify_url)
    return {"sent": True}


@router.get("/verify-email")
async def verify_email_token(token: str = Query(...), db=Depends(get_db)):
    token_row = await _use_auth_token(db, token, "email_verify")
    await db.execute(
        "UPDATE users SET email_verified=TRUE WHERE id=$1",
        token_row["user_id"],
    )
    return RedirectResponse(f"{settings.frontend_url}/portal/login?verified=1")


# ─── Internal: send welcome email when account is created ────────────────────

async def send_welcome_for_new_user(db, user_id: int, email: str, name: str = "") -> None:
    """Call this after creating a new owner account to send the welcome email."""
    try:
        token = await _create_auth_token(db, user_id, "email_verify", hours=48)
        verify_url = f"{settings.frontend_url}/portal/verify-email?token={token}"
        await email_svc.send_welcome(email, name, verify_url)
    except Exception as e:
        log.error("Failed to send welcome email to %s: %s", email, e)
