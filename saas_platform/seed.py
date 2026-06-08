"""
Create the initial admin user.

Usage:
  python seed.py                          # uses defaults below
  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret python seed.py
"""
import asyncio
import os
import sys
from pathlib import Path

import aiosqlite

DB_PATH = Path(__file__).parent / "saas.db"

DEFAULT_EMAIL    = os.getenv("ADMIN_EMAIL",    "admin@restaurant.com")
DEFAULT_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin1234")


async def seed():
    import bcrypt as _bcrypt

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Ensure tables exist
        from db.database import init_db  # noqa: runs CREATE TABLE IF NOT EXISTS
        await init_db()

        # Check if user already exists
        cur = await db.execute("SELECT id FROM users WHERE email = ?", (DEFAULT_EMAIL,))
        if await cur.fetchone():
            print(f"User {DEFAULT_EMAIL} already exists — nothing to do.")
            return

        hashed = _bcrypt.hashpw(DEFAULT_PASSWORD.encode(), _bcrypt.gensalt()).decode()
        await db.execute(
            "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')",
            (DEFAULT_EMAIL, hashed),
        )
        await db.commit()
        print(f"✓ Admin user created: {DEFAULT_EMAIL} / {DEFAULT_PASSWORD}")
        print("  Change your password after first login!")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    asyncio.run(seed())
