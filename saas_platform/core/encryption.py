"""
Application-level encryption for sensitive data fields.

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256).

Key generation (run once, store result in ENCRYPTION_KEY env var):
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

When ENCRYPTION_KEY is absent the helpers degrade gracefully:
- encrypt_data returns the plaintext unchanged (startup warning is logged)
- decrypt_data returns the value unchanged (handles pre-encryption DB rows)
"""

import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger(__name__)


def _load_fernet() -> Optional[Fernet]:
    key = os.getenv("ENCRYPTION_KEY", "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except Exception as exc:
        log.error("ENCRYPTION_KEY is invalid: %s", exc)
        raise ValueError(f"Invalid ENCRYPTION_KEY: {exc}") from exc


def is_encryption_configured() -> bool:
    return _load_fernet() is not None


def encrypt_data(plaintext: str) -> str:
    """Encrypt plaintext. Returns plaintext unchanged if ENCRYPTION_KEY is not set."""
    if not plaintext:
        return plaintext
    f = _load_fernet()
    if f is None:
        return plaintext  # degraded mode — startup warning covers this
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_data(ciphertext: str) -> str:
    """
    Decrypt a Fernet token. Falls back to returning the raw value when:
    - ENCRYPTION_KEY is not configured (plaintext was stored without encryption)
    - The value is not a valid Fernet token (pre-encryption DB row)
    """
    if not ciphertext:
        return ciphertext
    f = _load_fernet()
    if f is None:
        return ciphertext  # ENCRYPTION_KEY absent — value was stored as plaintext
    try:
        return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        return ciphertext  # pre-encryption plaintext row — return as-is


def encrypt_field(value: Optional[str]) -> Optional[str]:
    """Encrypt nullable field; None/empty stays None."""
    if not value:
        return None
    return encrypt_data(value)


def decrypt_field(value: Optional[str]) -> Optional[str]:
    """Decrypt nullable field; None/empty stays None."""
    if not value:
        return None
    return decrypt_data(value)
