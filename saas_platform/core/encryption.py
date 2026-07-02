"""
Application-level encryption for sensitive data fields.

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256) from the
`cryptography` package to protect PII and credentials before they are
written to PostgreSQL.

Key generation (run once, store result in ENCRYPTION_KEY env var):
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Fields that MUST be encrypted before storage
─────────────────────────────────────────────
Table                   Column(s)
──────────────────────  ──────────────────────────────────────────────────────
users                   email, phone
platform_connections    access_token, refresh_token
delivery_connections    api_key
contact_submissions     email, phone, name
phone_agents            (any stored customer PII in future columns)
sms_messages            content  (contains customer order text)
phone_calls             transcript, summary  (may contain PII)

Fields intentionally NOT encrypted
───────────────────────────────────
- password_hash  — already a one-way bcrypt hash; encrypting adds no value
- stripe_*       — Stripe IDs are non-sensitive references, not secrets
- public URLs    — image_url, logo_url, etc.
- timestamps, booleans, numeric amounts

Usage
─────
    from core.encryption import encrypt_data, decrypt_data

    # Before INSERT / UPDATE:
    encrypted_token = encrypt_data(raw_access_token)

    # After SELECT:
    raw_token = decrypt_data(row["access_token"])

    # Nullable fields — use the safe helpers:
    encrypted = encrypt_field(value)   # returns None when value is None/empty
    decrypted = decrypt_field(value)   # returns None when value is None/empty
"""

import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Key bootstrap
# ---------------------------------------------------------------------------

def _load_fernet() -> Optional[Fernet]:
    """
    Load the Fernet cipher from the ENCRYPTION_KEY environment variable.

    Returns None when the key is absent so that callers can decide whether
    to raise or to fall back gracefully (useful during tests / local dev
    without a key configured).
    """
    key = os.getenv("ENCRYPTION_KEY", "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except Exception as exc:
        log.error(
            "ENCRYPTION_KEY is set but is not a valid Fernet key: %s. "
            "Generate a new key with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"",
            exc,
        )
        raise ValueError(f"Invalid ENCRYPTION_KEY: {exc}") from exc


def get_fernet() -> Fernet:
    """
    Return a ready-to-use Fernet instance.

    Raises RuntimeError if ENCRYPTION_KEY is not configured so that
    callers receive a clear, actionable error rather than a silent no-op.
    """
    f = _load_fernet()
    if f is None:
        raise RuntimeError(
            "ENCRYPTION_KEY environment variable is not set. "
            "Generate a key with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return f


def is_encryption_configured() -> bool:
    """Return True when a valid ENCRYPTION_KEY is present in the environment."""
    return _load_fernet() is not None


# ---------------------------------------------------------------------------
# Core encrypt / decrypt
# ---------------------------------------------------------------------------

def encrypt_data(plaintext: str) -> str:
    """
    Encrypt *plaintext* and return a URL-safe base-64 Fernet token (str).

    Raises:
        RuntimeError  — ENCRYPTION_KEY is not configured.
        TypeError     — plaintext is not a str.
        Exception     — any unexpected cryptography error.
    """
    if not isinstance(plaintext, str):
        raise TypeError(f"encrypt_data expects str, got {type(plaintext).__name__}")
    try:
        fernet = get_fernet()
        token: bytes = fernet.encrypt(plaintext.encode("utf-8"))
        return token.decode("utf-8")
    except RuntimeError:
        raise
    except Exception as exc:
        log.error("Encryption failed: %s", exc)
        raise RuntimeError(f"Encryption failed: {exc}") from exc


def decrypt_data(ciphertext: str) -> str:
    """
    Decrypt a Fernet token produced by :func:`encrypt_data`.

    Raises:
        RuntimeError    — ENCRYPTION_KEY is not configured.
        ValueError      — ciphertext is invalid or was encrypted with a
                          different key (wraps ``InvalidToken``).
        TypeError       — ciphertext is not a str.
        Exception       — any unexpected cryptography error.
    """
    if not isinstance(ciphertext, str):
        raise TypeError(f"decrypt_data expects str, got {type(ciphertext).__name__}")
    try:
        fernet = get_fernet()
        plaintext: bytes = fernet.decrypt(ciphertext.encode("utf-8"))
        return plaintext.decode("utf-8")
    except RuntimeError:
        raise
    except InvalidToken as exc:
        log.error(
            "Decryption failed — token is invalid or was encrypted with a different key."
        )
        raise ValueError(
            "Decryption failed: invalid token or wrong key. "
            "Ensure ENCRYPTION_KEY matches the key used during encryption."
        ) from exc
    except Exception as exc:
        log.error("Decryption failed: %s", exc)
        raise RuntimeError(f"Decryption failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Nullable-safe helpers (for optional DB columns)
# ---------------------------------------------------------------------------

def encrypt_field(value: Optional[str]) -> Optional[str]:
    """
    Encrypt *value* if it is a non-empty string; return None otherwise.

    Use this for nullable database columns so that NULL values remain NULL
    rather than being encrypted as empty strings.
    """
    if not value:
        return None
    return encrypt_data(value)


def decrypt_field(value: Optional[str]) -> Optional[str]:
    """
    Decrypt *value* if it is a non-empty string; return None otherwise.

    Use this when reading nullable encrypted columns from the database.
    """
    if not value:
        return None
    return decrypt_data(value)
