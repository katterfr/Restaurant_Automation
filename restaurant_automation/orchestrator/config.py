"""
config.py — Pydantic settings loader for all environment variables.
All modules import `settings` from here.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import zoneinfo


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── OpenAI ──────────────────────────────────────────────────────────
    openai_api_key: str = ""

    # ── Twilio ──────────────────────────────────────────────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # ── Database ────────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./restaurant.db"

    # ── Redis ───────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"

    # ── Website Sync ────────────────────────────────────────────────────
    website_api_url: Optional[str] = None
    website_api_key: Optional[str] = None

    # ── DoorDash ────────────────────────────────────────────────────────
    doordash_developer_id: Optional[str] = None
    doordash_key_id: Optional[str] = None
    doordash_signing_secret: Optional[str] = None
    doordash_base_url: str = "https://openapi.doordash.com"

    # ── Uber Eats ───────────────────────────────────────────────────────
    ubereats_client_id: Optional[str] = None
    ubereats_client_secret: Optional[str] = None
    ubereats_store_id: Optional[str] = None
    ubereats_base_url: str = "https://api.uber.com"

    # ── Email Alerts ─────────────────────────────────────────────────────
    email_alerts_enabled: bool = True
    email_provider: str = "sendgrid"          # "sendgrid" | "smtp"
    alert_email_from: str = ""                # Verified sender address
    alert_email_to: str = ""                  # Comma-separated recipient(s)
    alert_email_cc: Optional[str] = None      # Optional CC

    # SendGrid
    sendgrid_api_key: Optional[str] = None

    # SMTP fallback
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None

    # Alert throttle — min minutes between repeat low-stock emails per SKU
    low_stock_alert_cooldown_minutes: int = 60

    # ── Restaurant ──────────────────────────────────────────────────────
    restaurant_name: str = "My Restaurant"
    restaurant_timezone: str = "America/New_York"
    business_open_time: str = "11:00"   # HH:MM 24h
    business_close_time: str = "22:00"  # HH:MM 24h

    # ── SaaS Platform integration ────────────────────────────────────────
    saas_api_url: Optional[str] = None        # e.g. https://api-production-731b.up.railway.app
    saas_tenant_id: Optional[int] = None      # The tenant ID this restaurant maps to
    saas_api_key: Optional[str] = None        # API_ADMIN_SECRET from saas_platform

    # ── Encryption ───────────────────────────────────────────────────────
    # Fernet symmetric key used to encrypt sensitive fields (PII, credentials,
    # API keys, tokens) before they are written to the database.
    #
    # Generate a key:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    #
    # Set the output as the ENCRYPTION_KEY environment variable / secret.
    # Fields that must be encrypted: passwords, API keys, tokens, email
    # addresses, phone numbers, delivery addresses, and any other PII.
    encryption_key: Optional[str] = None

    # ── Derived ─────────────────────────────────────────────────────────
    @property
    def tz(self) -> zoneinfo.ZoneInfo:
        return zoneinfo.ZoneInfo(self.restaurant_timezone)


settings = Settings()
