from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import settings
from db.database import init_db, close_db
from api.routers import auth, tenants, billing, menu, orders, portal, ads, features, social, accounting, delivery, business, phone, creative, public, admin_chat, feedback

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting %s", settings.app_name)
    await init_db()
    log.info("Database ready")
    yield
    await close_db()
    log.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Multi-tenant SaaS management platform for Restaurant Automation",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(billing.router)
app.include_router(menu.router)
app.include_router(orders.router)
app.include_router(portal.router)
app.include_router(ads.router)
app.include_router(features.router)
app.include_router(social.router)
app.include_router(accounting.router)
app.include_router(delivery.router)
app.include_router(business.router)
app.include_router(phone.router)
app.include_router(creative.router)
app.include_router(public.router)
app.include_router(admin_chat.router)
app.include_router(feedback.router)

_UPLOAD_DIR = Path("/tmp/uploads")
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOAD_DIR)), name="uploads")


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name, "version": "1.0.0"}


@app.get("/")
async def root():
    return {
        "service": settings.app_name,
        "version": "1.0.0",
        "endpoints": {
            "health":   "/health",
            "auth":     "/auth/login",
            "tenants":  "/tenants/",
            "billing":  "/billing/plans",
            "docs":     "/docs",
        },
    }
