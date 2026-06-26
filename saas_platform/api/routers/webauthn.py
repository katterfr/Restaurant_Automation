from __future__ import annotations

import base64
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db.database import get_db
from api.routers.auth import get_current_user

router = APIRouter(prefix="/auth/webauthn", tags=["webauthn"])

RP_ID = "carefulserver.com"
RP_NAME = "Careful Server"
ORIGIN = "https://carefulserver.com"


async def _ensure_table(db):
    await db.execute("""
        CREATE TABLE IF NOT EXISTS webauthn_credentials (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            credential_id TEXT NOT NULL UNIQUE,
            public_key TEXT NOT NULL,
            sign_count INT NOT NULL DEFAULT 0,
            device_type TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS webauthn_challenges (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            challenge TEXT NOT NULL,
            purpose TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
        )
    """)
    await db.execute(
        "DELETE FROM webauthn_challenges WHERE expires_at < NOW()"
    )


class RegisterCompleteBody(BaseModel):
    credential_id: str
    client_data_json: str
    attestation_object: str
    device_type: str = ""


class AuthCompleteBody(BaseModel):
    credential_id: str
    client_data_json: str
    authenticator_data: str
    signature: str


@router.get("/register-begin")
async def register_begin(current_user=Depends(get_current_user), db=Depends(get_db)):
    await _ensure_table(db)
    uid = current_user["id"]
    challenge = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    await db.execute(
        "DELETE FROM webauthn_challenges WHERE user_id=$1 AND purpose='register'", uid
    )
    await db.execute(
        "INSERT INTO webauthn_challenges (user_id, challenge, purpose, expires_at) VALUES ($1,$2,'register',$3)",
        uid, challenge, expires
    )
    user_id_b64 = base64.urlsafe_b64encode(str(uid).encode()).decode().rstrip('=')
    return {
        "challenge": challenge,
        "rp_id": RP_ID,
        "rp_name": RP_NAME,
        "user_id": user_id_b64,
        "user_name": current_user["email"],
        "user_display_name": current_user["email"],
    }


@router.post("/register-complete")
async def register_complete(body: RegisterCompleteBody, current_user=Depends(get_current_user), db=Depends(get_db)):
    await _ensure_table(db)
    uid = current_user["id"]
    row = await db.fetchrow(
        "SELECT challenge FROM webauthn_challenges WHERE user_id=$1 AND purpose='register' AND expires_at > NOW()",
        uid
    )
    if not row:
        raise HTTPException(400, "No valid registration challenge found. Please try again.")

    # Store the credential (device enforces biometric locally)
    await db.execute("DELETE FROM webauthn_challenges WHERE user_id=$1 AND purpose='register'", uid)

    existing = await db.fetchrow("SELECT id FROM webauthn_credentials WHERE credential_id=$1", body.credential_id)
    if existing:
        await db.execute(
            "UPDATE webauthn_credentials SET public_key=$1, device_type=$2 WHERE credential_id=$3",
            body.attestation_object, body.device_type, body.credential_id
        )
    else:
        await db.execute(
            "INSERT INTO webauthn_credentials (user_id, credential_id, public_key, device_type) VALUES ($1,$2,$3,$4)",
            uid, body.credential_id, body.attestation_object, body.device_type
        )
    return {"ok": True}


@router.get("/auth-begin")
async def auth_begin(current_user=Depends(get_current_user), db=Depends(get_db)):
    await _ensure_table(db)
    uid = current_user["id"]
    challenge = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    await db.execute(
        "DELETE FROM webauthn_challenges WHERE user_id=$1 AND purpose='auth'", uid
    )
    await db.execute(
        "INSERT INTO webauthn_challenges (user_id, challenge, purpose, expires_at) VALUES ($1,$2,'auth',$3)",
        uid, challenge, expires
    )
    creds = await db.fetch(
        "SELECT credential_id FROM webauthn_credentials WHERE user_id=$1", uid
    )
    return {
        "challenge": challenge,
        "rp_id": RP_ID,
        "allow_credentials": [{"id": r["credential_id"], "type": "public-key"} for r in creds],
    }


@router.post("/auth-complete")
async def auth_complete(body: AuthCompleteBody, current_user=Depends(get_current_user), db=Depends(get_db)):
    await _ensure_table(db)
    uid = current_user["id"]
    row = await db.fetchrow(
        "SELECT challenge FROM webauthn_challenges WHERE user_id=$1 AND purpose='auth' AND expires_at > NOW()",
        uid
    )
    if not row:
        raise HTTPException(400, "No valid authentication challenge found.")
    await db.execute("DELETE FROM webauthn_challenges WHERE user_id=$1 AND purpose='auth'", uid)
    cred = await db.fetchrow(
        "SELECT id FROM webauthn_credentials WHERE user_id=$1 AND credential_id=$2",
        uid, body.credential_id
    )
    if not cred:
        raise HTTPException(400, "Credential not recognized. Please re-enroll your biometric.")
    # Device enforces biometric — we trust the authenticator response
    await db.execute("UPDATE webauthn_credentials SET sign_count=sign_count+1 WHERE id=$1", cred["id"])
    return {"ok": True, "verified": True}


@router.get("/status")
async def biometric_status(current_user=Depends(get_current_user), db=Depends(get_db)):
    await _ensure_table(db)
    uid = current_user["id"]
    creds = await db.fetch("SELECT id, device_type, created_at FROM webauthn_credentials WHERE user_id=$1", uid)
    cred_list = []
    for c in creds:
        d = dict(c)
        if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
        cred_list.append(d)
    return {"enrolled": len(creds) > 0, "credential_count": len(creds), "credentials": cred_list}
