"""Hạ tầng công cụ (tool) của chatbot: khai báo, phân quyền theo vai trò, tìm kiếm thực thể, tiện ích chung.

Mô hình an toàn:
- Chatbot KHÔNG có quyền riêng. Mọi công cụ chạy dưới danh nghĩa NGƯỜI ĐANG CHAT và bị giới hạn bởi `Tool.roles`.
- Công cụ ĐỌC chạy ngay ở server và trả dữ liệu gọn cho AI.
- Công cụ GHI chỉ tạo ĐỀ XUẤT (Proposal). Người dùng phải bấm xác nhận trên giao diện; lúc đó server kiểm tra lại
  quyền + chữ ký rồi mới thực hiện, bằng đúng các hàm nghiệp vụ mà API thường dùng (không nhân đôi logic).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Callable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import (
    BookingStatus, FieldStatus, ServiceStatus, UserRole, MEMBERSHIP_NAME,
)
from app.models import Booking, Field, Service, User
from app.utils.helpers import (
    calculate_field_price, calculate_lifetime_spend, calculate_tier_from_spend,
    get_active_membership, get_discount_rate,
)

logger = logging.getLogger("uvicorn.error")

# ---------------- Vai trò ----------------
GUEST = "GUEST"
KH = UserRole.KHACH_HANG.value
NV = UserRole.NHAN_VIEN.value
QL = UserRole.QUAN_LY.value
AD = UserRole.ADMIN.value

R_ALL = frozenset({GUEST, KH, NV, QL, AD})
R_AUTHED = frozenset({KH, NV, QL, AD})
R_CUSTOMER = frozenset({KH})
R_STAFF = frozenset({NV, QL, AD})
R_MANAGER = frozenset({QL, AD})
R_ADMIN = frozenset({AD})

ROLE_LABEL = {
    GUEST: "khách vãng lai (chưa đăng nhập)",
    KH: "khách hàng",
    NV: "nhân viên",
    QL: "quản lý",
    AD: "quản trị viên (admin)",
}

STATUS_LABEL = {
    "CHO_XAC_NHAN": "Chờ xác nhận", "DA_XAC_NHAN": "Đã xác nhận", "DANG_SU_DUNG": "Đang sử dụng",
    "HOAN_THANH": "Hoàn thành", "HUY": "Đã hủy",
}
MAX_PROPOSALS_PER_TURN = 5


class ToolError(Exception):
    """Lỗi nghiệp vụ có thể nói thẳng với người dùng (không phải lỗi hệ thống)."""


@dataclass
class Ctx:
    db: Session
    user: Optional[User]
    role: str
    now_vn: datetime
    proposals: list = field(default_factory=list)      # các Proposal đã tạo trong lượt này
    booking_action: Optional[dict] = None              # gợi ý điền form đặt sân (cho khách vãng lai)
    tools_used: list = field(default_factory=list)

    @property
    def today(self) -> date:
        return self.now_vn.date()

    @property
    def is_staff(self) -> bool:
        return self.role in R_STAFF

    @property
    def is_manager(self) -> bool:
        return self.role in R_MANAGER


@dataclass
class Proposal:
    title: str
    lines: list                     # [(nhãn, giá trị)]
    args: dict                      # tham số đã chuẩn hóa (chỉ id/giá trị thô, JSON-safe) dùng lúc thực thi
    danger: bool = False
    confirm_label: str = "Xác nhận"


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    roles: frozenset
    kind: str                       # "read" | "write"
    fn: Callable                    # read: fn(ctx, args)->dict ; write: prepare(ctx, args)->Proposal
    icon: str = "🛠️"
    danger: bool = False
    confirm_label: str = "Xác nhận"
    execute: Optional[Callable] = None   # chỉ cho write: execute(ctx, args)->dict
    label: str = ""                 # mô tả ngắn cho danh sách "chatbot làm được gì"

    def executor(self, f: Callable) -> Callable:
        self.execute = f
        return f


REGISTRY: dict[str, Tool] = {}


def _schema(props: dict, required: Optional[list] = None) -> dict:
    return {"type": "object", "properties": props, "required": required or []}


def P_str(desc: str, enum: Optional[list] = None) -> dict:
    d = {"type": "string", "description": desc}
    if enum:
        d["enum"] = enum
    return d


def P_int(desc: str) -> dict:
    return {"type": "integer", "description": desc}


def P_num(desc: str) -> dict:
    return {"type": "number", "description": desc}


def P_bool(desc: str) -> dict:
    return {"type": "boolean", "description": desc}


def read_tool(name: str, description: str, props: dict, required: Optional[list] = None, *,
              roles: frozenset = R_ALL, label: str = "", icon: str = "🔎"):
    def deco(fn: Callable) -> Callable:
        REGISTRY[name] = Tool(name, description, _schema(props, required), roles, "read", fn, icon=icon, label=label)
        return fn
    return deco


def write_tool(name: str, description: str, props: dict, required: Optional[list] = None, *,
               roles: frozenset, label: str = "", icon: str = "✏️", danger: bool = False,
               confirm_label: str = "Xác nhận"):
    """Dùng làm decorator cho hàm `prepare`; trả về Tool để gắn `@tool.executor`."""
    def deco(fn: Callable) -> Tool:
        t = Tool(name, description, _schema(props, required), roles, "write", fn, icon=icon,
                 danger=danger, confirm_label=confirm_label, label=label)
        REGISTRY[name] = t
        return t
    return deco


def tools_for_role(role: str) -> list[Tool]:
    return [t for t in REGISTRY.values() if role in t.roles]


# ---------------- Định dạng / chuyển đổi ----------------
def vnd(x: Any) -> str:
    try:
        return f"{int(round(float(x))):,}".replace(",", ".") + "đ"
    except (TypeError, ValueError):
        return "0đ"


def num(x: Any) -> float:
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def hhmm(t: Optional[time]) -> str:
    return t.strftime("%H:%M") if t else ""


def clean_text(s: Any, limit: int = 80) -> str:
    """Văn bản do người dùng nhập (nhận xét, tên…) đưa vào dữ liệu công cụ: bỏ xuống dòng & cắt ngắn để giảm nguy cơ
    'chèn chỉ dẫn' qua dữ liệu (indirect prompt injection)."""
    t = re.sub(r"\s+", " ", str(s or "")).strip()
    return t[:limit] + ("…" if len(t) > limit else "")


def mask_account(acc: Optional[str]) -> str:
    acc = (acc or "").strip()
    return ("*" * max(0, len(acc) - 4) + acc[-4:]) if acc else ""


def parse_date(s: Any, name: str = "ngày") -> date:
    try:
        return datetime.strptime(str(s).strip(), "%Y-%m-%d").date()
    except Exception:
        raise ToolError(f"{name.capitalize()} không hợp lệ (cần định dạng YYYY-MM-DD).")


def parse_time(s: Any, name: str = "giờ") -> time:
    try:
        parts = str(s).strip().split(":")
        h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
        return time(h, m)
    except Exception:
        raise ToolError(f"{name.capitalize()} không hợp lệ (cần định dạng HH:MM).")


def add_minutes(t: time, minutes: int) -> time:
    total = t.hour * 60 + t.minute + minutes
    if total >= 24 * 60:
        raise ToolError("Khung giờ vượt quá cuối ngày.")
    return time(total // 60, total % 60)


def duration_end(start: time, hours: Any) -> time:
    try:
        h = float(hours)
    except (TypeError, ValueError):
        raise ToolError("Thời lượng không hợp lệ (0.5 - 3 giờ).")
    if h not in (0.5, 1.0, 1.5, 2.0, 2.5, 3.0):
        raise ToolError("Thời lượng chỉ có thể là 0.5, 1, 1.5, 2, 2.5 hoặc 3 giờ.")
    return add_minutes(start, int(h * 60))


def http_message(e: HTTPException) -> str:
    d = e.detail
    if isinstance(d, str):
        return d
    if isinstance(d, dict) and d.get("message"):
        return str(d["message"])
    if isinstance(d, list) and d:
        first = d[0]
        return str(first.get("msg") if isinstance(first, dict) else first)
    return f"Lỗi {e.status_code}"


def call_route(fn: Callable, *args, **kwargs) -> Any:
    """Gọi trực tiếp hàm xử lý của router (giữ nguyên toàn bộ validation/hiệu ứng phụ như gửi email),
    đổi HTTPException thành ToolError để hiển thị thân thiện."""
    try:
        return fn(*args, **kwargs)
    except HTTPException as e:
        raise ToolError(http_message(e))


def json_safe(o: Any) -> Any:
    if isinstance(o, dict):
        return {str(k): json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set)):
        return [json_safe(v) for v in o]
    if isinstance(o, Decimal):
        f = float(o)
        return int(f) if f.is_integer() else round(f, 2)
    if isinstance(o, (datetime,)):
        return o.strftime("%Y-%m-%d %H:%M")
    if isinstance(o, date):
        return o.isoformat()
    if isinstance(o, time):
        return o.strftime("%H:%M")
    if hasattr(o, "value") and not isinstance(o, (str, int, float, bool)):
        return o.value
    return o


# ---------------- Tìm thực thể ----------------
def find_booking(ctx: Ctx, ma: Any) -> Booking:
    ma = str(ma or "").strip().upper()
    if not ma:
        raise ToolError("Thiếu mã đặt sân (dạng BK12345678).")
    b = ctx.db.query(Booking).filter(Booking.ma_dat_san == ma).first()
    # Khách chỉ thấy đơn của mình; báo "không tìm thấy" như nhau để không lộ sự tồn tại của đơn người khác
    if not b or (ctx.role == KH and b.khach_hang_id != ctx.user.id):
        raise ToolError(f"Không tìm thấy đơn {ma}.")
    return b


def find_field(ctx: Ctx, san_id: Any = None, ten_san: Any = None, *, only_active: bool = True) -> Field:
    q = ctx.db.query(Field)
    if only_active and not ctx.is_staff:
        q = q.filter(Field.trang_thai == FieldStatus.HOAT_DONG)
    if san_id not in (None, ""):
        try:
            f = q.filter(Field.id == int(san_id)).first()
        except (TypeError, ValueError):
            f = None
        if f:
            return f
    name = str(ten_san or "").strip()
    if name:
        exact = q.filter(Field.ten_san.ilike(name)).all()
        if len(exact) == 1:
            return exact[0]
        found = q.filter(Field.ten_san.ilike(f"%{name}%")).all()
        if len(found) == 1:
            return found[0]
        if len(found) > 1:
            raise ToolError("Có nhiều sân khớp: " + ", ".join(f"{x.ten_san} (ID {x.id})" for x in found[:6]) + ". Vui lòng nói rõ sân nào.")
    raise ToolError("Không tìm thấy sân phù hợp. Hãy cho biết tên sân hoặc ID.")


def find_service(ctx: Ctx, dich_vu_id: Any = None, ten: Any = None, *, only_active: bool = False) -> Service:
    q = ctx.db.query(Service)
    if only_active:
        q = q.filter(Service.trang_thai == ServiceStatus.HOAT_DONG)
    if dich_vu_id not in (None, ""):
        try:
            s = q.filter(Service.id == int(dich_vu_id)).first()
        except (TypeError, ValueError):
            s = None
        if s:
            return s
    name = str(ten or "").strip()
    if name:
        exact = q.filter(Service.ten_dich_vu.ilike(name)).all()
        if len(exact) == 1:
            return exact[0]
        found = q.filter(Service.ten_dich_vu.ilike(f"%{name}%")).all()
        if len(found) == 1:
            return found[0]
        if len(found) > 1:
            raise ToolError("Có nhiều dịch vụ khớp: " + ", ".join(f"{x.ten_dich_vu} (ID {x.id})" for x in found[:6]) + ". Vui lòng nói rõ.")
    raise ToolError("Không tìm thấy dịch vụ phù hợp. Hãy cho biết tên dịch vụ hoặc ID.")


def find_user(ctx: Ctx, ident: Any, *, roles: Optional[list] = None) -> User:
    """ident: ID, email, số điện thoại hoặc (một phần) họ tên."""
    s = str(ident or "").strip()
    if not s:
        raise ToolError("Thiếu thông tin tài khoản (ID, email, SĐT hoặc họ tên).")
    q = ctx.db.query(User)
    if roles:
        q = q.filter(User.vai_tro.in_([UserRole(r) for r in roles]))
    if s.isdigit() and len(s) <= 6:
        u = q.filter(User.id == int(s)).first()
        if u:
            return u
    u = q.filter((User.email.ilike(s)) | (User.sdt == s)).first()
    if u:
        return u
    found = q.filter(User.ho_ten.ilike(f"%{s}%")).all()
    if len(found) == 1:
        return found[0]
    if len(found) > 1:
        raise ToolError("Có nhiều tài khoản khớp: " + ", ".join(f"{x.ho_ten} (ID {x.id})" for x in found[:6]) + ". Vui lòng nói rõ (ID/email/SĐT).")
    raise ToolError(f"Không tìm thấy tài khoản '{clean_text(s, 40)}'.")


# ---------------- Giá & giảm giá ----------------
def best_discount_rate(db: Session, user_id: Optional[int]) -> float:
    if not user_id:
        return 0.0
    rate_spend = get_discount_rate(calculate_tier_from_spend(calculate_lifetime_spend(db, user_id)))
    mem = get_active_membership(db, user_id)
    rate_mem = 0.0
    if mem:
        tier = mem.loai_the.value if hasattr(mem.loai_the, "value") else str(mem.loai_the)
        rate_mem = get_discount_rate(tier)
    return max(rate_spend, rate_mem)


def price_breakdown(f: Field, start: time, end: time, discount_rate: float = 0.0) -> dict:
    tien_san = calculate_field_price(f, start, end)
    giam = (tien_san * Decimal(str(discount_rate))).quantize(Decimal("1")) if discount_rate > 0 else Decimal(0)
    s, e = start.hour * 60 + start.minute, end.hour * 60 + end.minute
    peak = 17 * 60
    gio_thuong = max(0, min(e, peak) - s) / 60 if s < peak else 0
    gio_cao = max(0, e - max(s, peak)) / 60 if e > peak else 0
    return {
        "gio_thuong": round(gio_thuong, 2), "gio_cao_diem": round(gio_cao, 2),
        "tien_san": tien_san, "giam_gia": giam, "tong": tien_san - giam,
    }


# ---------------- Lịch trống ----------------
DAY_OPEN, DAY_CLOSE = 6 * 60, 23 * 60


def busy_intervals(db: Session, san_id: int, ngay: date) -> list[tuple[int, int]]:
    rows = db.query(Booking).filter(
        Booking.san_id == san_id, Booking.ngay_dat == ngay, Booking.trang_thai != BookingStatus.HUY,
    ).all()
    iv = sorted((b.gio_bat_dau.hour * 60 + b.gio_bat_dau.minute, b.gio_ket_thuc.hour * 60 + b.gio_ket_thuc.minute) for b in rows)
    merged: list[list[int]] = []
    for s, e in iv:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged]


def free_ranges(db: Session, san_id: int, ngay: date, now_vn: datetime) -> list[str]:
    start = DAY_OPEN
    if ngay == now_vn.date():
        m = now_vn.hour * 60 + now_vn.minute + 1
        start = max(start, ((m + 14) // 15) * 15)
    out, cur = [], start
    for s, e in busy_intervals(db, san_id, ngay):
        if s - cur >= 30:
            out.append((cur, s))
        cur = max(cur, e)
    if DAY_CLOSE - cur >= 30:
        out.append((cur, DAY_CLOSE))
    fmt = lambda m: f"{m // 60:02d}:{m % 60:02d}"
    return [f"{fmt(a)}-{fmt(b)}" for a, b in out]


def slot_is_free(db: Session, san_id: int, ngay: date, start: time, end: time) -> bool:
    s, e = start.hour * 60 + start.minute, end.hour * 60 + end.minute
    return not any(s < be and e > bs for bs, be in busy_intervals(db, san_id, ngay))


def cap_result(o: Any, max_items: int = 40, max_chars: int = 9000) -> Any:
    """Giữ kết quả công cụ gọn để phản hồi nhanh & không tràn ngữ cảnh."""
    o = json_safe(o)

    def trim(x):
        if isinstance(x, list):
            return [trim(v) for v in x[:max_items]] + ([f"... còn {len(x) - max_items} mục nữa"] if len(x) > max_items else [])
        if isinstance(x, dict):
            return {k: trim(v) for k, v in x.items()}
        return x

    o = trim(o)
    s = json.dumps(o, ensure_ascii=False)
    if len(s) > max_chars:
        return {"_canh_bao": "Kết quả quá dài đã bị rút gọn, hãy lọc hẹp hơn.", "_du_lieu": s[:max_chars]}
    return o
