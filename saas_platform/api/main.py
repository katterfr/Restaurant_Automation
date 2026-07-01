from __future__ import annotations
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import settings
from db.database import init_db, close_db, get_db_pool
from api.routers import auth, tenants, billing, menu, orders, portal, ads, features, social, accounting, delivery, business, phone, creative, public, admin_chat, feedback, staff, webauthn, admin_marketing
from api.routers import tasks as tasks_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
log = logging.getLogger(__name__)


async def _task_scheduler_loop():
    """Background loop: check for due tasks every 60 seconds."""
    from api.routers.tasks import run_due_tasks, init_task_tables
    await asyncio.sleep(10)  # give DB time to init on startup
    while True:
        try:
            pool = await get_db_pool()
            async with pool.acquire() as conn:
                await init_task_tables(conn)
                count = await run_due_tasks(conn)
                if count:
                    log.info("Task scheduler: ran %d due task(s)", count)
        except asyncio.CancelledError:
            break
        except Exception as e:
            log.error("Task scheduler error: %s", e)
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting %s", settings.app_name)
    await init_db()
    log.info("Database ready")
    scheduler_task = asyncio.create_task(_task_scheduler_loop())
    yield
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    await close_db()
    log.info("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Multi-tenant SaaS management platform for Restaurant Automation",
    lifespan=lifespan,
)

# Redirect all HTTP requests to HTTPS
app.add_middleware(HTTPSRedirectMiddleware)

# Restrict CORS to the configured frontend origin with explicit methods/headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
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
app.include_router(admin_marketing.router)
app.include_router(feedback.router)
app.include_router(staff.router)
app.include_router(webauthn.router)
app.include_router(tasks_router.router)

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
