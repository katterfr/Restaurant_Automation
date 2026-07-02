"""
core/encryption.py — Application-level encryption for sensitive data fields.

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256) from the
`cryptography` package to protect PII and credentials before they are
persisted to the database.

Key management
--------------
The encryption key is read from the ``ENCRYPTION_KEY`` environment variable
(also settable via ``.env``).  Generate a new key with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Store the output as the ``ENCRYPTION_KEY`` secret in your deployment
environment (Railway secret, fly.io secret, etc.).  **Never commit the key
to source control.**

Fields that MUST be encrypted before storage
--------------------------------------------
Credentials / API secrets:
  - openai_api_key
  - twilio_auth_token
  - doordash_signing_secret
  - ubereats_client_secret
  - sendgrid_api_key
  - smtp_password
  - website_api_key
  - saas_api_key

PII (Personally Identifiable Information):
  - customer_name
  - customer email addresses
  - customer phone numbers
  - delivery addresses

Usage
-----
    from core.encryption import encrypt_data, decrypt_data

    # Encrypt before writing to DB
    stored_value = encrypt_data(plaintext_value)

    # Decrypt after reading from DB
    plaintext_value = decrypt_data(stored_value)

Both functions accept and return plain Python strings.  ``encrypt_data``
returns a URL-safe base64 token; ``decrypt_data`` reverses it.  Passing
``None`` or an empty string to either function returns the value unchanged,
so callers do not need to guard against missing optional fields.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Key loading
# ---------------------------------------------------------------------------

def _load_key() -> Optional[bytes]:
    """
    Load the Fernet key from the ENCRYPTION_KEY environment variable.

    Returns the key as bytes, or None if the variable is not set.
    A warning is emitted when the key is absent so operators are alerted
    without crashing the process (encryption calls will raise at call-time).
    """
    raw = os.environ.get("ENCRYPTION_KEY", "").strip()
    if not raw:
        log.warning(
            "ENCRYPTION_KEY is not set — sensitive-field encryption is DISABLED. "
            "Generate a key with: "
            "python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
        return None
    return raw.encode()


def _get_fernet() -> Fernet:
    """
    Return a ready-to-use Fernet instance.

    Raises ``RuntimeError`` if ``ENCRYPTION_KEY`` is not configured so that
    callers receive a clear, actionable error rather than a cryptic exception.
    """
    key = _load_key()
    if key is None:
        raise RuntimeError(
            "ENCRYPTION_KEY environment variable is required for sensitive-field "
            "encryption but is not set.  "
            "Generate a key with: "
            "python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    return Fernet(key)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def encrypt_data(plaintext: Optional[str]) -> Optional[str]:
    """
    Encrypt *plaintext* and return a URL-safe base64 ciphertext string.

    Parameters
    ----------
    plaintext:
        The sensitive value to encrypt.  ``None`` and empty strings are
        returned as-is so callers do not need to guard optional fields.

    Returns
    -------
    str | None
        Fernet token (URL-safe base64) suitable for database storage, or the
        original value when *plaintext* is ``None`` / empty.

    Raises
    ------
    RuntimeError
        If ``ENCRYPTION_KEY`` is not configured.
    ValueError
        If encryption fails for any other reason.
    """
    if not plaintext:
        return plaintext

    try:
        fernet = _get_fernet()
        token: bytes = fernet.encrypt(plaintext.encode("utf-8"))
        return token.decode("utf-8")
    except RuntimeError:
        raise
    except Exception as exc:
        log.error("encrypt_data failed: %s", exc)
        raise ValueError(f"Encryption failed: {exc}") from exc


def decrypt_data(ciphertext: Optional[str]) -> Optional[str]:
    """
    Decrypt a Fernet *ciphertext* token and return the original plaintext.

    Parameters
    ----------
    ciphertext:
        A Fernet token previously produced by :func:`encrypt_data`.
        ``None`` and empty strings are returned as-is.

    Returns
    -------
    str | None
        The decrypted plaintext, or the original value when *ciphertext* is
        ``None`` / empty.

    Raises
    ------
    RuntimeError
        If ``ENCRYPTION_KEY`` is not configured.
    ValueError
        If the token is invalid, tampered with, or was encrypted with a
        different key (wraps :class:`cryptography.fernet.InvalidToken`).
    """
    if not ciphertext:
        return ciphertext

    try:
        fernet = _get_fernet()
        plaintext: bytes = fernet.decrypt(ciphertext.encode("utf-8"))
        return plaintext.decode("utf-8")
    except RuntimeError:
        raise
    except InvalidToken as exc:
        log.error(
            "decrypt_data failed — token is invalid or was encrypted with a "
            "different key.  Verify ENCRYPTION_KEY matches the key used during "
            "encryption."
        )
        raise ValueError(
            "Decryption failed: invalid token or wrong key."
        ) from exc
    except Exception as exc:
        log.error("decrypt_data failed: %s", exc)
        raise ValueError(f"Decryption failed: {exc}") from exc


def is_encryption_available() -> bool:
    """
    Return ``True`` if ``ENCRYPTION_KEY`` is configured and a valid Fernet
    key can be constructed from it.

    Useful for health-check endpoints and startup validation.
    """
    try:
        _get_fernet()
        return True
    except (RuntimeError, Exception):
        return False
