"""
setup.py — One-time setup script.
Seeds the database with menu items from menu.json and initializes all tables.
Run: python setup.py
"""
import asyncio
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


async def main():
    from inventory.inventory_db import init_db, upsert_item
    from accounting.ledger import init_ledger

    log.info("Initializing database tables...")
    await init_db()
    await init_ledger()

    menu_path = Path("menu.json")
    if menu_path.exists():
        menu = json.loads(menu_path.read_text())
        log.info("Seeding %d menu items into inventory...", len(menu))
        for item in menu:
            await upsert_item(**{k: item[k] for k in [
                "sku", "name", "category", "unit",
                "qty_on_hand", "reorder_level", "cost_per_unit", "sell_price"
            ]})
            log.info("  ✓ %s — %s", item["sku"], item["name"])
    else:
        log.warning("menu.json not found — skipping item seed")

    log.info("✅ Setup complete! Run: uvicorn orchestrator.main:app --reload")


if __name__ == "__main__":
    asyncio.run(main())
