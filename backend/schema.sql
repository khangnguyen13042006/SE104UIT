import random
import string
from datetime import date, time, datetime, timedelta
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.models import Booking, Field, Membership
from app.core.config import (
    BookingStatus, MEMBERSHIP_DISCOUNT, MEMBERSHIP_FEE
)

PEAK_HOUR_START = time(17, 0)
PEAK_HOUR_END = time(22, 0)


def generate_code(prefix: str = "BK") -> str:
    """Sinh mã: prefix + 8 chữ số ngẫu nhiên"""
    suffix = "".join(random.choices(string.digits, k=8))
    return f"{prefix}{suffix}"


def time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def calculate_hours(start: time, end: time) -> float:
    return (time_to_minutes(end) - time_to_minutes(start)) / 60.0


def calculate_field_price(field: Field, start: time, end: time) -> Decimal:
    """Tính tiền sân theo giờ: tách phần thường (6-17h) và cao điểm (17-22h)"""
    start_min = time_to_minutes(start)
    end_min = time_to_minutes(end)
    peak_start = time_to_minutes(PEAK_HOUR_START)

    total = Decimal(0)
    # Phần thường: từ start tới min(end, peak_start)
    if start_min < peak_start:
        normal_end = min(end_min, peak_start)
        hours_normal = (normal_end - start_min) / 60.0
        total += Decimal(str(hours_normal)) * field.gia_tieu_chuan
    # Phần cao điểm: từ max(start, peak_start) tới end
    if end_min > peak_start:
        peak_begin = max(start_min, peak_start)
        hours_peak = (end_min - peak_begin) / 60.0
        total += Decimal(str(hours_peak)) * field.gia_cao_diem

    return total.quantize(Decimal("1"))


def has_booking_conflict(
    db: Session, san_id: int, ngay: date, gio_bat_dau: time,
    gio_ket_thuc: time, exclude_booking_id: Optional[int] = None
) -> bool:
    """Kiểm tra xung đột lịch (overlap)"""
    q = db.query(Booking).filter(
        Booking.san_id == san_id,
        Booking.ngay_dat == ngay,
        Booking.trang_thai != BookingStatus.HUY,
        # overlap: existing.start < new.end AND existing.end > new.start
        Booking.gio_bat_dau < gio_ket_thuc,
        Booking.gio_ket_thuc > gio_bat_dau,
    )
    if exclude_booking_id:
        q = q.filter(Booking.id != exclude_booking_id)
    return db.query(q.exists()).scalar()


def get_active_membership(db: Session, user_id: int) -> Optional[Membership]:
    today = date.today()
    return db.query(Membership).filter(
        Membership.khach_hang_id == user_id,
        Membership.ngay_bat_dau <= today,
        Membership.ngay_ket_thuc >= today,
        Membership.trang_thai == "ACTIVE",
    ).first()


def calculate_lifetime_spend(db: Session, user_id: int) -> Decimal:
    """Tổng tiền user đã chi (tiền sân tất cả booking hoàn thành)."""
    from sqlalchemy import func
    result = db.query(func.coalesce(func.sum(Booking.tien_san), 0)).filter(
        Booking.khach_hang_id == user_id,
        Booking.trang_thai == BookingStatus.HOAN_THANH,
    ).scalar()
    return Decimal(str(result or 0))


def calculate_tier_from_spend(spend) -> str:
    """Trả về tier (THUONG/BAC/VANG/KIM_CUONG) dựa trên lifetime spend."""
    from app.core.config import MEMBERSHIP_THRESHOLD
    spend_f = float(spend)
    if spend_f > MEMBERSHIP_THRESHOLD["KIM_CUONG"]:
        return "KIM_CUONG"
    if spend_f > MEMBERSHIP_THRESHOLD["VANG"]:
        return "VANG"
    if spend_f > MEMBERSHIP_THRESHOLD["BAC"]:
        return "BAC"
    return "THUONG"


def get_discount_rate(loai_the: Optional[str]) -> float:
    if not loai_the:
        return 0.0
    return MEMBERSHIP_DISCOUNT.get(loai_the, 0.0)


def calculate_membership_fee(loai_the: str, thang: int) -> Decimal:
    monthly = MEMBERSHIP_FEE.get(loai_the, 0)
    # Khuyến mãi: 3 tháng giảm 5%, 6 tháng giảm 10%, 12 tháng giảm 20%
    discount = 0.0
    if thang >= 12:
        discount = 0.20
    elif thang >= 6:
        discount = 0.10
    elif thang >= 3:
        discount = 0.05
    total = monthly * thang * (1 - discount)
    return Decimal(str(round(total)))


def is_valid_booking_time(start: time, end: time) -> tuple[bool, str]:
    """Quy định: bước 30 phút, tối thiểu 0.5h (30 phút), tối đa 3h"""
    if start.minute not in (0, 30) or end.minute not in (0, 30):
        return False, "Giờ đặt phải theo bước 30 phút"
    hours = calculate_hours(start, end)
    if hours <= 0:
        return False, "Giờ kết thúc phải sau giờ bắt đầu"
    if hours < 0.5:
        return False, "Đặt sân tối thiểu 30 phút"
    if hours > 3:
        return False, "Đặt sân tối đa 3 tiếng"
    return True, ""
