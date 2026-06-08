import os
import asyncpg
import bcrypt

_pool: asyncpg.Pool | None = None


async def get_db():
    async with _pool.acquire() as conn:
        yield conn


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
