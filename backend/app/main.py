import asyncio
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

# Tạo tables
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: chạy scheduler background
    task = asyncio.create_task(reminder_loop())
    yield
    # Shutdown: hủy task
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Sân Bóng API",
    description="API quản lý đặt lịch và vận hành sân bóng",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        "version": "1.1.0",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/debug/db")
def debug_db():
    """Returns current DB info — verify SQLite vs MySQL connection."""
    from app.core.database import get_db_info
    return get_db_info()
