import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env nếu có
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from app.core.database import Base, engine
from app.routers import (
    auth, users, fields, bookings, services,
    invoices, memberships, shifts, feedbacks, reports
)
from app.utils.scheduler import reminder_loop

logger = logging.getLogger("uvicorn.error")


def init_database():
    """Tạo tables nếu chưa có. Chạy 1 lần lúc startup, không crash app nếu DB tạm thời không sẵn sàng."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables initialized")
    except Exception as e:
        logger.error(f"⚠️  Database init failed (will retry on first request): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_database()
    task = asyncio.create_task(reminder_loop())
    logger.info("🚀 App started")
    yield
    # Shutdown
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Sân Bóng API",
    description="API quản lý đặt lịch và vận hành sân bóng",
    version="1.2.0",
    lifespan=lifespan,
)

# ============ CORS ============
# Đọc danh sách origins từ env var ALLOWED_ORIGINS (comma-separated)
# Default bao gồm: Vercel production + localhost dev
DEFAULT_ORIGINS = [
    "https://se104uit.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

env_origins = os.getenv("ALLOWED_ORIGINS", "").strip()
if env_origins:
    ALLOWED_ORIGINS = [o.strip() for o in env_origins.split(",") if o.strip()]
else:
    ALLOWED_ORIGINS = DEFAULT_ORIGINS

# Cho phép Vercel preview deployments (preview URLs có dạng se104uit-*.vercel.app)
ALLOWED_ORIGIN_REGEX = r"https://se104uit.*\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

logger.info(f"CORS allowed origins: {ALLOWED_ORIGINS}")
logger.info(f"CORS regex: {ALLOWED_ORIGIN_REGEX}")

# ============ ROUTERS ============
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(fields.router)
app.include_router(bookings.router)
app.include_router(services.router)
app.include_router(invoices.router)
app.include_router(memberships.router)
app.include_router(shifts.router)
app.include_router(feedbacks.router)
app.include_router(reports.router)


@app.get("/")
def root():
    return {
        "name": "San Bong API",
        "version": "1.2.0",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/debug/db")
def debug_db():
    """Returns current DB info — verify connection without exposing credentials."""
    from app.core.database import get_db_info
    return get_db_info()


# ============ Allow running directly: `python -m app.main` (local dev only) ============
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
