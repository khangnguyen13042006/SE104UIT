"""Thông báo cho trang quản trị, gom sẵn theo 4 nhóm (đặt sân • dịch vụ • đánh giá • khác) để chuông chỉ cần gọi 1 request."""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_roles
from app.core.config import UserRole, BookingStatus, ServiceStatus, PaymentStatus, FieldStatus, UserStatus
from app.models import Booking, Service, Shift, Feedback, User, Field, SalaryPayment, SecurityEvent, ChatAuditLog
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

    # ============ 4) KHÁC: vận hành, nhân sự, bảo mật ============
    khac: list[dict] = []
    today = now_vn.date()
    ca_label = {"SANG": "sáng", "CHIEU": "chiều"}

    # Đơn sắp đá trong 60 phút tới (đã xác nhận hoặc còn chờ) — nhắc chuẩn bị sân
    soon = [
        b for b in db.query(Booking).filter(
            Booking.ngay_dat == today,
            Booking.trang_thai.in_([BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN]),
        ).all()
        if 0 <= (datetime.combine(b.ngay_dat, b.gio_bat_dau) - now_vn).total_seconds() <= 3600
    ]
    for b in soon:
        cho = b.trang_thai == BookingStatus.CHO_XAC_NHAN
        khac.append(_item(
            f"soon-{b.id}-{b.trang_thai.value}", "⏱️", "Sắp đến giờ đá",
            f"{b.san.ten_san if b.san else ''} • {b.gio_bat_dau.strftime('%H:%M')} • {_ten_khach(b)}"
            + (" — đơn CHƯA được xác nhận" if cho else ""),
            now_utc, "/admin/bookings", cho,
        ))

    # Ca trực của chính người xem (nhân viên): hôm nay / ngày mai
    if user.vai_tro == UserRole.NHAN_VIEN:
        mine = db.query(Shift).filter(
            Shift.nhan_vien_id == user.id, Shift.ngay.in_([today, today + timedelta(days=1)])
        ).order_by(Shift.ngay).all()
        for sh in mine:
            khac.append(_item(
                f"myshift-{sh.id}", "🗓️", "Ca trực của bạn " + ("hôm nay" if sh.ngay == today else "ngày mai"),
                f"Ca {ca_label.get(sh.ca_truc.value, sh.ca_truc.value)} ngày {sh.ngay.strftime('%d/%m')}",
                now_utc, "/admin/shifts", sh.ngay == today,
            ))

    # Sân đang bảo trì / đóng cửa (mọi nhân sự cần biết để tư vấn khách)
    for f in db.query(Field).filter(Field.trang_thai != FieldStatus.HOAT_DONG).all():
        khac.append(_item(
            f"field-{f.id}-{f.trang_thai.value}", "🛠️", "Sân ngừng hoạt động",
            f"{f.ten_san} đang ở trạng thái {'bảo trì' if f.trang_thai == FieldStatus.BAO_TRI else 'đóng cửa'}",
            now_utc, "/admin/fields", False,
        ))

    if is_manager:
        # Thiếu một ca (chỉ có sáng hoặc chỉ có chiều) cho ngày mai — sau giờ nhắc phân ca
        if now_vn.hour >= SHIFT_REMINDER_HOUR:
            ca_mai = {sh.ca_truc.value for sh in db.query(Shift).filter(Shift.ngay == tomorrow).all()}
            if ca_mai and len(ca_mai) < 2:
                thieu = "chiều" if "SANG" in ca_mai else "sáng"
                khac.append(_item(
                    f"missing-{tomorrow.isoformat()}-{thieu}", "⚠️", f"Ngày mai thiếu ca {thieu}",
                    f"Ngày {tomorrow.strftime('%d/%m')} mới có ca {ca_label[next(iter(ca_mai))]}, chưa phân ca {thieu}.",
                    now_utc, "/admin/shifts", True,
                ))

        # Ca 3 ngày tới chưa gán sân phụ trách; ca giao cho nhân viên đã nghỉ/tạm nghỉ
        upcoming = db.query(Shift).filter(Shift.ngay >= today, Shift.ngay <= today + timedelta(days=3)).all()
        no_field = [sh for sh in upcoming if not (sh.san_phu_trach or "").strip()]
        if no_field:
            khac.append(_item(
                f"nofield-{len(no_field)}-{today.isoformat()}", "🏟️", "Ca chưa có sân phụ trách",
                f"{len(no_field)} ca trong 3 ngày tới chưa gán sân phụ trách.",
                now_utc, "/admin/shifts", False,
            ))
        for sh in upcoming:
            nv = sh.nhan_vien
            if nv and (nv.tinh_trang_lam_viec in ("TAM_NGHI", "DA_NGHI") or nv.trang_thai == UserStatus.VO_HIEU_HOA):
                khac.append(_item(
                    f"absent-{sh.id}", "🚷", "Ca giao cho nhân viên đã nghỉ",
                    f"{nv.ho_ten} không còn làm việc nhưng có ca {ca_label.get(sh.ca_truc.value, '')} ngày {sh.ngay.strftime('%d/%m')} — cần đổi người.",
                    now_utc, "/admin/shifts", True,
                ))

        # Lương tháng trước chưa chuyển (nhân viên có ca trong tháng đó)
        prev_end = today.replace(day=1) - timedelta(days=1)
        thang = prev_end.strftime("%Y-%m")
        worked_ids = {r[0] for r in db.query(Shift.nhan_vien_id).filter(
            Shift.ngay >= prev_end.replace(day=1), Shift.ngay <= prev_end).distinct().all()}
        paid_ids = {r[0] for r in db.query(SalaryPayment.nhan_vien_id).filter(
            SalaryPayment.thang == thang, SalaryPayment.da_chuyen.is_(True)).all()}
        chua = worked_ids - paid_ids
        if chua:
            khac.append(_item(
                f"salary-{thang}-{len(chua)}", "💵", f"Chưa chuyển lương tháng {prev_end.strftime('%m/%Y')}",
                f"{len(chua)} nhân viên đã làm việc trong tháng nhưng chưa được xác nhận chuyển lương.",
                now_utc, "/admin/staff", True,
            ))

        # Tài khoản khách mới đăng ký trong 24h
        day_ago = now_utc - timedelta(days=1)
        new_users = db.query(User).filter(User.vai_tro == UserRole.KHACH_HANG, User.ngay_tao >= day_ago).count()
        if new_users:
            khac.append(_item(
                f"newusers-{new_users}-{today.isoformat()}", "👋", "Khách mới đăng ký",
                f"{new_users} tài khoản khách hàng mới trong 24 giờ qua.", now_utc, "/admin/users", False,
            ))

        # Bảo mật: đăng nhập sai / khóa tạm / lạm dụng OTP / vượt giới hạn / chatbot chặn câu độc hại (24h)
        ev = dict(db.query(SecurityEvent.loai, func.count(SecurityEvent.id)).filter(
            SecurityEvent.ngay_tao >= day_ago).group_by(SecurityEvent.loai).all())
        blocked = db.query(ChatAuditLog).filter(ChatAuditLog.loai == "BLOCKED", ChatAuditLog.ngay_tao >= day_ago).count()
        if ev.get("LOCKED"):
            khac.append(_item(f"sec-lock-{ev['LOCKED']}-{today.isoformat()}", "🔒", "Có tài khoản/IP bị khóa tạm",
                              f"{ev['LOCKED']} lần khóa do đăng nhập sai liên tiếp trong 24 giờ qua — có thể có người dò mật khẩu.",
                              now_utc, "/admin/users", True))
        if ev.get("LOGIN_FAIL", 0) >= 5:
            khac.append(_item(f"sec-fail-{ev['LOGIN_FAIL']}-{today.isoformat()}", "🛡️", "Nhiều lần đăng nhập sai",
                              f"{ev['LOGIN_FAIL']} lần đăng nhập sai trong 24 giờ qua.", now_utc, "/admin/users", False))
        abuse = ev.get("OTP_ABUSE", 0) + ev.get("RATE_LIMIT", 0)
        if abuse:
            khac.append(_item(f"sec-abuse-{abuse}-{today.isoformat()}", "🚨", "Phát hiện thao tác bất thường",
                              f"{abuse} yêu cầu bị chặn do gửi dồn dập (OTP/API) trong 24 giờ qua.", now_utc, "/admin/users", True))
        if blocked:
            khac.append(_item(f"sec-chat-{blocked}-{today.isoformat()}", "🤖", "Chatbot đã chặn câu nguy hiểm",
                              f"{blocked} tin nhắn có dấu hiệu tấn công/dò bí mật bị chặn trong 24 giờ qua.", now_utc, "/admin/users", blocked >= 3))

    for group in (dat_san, dich_vu, danh_gia, khac):
        group.sort(key=lambda x: x["time"], reverse=True)

    return {"dat_san": dat_san, "dich_vu": dich_vu, "danh_gia": danh_gia, "khac": khac}
