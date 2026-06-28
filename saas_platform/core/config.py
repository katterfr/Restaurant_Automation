from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Restaurant Automation SaaS"
    app_env: str = "development"
    app_port: int = 8001
    secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    database_url: str = "sqlite+aiosqlite:///./saas.db"

    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None

    stripe_starter_monthly_price_id: Optional[str] = None
    stripe_starter_annual_price_id: Optional[str] = None
    stripe_growth_monthly_price_id: Optional[str] = None
    stripe_growth_annual_price_id: Optional[str] = None
    stripe_pro_monthly_price_id: Optional[str] = None
    stripe_pro_annual_price_id: Optional[str] = None

    sendgrid_api_key: Optional[str] = None
    email_from: str = ""

    supabase_url: Optional[str] = None
    supabase_anon_key: Optional[str] = None
    supabase_service_role_key: Optional[str] = None

    admin_email: str = "admin@example.com"
    admin_password: str = "changeme"
    api_admin_secret: Optional[str] = None

    # Social ads platforms
    meta_app_id: Optional[str] = None
    meta_app_secret: Optional[str] = None
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    google_developer_token: Optional[str] = None
    tiktok_app_id: Optional[str] = None
    tiktok_app_secret: Optional[str] = None
    snapchat_client_id: Optional[str] = None
    snapchat_client_secret: Optional[str] = None
    pinterest_app_id: Optional[str] = None
    pinterest_app_secret: Optional[str] = None
    # Apple Maps / Business Connect
    apple_team_id: Optional[str] = None
    apple_maps_key_id: Optional[str] = None
    apple_maps_private_key: Optional[str] = None
    frontend_url: str = "http://localhost:3000"
    saas_api_url: str = "http://localhost:8001"
    # VAPI — AI phone agent
    vapi_api_key: Optional[str] = None
    vapi_webhook_secret: Optional[str] = None
    # Twilio — SMS ordering
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_sms_number: Optional[str] = None
    # Anthropic — SMS AI
    anthropic_api_key: Optional[str] = None
    # fal.ai — legacy (replaced by Replicate)
    fal_api_key: Optional[str] = None
    # Replicate — AI image + video generation
    replicate_api_key: Optional[str] = None
    replicate_api_token: Optional[str] = None
    # Delivery platform — platform-level credentials (set once in Railway)
    doordash_developer_id: Optional[str] = None
    doordash_key_id: Optional[str] = None
    doordash_signing_secret: Optional[str] = None
    ubereats_client_id: Optional[str] = None
    ubereats_client_secret: Optional[str] = None
    # Cron secret — protects /tasks/run-due endpoint
    cron_secret: Optional[str] = None


settings = Settings()
