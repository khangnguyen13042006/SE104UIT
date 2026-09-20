"""Lớp bảo vệ API: header bảo mật, giới hạn tần suất theo IP, khóa tạm khi đoán mật khẩu/OTP, ghi sự kiện bảo mật.
ponytail: bộ đếm nằm trong bộ nhớ tiến trình (đủ cho 1 worker); chạy nhiều worker thì chuyển sang Redis."""
import logging
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("uvicorn.error")

LOGIN_MAX_FAILS = 5          # sai quá số lần này trong cửa sổ → khóa
LOGIN_WINDOW_S = 15 * 60
LOGIN_LOCK_S = 15 * 60
IP_LOGIN_MAX_FAILS = 20      # một IP dò nhiều tài khoản

# (tiền tố đường dẫn, số request, cửa sổ giây) — khớp quy tắc đầu tiên; còn lại dùng mặc định
RATE_RULES = [
    ("/api/auth/login", 15, 60),
    ("/api/auth/register", 8, 600),
    ("/api/auth/send-otp", 10, 3600),
    ("/api/auth/verify-otp", 20, 600),
    ("/api/chat", 60, 60),
    ("/api/bookings/guest", 10, 600),
]
DEFAULT_RATE = (300, 60)
_hits: dict[str, deque] = defaultdict(deque)
_fails: dict[str, deque] = defaultdict(deque)
_locked: dict[str, float] = {}
_last_gc = 0.0


def client_ip(request: Request) -> str:
    # Sau proxy (Render/Vercel) proxy nối IP thật vào CUỐI X-Forwarded-For; phần đầu do client tự khai nên không tin.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "?"


def _allow(key: str, limit: int, window: int) -> bool:
    now = time.time()
    dq = _hits[key]
    while dq and dq[0] < now - window:
        dq.popleft()
    if len(dq) >= limit:
        return False
    dq.append(now)
    return True


def _gc() -> None:
    global _last_gc
    now = time.time()
    if now - _last_gc < 300:
        return
    _last_gc = now
    for store in (_hits, _fails):
        for k in [k for k, dq in store.items() if not dq or dq[-1] < now - 3600]:
            store.pop(k, None)
    for k in [k for k, t in _locked.items() if t < now]:
        _locked.pop(k, None)


def log_event(loai: str, email: Optional[str] = None, ip: Optional[str] = None, detail: Optional[str] = None) -> None:
    from app.core.database import SessionLocal
    from app.models import SecurityEvent
    db = SessionLocal()
    try:
        db.add(SecurityEvent(loai=loai, email=(email or "")[:120] or None, ip=ip, chi_tiet=(detail or "")[:200] or None))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("security event log failed")
    finally:
        db.close()


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


async def protect_middleware(request: Request, call_next):
    """Giới hạn tần suất theo IP + gắn header bảo mật cho mọi phản hồi."""
    path = request.url.path
    if request.method != "OPTIONS" and path.startswith("/api/") and path != "/api/health":
        _gc()
        ip = client_ip(request)
        limit, window = DEFAULT_RATE
        rule = "default"
        for prefix, n, w in RATE_RULES:
            if path.startswith(prefix):
                limit, window, rule = n, w, prefix
                break
        if not _allow(f"{ip}|{rule}", limit, window):
            log_event("RATE_LIMIT", ip=ip, detail=f"{request.method} {rule}")
            return JSONResponse({"detail": "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút."}, status_code=429,
                                headers={"Retry-After": str(min(window, 60))})
    response = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if not path.startswith(("/docs", "/redoc", "/openapi")):
        response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    return response


# ---------------- Khóa tạm khi đoán mật khẩu ----------------
def assert_login_allowed(email: str, ip: str) -> None:
    now = time.time()
    for key in (f"u|{email.lower()}", f"i|{ip}"):
        until = _locked.get(key)
        if until and until > now:
            raise HTTPException(429, f"Đăng nhập sai quá nhiều lần, thử lại sau {int(until - now) // 60 + 1} phút.")


def record_login_fail(email: str, ip: str) -> None:
    now = time.time()
    for key, cap in ((f"u|{email.lower()}", LOGIN_MAX_FAILS), (f"i|{ip}", IP_LOGIN_MAX_FAILS)):
        dq = _fails[key]
        while dq and dq[0] < now - LOGIN_WINDOW_S:
            dq.popleft()
        dq.append(now)
        if len(dq) >= cap:
            _locked[key] = now + LOGIN_LOCK_S
            dq.clear()
            log_event("LOCKED", email if key.startswith("u|") else None, ip, "khóa tạm do đăng nhập sai nhiều lần")
    log_event("LOGIN_FAIL", email, ip)


def record_login_ok(email: str) -> None:
    _fails.pop(f"u|{email.lower()}", None)
    _locked.pop(f"u|{email.lower()}", None)


# ---------------- OTP ----------------
def limit_otp(email: str, ip: str, verify: bool) -> None:
    """Chống spam email (send) và dò mã 6 số (verify)."""
    ok = _allow(f"otp-v|{email.lower()}", 6, 600) if verify else _allow(f"otp-s|{email.lower()}", 3, 600)
    if not ok:
        log_event("OTP_ABUSE", email, ip, "dò mã OTP" if verify else "gửi OTP dồn dập")
        raise HTTPException(429, "Bạn thao tác quá nhiều lần, vui lòng thử lại sau ít phút.")


def reset() -> None:
    """Dùng cho test."""
    _hits.clear()
    _fails.clear()
    _locked.clear()
