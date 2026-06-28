import os
import asyncpg
import bcrypt

_pool: asyncpg.Pool | None = None


async def get_db():
    async with _pool.acquire() as conn:
        yield conn


async def get_db_pool() -> asyncpg.Pool:
    return _pool


async def init_db():
    global _pool
    database_url = os.getenv("DATABASE_URL", "postgresql://localhost/saas")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    _pool = await asyncpg.create_pool(database_url, min_size=1, max_size=10)

    async with _pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS billing_plans (
                id             SERIAL PRIMARY KEY,
                name           TEXT NOT NULL UNIQUE,
                price_monthly  REAL NOT NULL DEFAULT 0,
                price_yearly   REAL NOT NULL DEFAULT 0,
                max_locations  INTEGER NOT NULL DEFAULT 1,
                features       TEXT,
                is_active      BOOLEAN NOT NULL DEFAULT TRUE,
                created_at     TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS tenants (
                id                     SERIAL PRIMARY KEY,
                name                   TEXT NOT NULL,
                slug                   TEXT NOT NULL UNIQUE,
                plan                   TEXT NOT NULL DEFAULT 'starter',
                status                 TEXT NOT NULL DEFAULT 'active',
                stripe_customer_id     TEXT,
                stripe_subscription_id TEXT,
                created_at             TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL DEFAULT 'admin',
                tenant_id     INTEGER REFERENCES tenants(id),
                created_at    TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS tenant_users (
                id            SERIAL PRIMARY KEY,
                tenant_id     INTEGER NOT NULL REFERENCES tenants(id),
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL DEFAULT 'owner',
                is_active     BOOLEAN NOT NULL DEFAULT TRUE,
                created_at    TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS feature_definitions (
                id          SERIAL PRIMARY KEY,
                key         TEXT NOT NULL UNIQUE,
                name        TEXT NOT NULL,
                description TEXT,
                created_at  TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS workflow_configs (
                id            SERIAL PRIMARY KEY,
                tenant_id     INTEGER NOT NULL REFERENCES tenants(id),
                workflow_type TEXT NOT NULL,
                config        TEXT,
                is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
                created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE(tenant_id, workflow_type)
            );

            CREATE TABLE IF NOT EXISTS tenant_inventory (
                id                  SERIAL PRIMARY KEY,
                tenant_id           INTEGER NOT NULL REFERENCES tenants(id),
                sku                 TEXT NOT NULL,
                name                TEXT NOT NULL,
                category            TEXT,
                quantity            REAL NOT NULL DEFAULT 0,
                unit                TEXT NOT NULL DEFAULT 'unit',
                low_stock_threshold REAL NOT NULL DEFAULT 0,
                cost                REAL,
                price               REAL,
                created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE(tenant_id, sku)
            );

            CREATE TABLE IF NOT EXISTS menu_items (
                id          SERIAL PRIMARY KEY,
                tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                name        TEXT NOT NULL,
                category    TEXT NOT NULL DEFAULT 'other',
                price       REAL NOT NULL DEFAULT 0,
                description TEXT,
                available   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS tenant_features (
                id         SERIAL PRIMARY KEY,
                tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                feature    VARCHAR(100) NOT NULL,
                enabled    BOOLEAN NOT NULL DEFAULT FALSE,
                enabled_at TIMESTAMP,
                UNIQUE(tenant_id, feature)
            );

            CREATE TABLE IF NOT EXISTS social_posts (
                id               SERIAL PRIMARY KEY,
                tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                platforms        TEXT NOT NULL DEFAULT '[]',
                content          TEXT NOT NULL,
                image_url        TEXT,
                link_url         TEXT,
                scheduled_at     TIMESTAMP,
                status           VARCHAR(50) NOT NULL DEFAULT 'draft',
                platform_results TEXT NOT NULL DEFAULT '{}',
                error_message    TEXT,
                created_at       TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS accounting_entries (
                id           SERIAL PRIMARY KEY,
                tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                type         VARCHAR(20) NOT NULL,
                category     VARCHAR(100) NOT NULL,
                amount       REAL NOT NULL,
                description  TEXT,
                date         DATE NOT NULL DEFAULT CURRENT_DATE,
                source       VARCHAR(50) NOT NULL DEFAULT 'manual',
                reference_id INTEGER,
                created_at   TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS delivery_connections (
                id           SERIAL PRIMARY KEY,
                tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                provider     VARCHAR(50) NOT NULL,
                status       VARCHAR(50) NOT NULL DEFAULT 'pending',
                api_key      TEXT,
                store_id     TEXT,
                connected_at TIMESTAMP,
                UNIQUE(tenant_id, provider)
            );

            CREATE TABLE IF NOT EXISTS platform_connections (
                id           SERIAL PRIMARY KEY,
                tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                platform     VARCHAR(50) NOT NULL,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                ad_account_id VARCHAR(255) DEFAULT '',
                page_id      VARCHAR(255) DEFAULT '',
                connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE(tenant_id, platform)
            );

            CREATE TABLE IF NOT EXISTS ad_campaigns (
                id                  SERIAL PRIMARY KEY,
                tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                platform            VARCHAR(50) NOT NULL,
                status              VARCHAR(50) NOT NULL DEFAULT 'draft',
                headline            VARCHAR(255) NOT NULL,
                body                TEXT NOT NULL,
                image_url           TEXT,
                destination_url     TEXT,
                cta                 VARCHAR(50) DEFAULT 'LEARN_MORE',
                budget_daily        REAL DEFAULT 10,
                location            TEXT,
                radius_miles        INTEGER DEFAULT 10,
                start_date          TEXT,
                end_date            TEXT,
                platform_campaign_id TEXT,
                impressions         INTEGER DEFAULT 0,
                clicks              INTEGER DEFAULT 0,
                spend               REAL DEFAULT 0,
                error_message       TEXT,
                created_at          TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS business_listings (
                id                SERIAL PRIMARY KEY,
                tenant_id         INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                name              TEXT NOT NULL DEFAULT '',
                description       TEXT NOT NULL DEFAULT '',
                phone             TEXT NOT NULL DEFAULT '',
                website           TEXT NOT NULL DEFAULT '',
                address_line1     TEXT NOT NULL DEFAULT '',
                city              TEXT NOT NULL DEFAULT '',
                state             TEXT NOT NULL DEFAULT '',
                zip               TEXT NOT NULL DEFAULT '',
                country           TEXT NOT NULL DEFAULT 'US',
                hours             TEXT NOT NULL DEFAULT '{}',
                category          TEXT NOT NULL DEFAULT 'restaurant',
                logo_url          TEXT NOT NULL DEFAULT '',
                google_account_id TEXT,
                google_location_id TEXT,
                google_status     TEXT NOT NULL DEFAULT 'not_connected',
                apple_place_id    TEXT,
                apple_status      TEXT NOT NULL DEFAULT 'not_submitted',
                created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE(tenant_id)
            );

            CREATE TABLE IF NOT EXISTS creative_assets (
                id             SERIAL PRIMARY KEY,
                tenant_id      INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                type           VARCHAR(10)  NOT NULL,
                status         VARCHAR(20)  NOT NULL DEFAULT 'pending',
                prompt         TEXT         NOT NULL,
                style          VARCHAR(50)  NOT NULL DEFAULT 'vivid',
                aspect_ratio   VARCHAR(10)  NOT NULL DEFAULT '1:1',
                url            TEXT,
                thumbnail_url  TEXT,
                fal_request_id TEXT,
                fal_status_url TEXT,
                error_message  TEXT,
                created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS phone_agents (
                id                   SERIAL PRIMARY KEY,
                tenant_id            INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                vapi_assistant_id    TEXT,
                vapi_phone_number_id TEXT,
                phone_number         TEXT,
                greeting             TEXT NOT NULL DEFAULT 'Thank you for calling! How can I help you today?',
                special_instructions TEXT NOT NULL DEFAULT '',
                is_active            BOOLEAN NOT NULL DEFAULT FALSE,
                total_calls          INTEGER NOT NULL DEFAULT 0,
                last_call_at         TIMESTAMP,
                created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE(tenant_id)
            );

            CREATE TABLE IF NOT EXISTS sms_sessions (
                id              SERIAL PRIMARY KEY,
                tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                customer_phone  TEXT NOT NULL,
                status          VARCHAR(20) NOT NULL DEFAULT 'active',
                order_id        INTEGER,
                started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
                last_message_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS sms_messages (
                id          SERIAL PRIMARY KEY,
                session_id  INTEGER NOT NULL REFERENCES sms_sessions(id) ON DELETE CASCADE,
                role        VARCHAR(10) NOT NULL,
                content     TEXT NOT NULL,
                created_at  TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS phone_calls (
                id              SERIAL PRIMARY KEY,
                tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                vapi_call_id    TEXT UNIQUE,
                caller_number   TEXT,
                duration_secs   INTEGER DEFAULT 0,
                summary         TEXT,
                transcript      TEXT,
                structured_data TEXT NOT NULL DEFAULT '{}',
                order_created   BOOLEAN NOT NULL DEFAULT FALSE,
                order_id        INTEGER REFERENCES tenant_orders(id),
                created_at      TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS tenant_customization (
                id           SERIAL PRIMARY KEY,
                tenant_id    INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                accent_color VARCHAR(7)  NOT NULL DEFAULT '#16a34a',
                logo_url     TEXT        NOT NULL DEFAULT '',
                banner_url   TEXT        NOT NULL DEFAULT '',
                welcome_msg  TEXT        NOT NULL DEFAULT '',
                dark_mode    BOOLEAN     NOT NULL DEFAULT FALSE,
                updated_at   TIMESTAMP   NOT NULL DEFAULT NOW(),
                UNIQUE(tenant_id)
            );

            CREATE TABLE IF NOT EXISTS tenant_orders (
                id                SERIAL PRIMARY KEY,
                tenant_id         INTEGER NOT NULL REFERENCES tenants(id),
                order_source      TEXT NOT NULL,
                external_order_id TEXT,
                status            TEXT NOT NULL DEFAULT 'pending',
                items             TEXT,
                subtotal          REAL,
                tax               REAL,
                total             REAL,
                notes             TEXT,
                created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS contact_submissions (
                id              SERIAL PRIMARY KEY,
                name            TEXT NOT NULL,
                email           TEXT NOT NULL,
                restaurant_name TEXT,
                phone           TEXT,
                plan_interest   TEXT,
                message         TEXT NOT NULL,
                created_at      TIMESTAMP NOT NULL DEFAULT NOW()
            );
        """)

        # Migrations for existing deployments
        await conn.execute(
            "ALTER TABLE tenant_customization ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN NOT NULL DEFAULT FALSE"
        )
        await conn.execute(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT ''"
        )
        await conn.execute(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT NOT NULL DEFAULT '[]'"
        )
        await conn.execute(
            "ALTER TABLE phone_agents ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT"
        )
        await conn.execute(
            "ALTER TABLE phone_agents ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT NOT NULL DEFAULT 'not_connected'"
        )
        # Auth enhancements: social login, phone, email verification
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT")
        try:
            await conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id) WHERE google_id IS NOT NULL")
        except Exception:
            pass
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS auth_tokens (
                id         SERIAL PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token      TEXT NOT NULL UNIQUE,
                type       VARCHAR(30) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used       BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_interactions (
                id          SERIAL PRIMARY KEY,
                tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                user_role   VARCHAR(50) NOT NULL DEFAULT 'owner',
                action      VARCHAR(100) NOT NULL,
                page        VARCHAR(100),
                metadata    TEXT NOT NULL DEFAULT '{}',
                created_at  TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS improvement_suggestions (
                id          SERIAL PRIMARY KEY,
                title       TEXT NOT NULL,
                description TEXT NOT NULL,
                category    VARCHAR(50) NOT NULL DEFAULT 'feature',
                priority    VARCHAR(20) NOT NULL DEFAULT 'medium',
                source      VARCHAR(50) NOT NULL DEFAULT 'ai',
                status      VARCHAR(20) NOT NULL DEFAULT 'pending',
                admin_notes TEXT,
                created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
                reviewed_at TIMESTAMP
            );
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS tenant_feedback (
                id              SERIAL PRIMARY KEY,
                tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                restaurant_name TEXT NOT NULL DEFAULT '',
                owner_name      TEXT NOT NULL DEFAULT '',
                q1_overall      BOOLEAN,
                q2_easy_to_use  BOOLEAN,
                q3_effective    BOOLEAN,
                star_rating     INTEGER NOT NULL DEFAULT 5,
                comment         TEXT,
                status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
                approved_at     TIMESTAMP
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS phone_otps (
                id         SERIAL PRIMARY KEY,
                phone      TEXT NOT NULL,
                otp        VARCHAR(6) NOT NULL,
                user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMP NOT NULL,
                used       BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)

        admin_email = os.getenv("ADMIN_EMAIL", "admin@restaurant.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin1234")
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", admin_email)
        if not existing:
            hashed = bcrypt.hashpw(admin_password.encode(), bcrypt.gensalt()).decode()
            await conn.execute(
                "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')",
                admin_email, hashed,
            )


async def close_db():
    if _pool:
        await _pool.close()
