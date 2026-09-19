"""Thông báo cho trang quản trị, gom sẵn theo 3 nhóm để chuông chỉ cần gọi 1 request."""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_roles
from app.core.config import UserRole, BookingStatus, ServiceStatus, PaymentStatus
from app.models import Booking, Service, Shift, Feedback, User
from app.utils.helpers import payment_due, amount_paid

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

STAFF_ROLES = (UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)

# Sau giờ này (giờ VN) mà ngày mai chưa có ca trực nào → nhắc phân ca
SHIFT_REMINDER_HOUR = 20
LOW_STOCK_THRESHOLD = 5


def _vnd(x) -> str:
    return f"{int(x):,}".replace(",", ".") + "đ"


def _ten_khach(b: Booking) -> str:
    if b.khach_hang:
        return b.khach_hang.ho_ten
    return b.ten_khach_vang_lai or "Khách lẻ"


def _item(id: str, icon: str, title: str, desc: str, time: Optional[datetime], href: str, urgent: bool) -> dict:
    return {
        "id": id,
        "icon": icon,
        "title": title,
        "desc": desc,
        "time": time or datetime.utcnow(),
        "href": href,
        "urgent": urgent,
    }


@router.get("")
def list_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*STAFF_ROLES)),
):
    now_utc = datetime.utcnow()
    now_vn = now_utc + timedelta(hours=7)
    is_manager = user.vai_tro in (UserRole.ADMIN, UserRole.QUAN_LY)

    # ============ 1) ĐẶT SÂN ============
    dat_san: list[dict] = []

    pending = (
        db.query(Booking)
        .filter(Booking.trang_thai == BookingStatus.CHO_XAC_NHAN)
        .order_by(Booking.ngay_tao.desc())
        .limit(30)
        .all()
    )
    for b in pending:
        due = payment_due(b)
        claimed = b.khach_bao_chuyen_khoan is not None
        is_balance = amount_paid(b) > 0  # đã trả một phần → đang nợ chênh lệch sau đổi lịch
        if claimed:
            title = "Khách báo đã chuyển khoản"
            desc = f"{b.ma_dat_san} • {_ten_khach(b)} • {_vnd(due)} — cần kiểm tra & xác nhận"
        elif is_balance:
            title = "Chờ thanh toán chênh lệch đổi lịch"
            desc = f"{b.ma_dat_san} • {_ten_khach(b)} • còn thiếu {_vnd(due)}"
        else:
            title = "Đơn mới chờ xác nhận"
            desc = f"{b.san.ten_san if b.san else ''} • {_ten_khach(b)} • {_vnd(due)}"
        dat_san.append(_item(
            f"p-{b.id}-{b.khach_bao_chuyen_khoan or b.ngay_tao}",
            "💬" if claimed else ("⏳" if is_balance else "📅"),
            title, desc,
            b.khach_bao_chuyen_khoan or b.ngay_tao,
            "/admin/bookings", claimed or is_balance,
        ))

    # Đơn vừa đổi lịch trong 7 ngày gần đây (đã xác nhận rồi thì chỉ là thông tin)
    week_ago = now_utc - timedelta(days=7)
    rescheduled = (
        db.query(Booking)
        .filter(
            Booking.da_doi_lich.is_(True),
            Booking.trang_thai == BookingStatus.DA_XAC_NHAN,
            Booking.ngay_doi_lich_gan_nhat >= week_ago,
        )
        .order_by(Booking.ngay_doi_lich_gan_nhat.desc())
        .limit(10)
        .all()
    )
    for b in rescheduled:
        dat_san.append(_item(
            f"r-{b.id}-{b.ngay_doi_lich_gan_nhat}",
            "🔄", "Đơn đã đổi lịch",
            f"{b.ma_dat_san} • {b.san.ten_san if b.san else ''} → {b.ngay_dat.strftime('%d/%m')} "
            f"{b.gio_bat_dau.strftime('%H:%M')}-{b.gio_ket_thuc.strftime('%H:%M')}",
            b.ngay_doi_lich_gan_nhat, "/admin/bookings", False,
        ))

    cancelled = (
        db.query(Booking)
        .filter(Booking.trang_thai == BookingStatus.HUY, Booking.ngay_huy >= week_ago)
        .order_by(Booking.ngay_huy.desc())
        .limit(15)
        .all()
    )
    for b in cancelled:
        cho_hoan = b.invoice is not None and b.invoice.trang_thai == PaymentStatus.CHO_HOAN_TIEN
        if cho_hoan:
            co_stk = bool(b.stk_hoan_tien)
            desc = (
                f"{b.ma_dat_san} • {_ten_khach(b)} • cần hoàn {_vnd(amount_paid(b) * Decimal(str(b.ty_le_hoan_tien or 0)))}"
                + ("" if co_stk else " — khách chưa gửi STK")
            )
        else:
            desc = f"{b.ma_dat_san} • {_ten_khach(b)} • không hoàn tiền"
        dat_san.append(_item(
            f"c-{b.id}-{b.ngay_huy}-{'w' if cho_hoan else 'n'}",
            "💸" if cho_hoan else "❌",
            "Đơn hủy cần hoàn tiền" if cho_hoan else "Đơn đã hủy",
            desc, b.ngay_huy, "/admin/bookings", cho_hoan,
        ))

    # ============ 2) DỊCH VỤ & CA TRỰC ============
    dich_vu: list[dict] = []

    low_stock = (
        db.query(Service)
        .filter(Service.trang_thai == ServiceStatus.HOAT_DONG, Service.ton_kho < LOW_STOCK_THRESHOLD)
        .order_by(Service.ton_kho)
        .limit(20)
        .all()
    )
    for s in low_stock:
        het = s.ton_kho <= 0
        dich_vu.append(_item(
            f"s-{s.id}-{s.ton_kho}", "📦" if not het else "🚫",
            "Dịch vụ đã hết hàng" if het else "Dịch vụ sắp hết hàng",
            f"{s.ten_dich_vu}: còn {s.ton_kho} {s.don_vi_tinh}",
            now_utc, "/admin/services", True,
        ))

    # Nhắc phân ca cho ngày mai nếu đã qua 20h tối mà chưa phân ca nào
    tomorrow = (now_vn + timedelta(days=1)).date()
    if now_vn.hour >= SHIFT_REMINDER_HOUR:
        so_ca = db.query(Shift).filter(Shift.ngay == tomorrow).count()
        if so_ca == 0:
            dich_vu.append(_item(
                f"shift-{tomorrow.isoformat()}", "🗓️", "Chưa phân ca cho ngày mai",
                f"Ngày {tomorrow.strftime('%d/%m/%Y')} chưa có ca trực nào — hãy phân ca trước khi hết ngày hôm nay.",
                now_utc, "/admin/shifts", True,
            ))

    # ============ 3) ĐÁNH GIÁ THẤP ============
    danh_gia: list[dict] = []
    if is_manager:
        bad = (
            db.query(Feedback)
            .filter(Feedback.danh_gia_tong <= 2)
            .order_by(Feedback.ngay_tao.desc())
            .limit(15)
            .all()
        )
        for f in bad:
            ten_khach = f.khach_hang.ho_ten if f.khach_hang else "Khách"
            ten_san = f.booking.san.ten_san if (f.booking and f.booking.san) else ""
            danh_gia.append(_item(
                f"f-{f.id}", "⚠️", f"Đánh giá thấp ({f.danh_gia_tong}/5)",
                f"{ten_khach} đánh giá {ten_san}" + (f" — \"{f.nhan_xet[:60]}\"" if f.nhan_xet else ""),
                f.ngay_tao, "/admin/feedbacks", True,
            ))

    for group in (dat_san, dich_vu, danh_gia):
        group.sort(key=lambda x: x["time"], reverse=True)

    return {"dat_san": dat_san, "dich_vu": dich_vu, "danh_gia": danh_gia}
