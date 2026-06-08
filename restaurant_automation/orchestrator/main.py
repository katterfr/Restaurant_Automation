"""
orchestrator/main.py — FastAPI application entry point.
Registers all routers, starts the event bus listeners, and runs the scheduler.
"""
from __future__ import annotations
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from orchestrator.config import settings
from orchestrator.bus import bus, Events
from orchestrator.scheduler import start_scheduler, stop_scheduler
from orchestrator.event_handlers import register_handlers

from phone_agent.agent import router as phone_router
from sync.webhook_router import router as webhook_router

# ── API routers (REST endpoints for dashboard / admin) ───────────────────────
from inventory.routes import router as inventory_router
from accounting.routes import router as accounting_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    log.info("🚀 Starting %s Automation Platform", settings.restaurant_name)

    # Initialize databases
    from inventory.inventory_db import init_db
    from accounting.ledger import init_ledger
    await init_db()
    await init_ledger()

    # Register event handlers on the bus
    register_handlers()

    # Start background scheduler (nightly reports, sync checks)
    start_scheduler()

    log.info("✅ Platform ready — listening for events")
    yield

    # Shutdown
    stop_scheduler()
    log.info("🛑 Platform shutdown complete")


app = FastAPI(
    title=f"{settings.restaurant_name} Automation API",
    version="1.0.0",
    description="AI-powered restaurant automation: phone agent, inventory, accounting, sync",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount routers ────────────────────────────────────────────────────────────
app.include_router(phone_router)
app.include_router(webhook_router)
app.include_router(inventory_router)
app.include_router(accounting_router)


@app.get("/health")
async def health():
    return {"status": "ok", "restaurant": settings.restaurant_name}


@app.get("/")
async def root():
    return {
        "service": f"{settings.restaurant_name} Automation Platform",
        "version": "1.0.0",
        "endpoints": {
            "health":     "/health",
            "phone":      "/phone/incoming",
            "webhooks":   "/webhooks/{doordash|ubereats|website}",
            "inventory":  "/inventory/",
            "accounting": "/accounting/",
            "docs":       "/docs",
        }
    }
