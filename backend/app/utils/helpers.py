import random
import string
from datetime import date, time, datetime, timedelta
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session
# SỬA: Thêm func vào đây để tính SUM
from sqlalchemy import and_, or_, func 
# SỬA: Thêm Invoice vào danh sách import từ models
from app.models import Booking, Field, Membership, Invoice, Feedback
from app.core.config import (
    BookingStatus, PaymentStatus, MEMBERSHIP_DISCOUNT, MEMBERSHIP_FEE, PAYMENT_WINDOW_MINUTES
)

PEAK_HOUR_START = time(17, 0)
PEAK_HOUR_END = time(22, 0)

def payment_deadline(b: Booking) -> datetime:
    """Hạn thanh toán (UTC) của đơn chờ thanh toán."""
    return b.han_thanh_toan or ((b.ngay_tao or datetime.utcnow()) + timedelta(minutes=PAYMENT_WINDOW_MINUTES))


def amount_paid(b: Booking) -> Decimal:
    """Số tiền khách đã thực sự thanh toán cho đơn.
    Ưu tiên cột so_tien_da_tt; với hóa đơn cũ (NULL) thì suy ra từ trạng thái hóa đơn/đơn."""
    inv = b.invoice
    if not inv:
        return Decimal(0)
    if inv.so_tien_da_tt is not None:
        return Decimal(inv.so_tien_da_tt)
    if inv.trang_thai in (PaymentStatus.DA_THANH_TOAN, PaymentStatus.CHO_HOAN_TIEN, PaymentStatus.HOAN_TIEN):
        return Decimal(inv.tong_cong)
    # Đơn online cũ đã được xác nhận (khách tự đặt) → coi như đã thanh toán đủ
    if (
        b.khach_hang_id is not None
        and b.nguoi_tao_id == b.khach_hang_id
        and b.trang_thai in (BookingStatus.DA_XAC_NHAN, BookingStatus.DANG_SU_DUNG, BookingStatus.HOAN_THANH)
    ):
        return Decimal(inv.tong_cong)
    return Decimal(0)


def payment_due(b: Booking) -> Decimal:
    """Số tiền khách còn phải thanh toán online:
    - Đơn CHỜ XÁC NHẬN: toàn bộ hóa đơn chưa trả.
    - Đơn ĐÃ XÁC NHẬN: phần chênh lệch sau khi đổi lịch sang giờ đắt hơn (nếu có)."""
    inv = b.invoice
    if not inv:
        return Decimal(0)
    if b.trang_thai == BookingStatus.CHO_XAC_NHAN:
        return max(Decimal(0), Decimal(inv.tong_cong) - amount_paid(b))
    if b.trang_thai == BookingStatus.DA_XAC_NHAN:
        return max(Decimal(0), Decimal(inv.chenh_lech_cho_tt or 0))
    return Decimal(0)


def mark_invoice_paid(b: Booking) -> None:
    """Ghi nhận khách đã thanh toán đủ hóa đơn hiện tại."""
    if b.invoice:
        b.invoice.trang_thai = PaymentStatus.DA_THANH_TOAN
        b.invoice.so_tien_da_tt = b.invoice.tong_cong
        b.invoice.chenh_lech_cho_tt = Decimal(0)
    b.han_thanh_toan = None


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

def has_booking_conflict(db, san_id, ngay_dat, gio_bat_dau, gio_ket_thuc, exclude_booking_id=None):
    query = db.query(Booking).filter(
        Booking.san_id == san_id,
        Booking.ngay_dat == ngay_dat,
        Booking.trang_thai != BookingStatus.HUY,
        Booking.gio_bat_dau < gio_ket_thuc,
        Booking.gio_ket_thuc > gio_bat_dau
    )

    if exclude_booking_id:
        query = query.filter(Booking.id != exclude_booking_id)

    conflict = query.first()
    return conflict is not None

def get_active_membership(db: Session, user_id: int) -> Optional[Membership]:
    today = date.today()
    return db.query(Membership).filter(
        Membership.khach_hang_id == user_id,
        Membership.ngay_bat_dau <= today,
        Membership.ngay_ket_thuc >= today,
        Membership.trang_thai == "ACTIVE",
    ).first()

def calculate_lifetime_spend(db: Session, user_id: int) -> float:
    """Tính tổng chi tiêu dựa trên Invoice (Sân + Dịch vụ)"""
    total = db.query(func.sum(Invoice.tong_cong)).\
        join(Booking, Invoice.booking_id == Booking.id).\
        filter(
            Booking.khach_hang_id == user_id,
            Booking.trang_thai == BookingStatus.HOAN_THANH
        ).scalar()
    
    return float(total) if total else 0.0

def calculate_tier_from_spend(spend) -> str:
    """Trả về tier dựa trên lifetime spend (Dùng >= để lấy mốc chuẩn)"""
    from app.core.config import MEMBERSHIP_THRESHOLD
    spend_f = float(spend)
    if spend_f >= MEMBERSHIP_THRESHOLD["KIM_CUONG"]:
        return "KIM_CUONG"
    if spend_f >= MEMBERSHIP_THRESHOLD["VANG"]:
        return "VANG"
    if spend_f >= MEMBERSHIP_THRESHOLD["BAC"]:
        return "BAC"
    return "THUONG"

def get_discount_rate(loai_the: Optional[str]) -> float:
    if not loai_the:
        return 0.0
    return MEMBERSHIP_DISCOUNT.get(loai_the, 0.0)

def calculate_membership_fee(loai_the: str, thang: int) -> Decimal:
    monthly = MEMBERSHIP_FEE.get(loai_the, 0)
    discount = 0.0
    if thang >= 12:
        discount = 0.20
    elif thang >= 6:
        discount = 0.10
    elif thang >= 3:
        discount = 0.05
    total = monthly * thang * (1 - discount)
    return Decimal(str(round(total)))

def get_feedback_snapshot(db: Session, san_id: Optional[int] = None) -> dict:
    """Số liệu thô nhanh về đánh giá (không gọi AI): tổng số, điểm TB, % hài lòng, vài nhận xét gần nhất."""
    q = db.query(Feedback)
    if san_id:
        q = q.join(Booking, Feedback.booking_id == Booking.id).filter(Booking.san_id == san_id)
    feedbacks = q.order_by(Feedback.ngay_tao.desc()).all()

    total = len(feedbacks)
    if total == 0:
        return {"tong_so": 0, "trung_binh": 0.0, "hai_long_pct": 0, "highlights": []}

    avg = sum(f.danh_gia_tong for f in feedbacks) / total
    hai_long = sum(1 for f in feedbacks if f.danh_gia_tong >= 4)
    highlights = [f.nhan_xet.strip() for f in feedbacks if f.nhan_xet and f.nhan_xet.strip()][:5]

    return {
        "tong_so": total,
        "trung_binh": round(avg, 2),
        "hai_long_pct": round(hai_long / total * 100),
        "highlights": highlights,
    }


def is_valid_booking_time(start: time, end: time) -> tuple[bool, str]:
    if start.minute not in (0, 15, 30, 45) or end.minute not in (0, 15, 30, 45):
        return False, "Giờ đặt phải theo bước 15 phút"
    hours = calculate_hours(start, end)
    if hours <= 0:
        return False, "Giờ kết thúc phải sau giờ bắt đầu"
    if hours < 0.5:
        return False, "Đặt sân tối thiểu 30 phút"
    if hours > 3:
        return False, "Đặt sân tối đa 3 tiếng"
    return True, ""
