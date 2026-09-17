from fastapi import APIRouter, Depends, HTTPException, Query
import os
import json
import re
import unicodedata
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date, time, datetime, timedelta
from decimal import Decimal
from google import genai
from google.genai import types

from app.core.database import get_db
from app.core.security import get_current_user, get_current_user_optional, require_roles
from app.core.config import (
    UserRole, BookingStatus, FieldStatus, ServiceStatus,
    PaymentMethod, PaymentStatus
)
from app.models import Booking, Field, User, Service, BookingService, Invoice
from app.schemas import BookingCreate, BookingCancel, BookingReschedule, BookingOut, BookingServiceOut
from app.utils.helpers import (
    generate_code, calculate_hours, calculate_field_price,
    has_booking_conflict, get_active_membership, get_discount_rate,
    is_valid_booking_time, calculate_lifetime_spend, calculate_tier_from_spend,
)
from app.utils.mailer import send_booking_success_email, send_booking_cancelled_email, send_booking_rescheduled_email

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])

gemini_client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
)


def _booking_to_out(b: Booking) -> dict:
    services_out = []
    for bs in b.booking_services:
        services_out.append({
            "id": bs.id,
            "dich_vu_id": bs.dich_vu_id,
            "so_luong": bs.so_luong,
            "don_gia": bs.don_gia,
            "thanh_tien": bs.thanh_tien,
            "ten_dich_vu": bs.dich_vu.ten_dich_vu if bs.dich_vu else None,
        })
    ten_khach = b.ten_khach_vang_lai
    sdt_khach = b.sdt_khach_vang_lai
    if b.khach_hang:
        ten_khach = b.khach_hang.ho_ten
        sdt_khach = b.khach_hang.sdt

    # Invoice-derived totals (sync với frontend khi add/remove services)
    invoice_data = None
    if b.invoice:
        invoice_data = {
            "id": b.invoice.id,
            "tien_san": b.invoice.tien_san,
            "tien_dich_vu": b.invoice.tien_dich_vu,
            "giam_gia": b.invoice.giam_gia,
            "tong_cong": b.invoice.tong_cong,
            "trang_thai": b.invoice.trang_thai,
        }

    return {
        "id": b.id,
        "ma_dat_san": b.ma_dat_san,
        "san_id": b.san_id,
        "ten_san": b.san.ten_san if b.san else None,
        "khach_hang_id": b.khach_hang_id,
        "ten_khach": ten_khach,
        "sdt_khach": sdt_khach,
        "ngay_dat": b.ngay_dat,
        "gio_bat_dau": b.gio_bat_dau,
        "gio_ket_thuc": b.gio_ket_thuc,
        "so_gio": b.so_gio,
        "tien_san": b.tien_san,
        "ghi_chu": b.ghi_chu,
        "hinh_thuc_thanh_toan": b.hinh_thuc_thanh_toan,
        "trang_thai": b.trang_thai,
        "ly_do_huy": b.ly_do_huy,
        "hoan_tien": b.hoan_tien,
        "ngay_huy": b.ngay_huy,
        "stk_hoan_tien": b.stk_hoan_tien,
        "ten_tk_hoan_tien": b.ten_tk_hoan_tien,
        "ngan_hang_hoan_tien": b.ngan_hang_hoan_tien,
        "da_doi_lich": b.da_doi_lich,
        "ngay_doi_lich_gan_nhat": b.ngay_doi_lich_gan_nhat,
        "ngay_tao": b.ngay_tao,
        "services": services_out,
        "invoice": invoice_data,
    }


@router.post("", response_model=BookingOut)
def create_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    # 1) Validate field
    field = db.query(Field).filter(Field.id == payload.san_id).first()
    if not field:
        raise HTTPException(404, "Sân không tồn tại")
    if field.trang_thai != FieldStatus.HOAT_DONG:
        raise HTTPException(400, "Sân hiện không hoạt động")

    # 2) Validate date/time
    now_vn_dt = datetime.utcnow() + timedelta(hours=7)
    today_vn = now_vn_dt.date()
    if payload.ngay_dat < today_vn:
        raise HTTPException(400, "Không thể đặt ngày trong quá khứ")
    if payload.ngay_dat == today_vn:
        if payload.gio_bat_dau <= now_vn_dt.time():
            raise HTTPException(400, "Khung giờ này đã trôi qua so với thời gian thực.")
    ok, msg = is_valid_booking_time(payload.gio_bat_dau, payload.gio_ket_thuc)
    if not ok:
        raise HTTPException(400, msg)

    # 3) Khách online phải đăng nhập; offline (NV/QL tạo) thì khách có thể vãng lai
    is_offline = current_user is not None and current_user.vai_tro in (
        UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN
    )
    if not current_user and payload.hinh_thuc_thanh_toan == PaymentMethod.TIEN_MAT:
        raise HTTPException(400, "Khách online chỉ được thanh toán chuyển khoản")
    if not current_user:
        raise HTTPException(401, "Vui lòng đăng nhập để đặt sân online")

    khach_hang_id = None
    ten_kvl = None
    sdt_kvl = None
    if is_offline:
        # Nhân viên tạo cho khách: có thể là khách vãng lai
        if not payload.ten_khach_vang_lai and not payload.sdt_khach_vang_lai:
            raise HTTPException(400, "Cần nhập tên/SĐT khách hàng")
        ten_kvl = payload.ten_khach_vang_lai
        sdt_kvl = payload.sdt_khach_vang_lai
        # Nếu SĐT match user đã đăng ký → liên kết
        if sdt_kvl:
            existing = db.query(User).filter(User.sdt == sdt_kvl).first()
            if existing:
                khach_hang_id = existing.id
                ten_kvl = None
                sdt_kvl = None
    else:
        # Khách online: bắt buộc role KHACH_HANG
        if current_user.vai_tro != UserRole.KHACH_HANG:
            raise HTTPException(400, "Sai luồng tạo booking")
        khach_hang_id = current_user.id

    # 4) Check conflict
    if has_booking_conflict(db, payload.san_id, payload.ngay_dat, payload.gio_bat_dau, payload.gio_ket_thuc):
        raise HTTPException(409, "Khung giờ này đã có người đặt, vui lòng chọn khung khác")

    # 5) Tính tiền
    so_gio = calculate_hours(payload.gio_bat_dau, payload.gio_ket_thuc)
    tien_san = calculate_field_price(field, payload.gio_bat_dau, payload.gio_ket_thuc)

    # 6) Tạo booking
    booking = Booking(
        ma_dat_san=generate_code("BK"),
        san_id=payload.san_id,
        khach_hang_id=khach_hang_id,
        ten_khach_vang_lai=ten_kvl,
        sdt_khach_vang_lai=sdt_kvl,
        ngay_dat=payload.ngay_dat,
        gio_bat_dau=payload.gio_bat_dau,
        gio_ket_thuc=payload.gio_ket_thuc,
        so_gio=so_gio,
        tien_san=tien_san,
        ghi_chu=payload.ghi_chu,
        hinh_thuc_thanh_toan=payload.hinh_thuc_thanh_toan,
        trang_thai=BookingStatus.DA_XAC_NHAN if is_offline else BookingStatus.CHO_XAC_NHAN,
        nguoi_tao_id=current_user.id if current_user else None,
    )
    db.add(booking)
    db.flush()

    # 7) Services
    tien_dich_vu = Decimal(0)
    for item in payload.services:
        svc = db.query(Service).filter(Service.id == item.dich_vu_id).first()
        if not svc:
            db.rollback()
            raise HTTPException(404, f"Không tìm thấy dịch vụ id={item.dich_vu_id}")
        if svc.trang_thai != ServiceStatus.HOAT_DONG:
            db.rollback()
            raise HTTPException(400, f"Dịch vụ '{svc.ten_dich_vu}' đã ngừng kinh doanh")
        if item.so_luong > svc.ton_kho:
            db.rollback()
            raise HTTPException(400, f"Dịch vụ '{svc.ten_dich_vu}' chỉ còn {svc.ton_kho} {svc.don_vi_tinh}")
        thanh_tien = svc.don_gia * item.so_luong
        bs = BookingService(
            booking_id=booking.id,
            dich_vu_id=svc.id,
            so_luong=item.so_luong,
            don_gia=svc.don_gia,
            thanh_tien=thanh_tien,
        )
        db.add(bs)
        # Trừ kho
        svc.ton_kho -= item.so_luong
        tien_dich_vu += thanh_tien

    # 8) Tính giảm giá kết hợp (Hạng chi tiêu tích lũy + Thẻ hội viên active)
    giam_gia = Decimal(0)
    if khach_hang_id:
        from app.utils.helpers import calculate_lifetime_spend, calculate_tier_from_spend
        spend = calculate_lifetime_spend(db, khach_hang_id)
        tier_spend = calculate_tier_from_spend(spend)
        rate_spend = get_discount_rate(tier_spend)

        active_mem = get_active_membership(db, khach_hang_id)
        rate_mem = 0.0
        if active_mem:
            tier_mem = active_mem.loai_the.value if hasattr(active_mem.loai_the, "value") else str(active_mem.loai_the)
            rate_mem = get_discount_rate(tier_mem)

        best_rate = max(rate_spend, rate_mem)
        if best_rate > 0:
            giam_gia = (tien_san * Decimal(str(best_rate))).quantize(Decimal("1"))

    tong_cong = tien_san + tien_dich_vu - giam_gia

    # 9) Tạo invoice
    invoice = Invoice(
        ma_hoa_don=generate_code("HD"),
        booking_id=booking.id,
        tien_san=tien_san,
        tien_dich_vu=tien_dich_vu,
        giam_gia=giam_gia,
        tong_cong=tong_cong,
        hinh_thuc_thanh_toan=payload.hinh_thuc_thanh_toan,
        trang_thai=PaymentStatus.CHUA_THANH_TOAN,
    )
    db.add(invoice)
    db.commit()
    db.refresh(booking)

    # Chỉ gửi mail ngay lúc tạo nếu đơn được tạo Ở TRẠNG THÁI ĐÃ XÁC NHẬN luôn (NV/QL tạo hộ khách offline,
    # và khách đó là tài khoản đã đăng ký nên mới có email). Đơn khách tự đặt online (CHO_XAC_NHAN) sẽ được
    # gửi mail sau, tại thời điểm xác nhận thật sự.
    if is_offline and booking.khach_hang:
        send_booking_success_email(
            to_email=booking.khach_hang.email,
            ma_dat_san=booking.ma_dat_san,
            ten_san=field.ten_san,
            ngay_dat=booking.ngay_dat,
            gio_bat_dau=booking.gio_bat_dau,
            gio_ket_thuc=booking.gio_ket_thuc,
            tong_cong=invoice.tong_cong,
            trang_thai_thanh_toan=invoice.trang_thai.value,
        )
    return _booking_to_out(booking)


@router.get("", response_model=List[BookingOut])
def list_bookings(
    trang_thai: Optional[BookingStatus] = None,
    san_id: Optional[int] = None,
    tu_ngay: Optional[date] = None,
    den_ngay: Optional[date] = None,
    keyword: Optional[str] = None,  # Admin/staff: search mã, tên KH, SĐT
    khach_hang_id: Optional[int] = None,  # Admin/staff: filter by customer
    da_doi_lich: Optional[bool] = None,  # Admin/staff: lọc booking đã từng đổi lịch
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Booking)
    if da_doi_lich is not None:
        q = q.filter(Booking.da_doi_lich == da_doi_lich)
    # Khách hàng chỉ xem booking của mình
    if user.vai_tro == UserRole.KHACH_HANG:
        q = q.filter(Booking.khach_hang_id == user.id)
    if trang_thai:
        q = q.filter(Booking.trang_thai == trang_thai)
    if san_id:
        q = q.filter(Booking.san_id == san_id)
    if tu_ngay:
        q = q.filter(Booking.ngay_dat >= tu_ngay)
    if den_ngay:
        q = q.filter(Booking.ngay_dat <= den_ngay)

    # Admin/staff only: search & filter by khach_hang_id
    if user.vai_tro != UserRole.KHACH_HANG:
        if khach_hang_id:
            q = q.filter(Booking.khach_hang_id == khach_hang_id)
        if keyword and keyword.strip():
            kw = f"%{keyword.strip()}%"
            # Match: mã, tên khách vãng lai, sđt vãng lai, hoặc tên/SĐT của user
            from sqlalchemy import or_
            user_matches = db.query(User.id).filter(
                or_(User.ho_ten.ilike(kw), User.sdt.ilike(kw), User.email.ilike(kw))
            ).scalar_subquery()
            q = q.filter(or_(
                Booking.ma_dat_san.ilike(kw),
                Booking.ten_khach_vang_lai.ilike(kw),
                Booking.sdt_khach_vang_lai.ilike(kw),
                Booking.email_khach_vang_lai.ilike(kw),
                Booking.khach_hang_id.in_(user_matches),
            ))

    # Với booking đã hủy hoặc đã đổi lịch: ưu tiên sắp theo thời điểm hủy/đổi lịch gần nhất
    # (hữu ích cho thông báo "vừa xảy ra" ở admin), thay vì theo ngày đá như mặc định.
    if trang_thai == BookingStatus.HUY:
        bookings = q.order_by(Booking.ngay_huy.desc(), Booking.ngay_dat.desc()).all()
    elif da_doi_lich is True:
        bookings = q.order_by(Booking.ngay_doi_lich_gan_nhat.desc(), Booking.ngay_dat.desc()).all()
    else:
        bookings = q.order_by(Booking.ngay_dat.desc(), Booking.gio_bat_dau.desc()).all()
    return [_booking_to_out(b) for b in bookings]


def _send_booking_confirmed_email(booking: Booking) -> None:
    """Gửi mail biên nhận đúng lúc booking chuyển sang ĐÃ XÁC NHẬN (không phải lúc tạo đơn)."""
    recipient = booking.khach_hang.email if booking.khach_hang else booking.email_khach_vang_lai
    send_booking_success_email(
        to_email=recipient,
        ma_dat_san=booking.ma_dat_san,
        ten_san=booking.san.ten_san if booking.san else "",
        ngay_dat=booking.ngay_dat,
        gio_bat_dau=booking.gio_bat_dau,
        gio_ket_thuc=booking.gio_ket_thuc,
        tong_cong=booking.invoice.tong_cong if booking.invoice else booking.tien_san,
        trang_thai_thanh_toan=booking.invoice.trang_thai.value if booking.invoice else PaymentStatus.CHUA_THANH_TOAN.value,
    )


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    if user.vai_tro == UserRole.KHACH_HANG and b.khach_hang_id != user.id:
        raise HTTPException(403, "Bạn không có quyền xem booking này")
    return _booking_to_out(b)

@router.post("/{booking_id}/confirm", response_model=BookingOut)
def confirm_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)),
):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    if b.trang_thai != BookingStatus.CHO_XAC_NHAN:
        raise HTTPException(400, "Chỉ có thể xác nhận đơn đang chờ")
    
    b.trang_thai = BookingStatus.DA_XAC_NHAN
    db.commit()
    db.refresh(b)
    _send_booking_confirmed_email(b)
    return _booking_to_out(b)
@router.post("/{booking_id}/cancel", response_model=BookingOut)
def cancel_booking(
    booking_id: int,
    payload: BookingCancel,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    if user.vai_tro == UserRole.KHACH_HANG and b.khach_hang_id != user.id:
        raise HTTPException(403, "Bạn không có quyền hủy booking này")
    if b.trang_thai in (BookingStatus.HUY, BookingStatus.HOAN_THANH, BookingStatus.DANG_SU_DUNG):
        raise HTTPException(400, "Booking không thể hủy ở trạng thái hiện tại")

    # Tính giờ còn lại (dùng để mặc định nếu admin/staff không chọn override)
    now = datetime.now()
    booking_dt = datetime.combine(b.ngay_dat, b.gio_bat_dau)
    hours_until = (booking_dt - now).total_seconds() / 3600

    # ROLE-BASED REFUND LOGIC:
    # - Admin/Quản lý/Nhân viên: được phép set hoan_tien=True/False thủ công (override policy)
    # - Khách hàng: KHÔNG được set; server tự tính theo policy 24h
    is_staff = user.vai_tro in (UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)
    if is_staff and payload.hoan_tien is not None:
        # Staff override quyết định
        hoan_tien = payload.hoan_tien
        refund_rate = 0.5 if hoan_tien else 0.0
        refund_note = f"[QUYẾT ĐỊNH BỞI {user.ho_ten}]"
    else:
        # Customer hoặc staff không override → áp policy 24h tự động
        if payload.hoan_tien is not None and not is_staff:
            # Customer cố tình gửi flag → ignore, không báo lỗi để giữ backward-compat
            pass
        hoan_tien = hours_until >= 24
        refund_rate = 0.5 if hoan_tien else 0.0
        refund_note = "[Tự động theo policy 24h]"

    # Nếu khách hàng tự hủy và thuộc diện hoàn tiền, bắt buộc cung cấp thông tin nhận hoàn tiền.
    # Không hoàn tiền thì bỏ qua yêu cầu này.
    if hoan_tien and user.vai_tro == UserRole.KHACH_HANG:
        if not (payload.stk_hoan_tien and payload.ten_tk_hoan_tien and payload.ngan_hang_hoan_tien):
            raise HTTPException(
                400,
                "Đơn này thuộc diện hoàn tiền — vui lòng cung cấp Số tài khoản, Tên chủ tài khoản và Ngân hàng để nhận hoàn tiền.",
            )

    b.trang_thai = BookingStatus.HUY
    b.ly_do_huy = payload.ly_do_huy
    b.hoan_tien = hoan_tien
    b.ngay_huy = datetime.utcnow()
    if hoan_tien:
        b.stk_hoan_tien = payload.stk_hoan_tien
        b.ten_tk_hoan_tien = payload.ten_tk_hoan_tien
        b.ngan_hang_hoan_tien = payload.ngan_hang_hoan_tien

    # Hoàn dịch vụ vào kho (đặc biệt cho thuê giày...)
    for bs in b.booking_services:
        if bs.dich_vu:
            bs.dich_vu.ton_kho += bs.so_luong

    # Update invoice
    if b.invoice:
        if refund_rate > 0:
            # Đặt trạng thái CHỜ HOÀN TIỀN, staff phải confirm bằng action riêng
            b.invoice.trang_thai = PaymentStatus.CHO_HOAN_TIEN
            refund_amount = (b.invoice.tong_cong * Decimal(str(refund_rate))).quantize(Decimal("1"))
            b.ghi_chu = (b.ghi_chu or "") + f"\n[Chờ hoàn {refund_amount}đ ({int(refund_rate*100)}%)] {refund_note}"
        elif not hoan_tien:
            b.ghi_chu = (b.ghi_chu or "") + f"\n[Không hoàn tiền] {refund_note}"

    db.commit()
    db.refresh(b)

    recipient = b.khach_hang.email if b.khach_hang else b.email_khach_vang_lai
    send_booking_cancelled_email(
        to_email=recipient,
        ma_dat_san=b.ma_dat_san,
        ten_san=b.san.ten_san if b.san else "",
        ngay_dat=b.ngay_dat,
        gio_bat_dau=b.gio_bat_dau,
        gio_ket_thuc=b.gio_ket_thuc,
        ly_do_huy=b.ly_do_huy,
        hoan_tien=hoan_tien,
    )
    return _booking_to_out(b)


@router.put("/{booking_id}/reschedule", response_model=BookingOut)
def reschedule_booking(
    booking_id: int,
    payload: BookingReschedule,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Đổi ngày/giờ của một booking đang chờ hoặc đã xác nhận sang một khung giờ trống khác."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    if user.vai_tro == UserRole.KHACH_HANG and b.khach_hang_id != user.id:
        raise HTTPException(403, "Bạn không có quyền đổi lịch booking này")
    if b.trang_thai not in (BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN):
        raise HTTPException(400, "Chỉ có thể đổi lịch khi đơn đang chờ xác nhận hoặc đã xác nhận")

    now_vn_dt = datetime.utcnow() + timedelta(hours=7)
    today_vn = now_vn_dt.date()
    if payload.ngay_dat < today_vn:
        raise HTTPException(400, "Không thể đổi sang ngày trong quá khứ")
    if payload.ngay_dat == today_vn and payload.gio_bat_dau <= now_vn_dt.time():
        raise HTTPException(400, "Khung giờ này đã trôi qua so với thời gian thực.")

    ok, msg = is_valid_booking_time(payload.gio_bat_dau, payload.gio_ket_thuc)
    if not ok:
        raise HTTPException(400, msg)

    if has_booking_conflict(
        db, b.san_id, payload.ngay_dat, payload.gio_bat_dau, payload.gio_ket_thuc, exclude_booking_id=b.id
    ):
        raise HTTPException(409, "Khung giờ mới đã có người đặt, vui lòng chọn khung khác")

    field = b.san
    so_gio_moi = calculate_hours(payload.gio_bat_dau, payload.gio_ket_thuc)
    tien_san_moi = calculate_field_price(field, payload.gio_bat_dau, payload.gio_ket_thuc)

    # Tính lại giảm giá (nếu có) trên tiền sân mới, theo đúng hạng hiện tại của khách
    giam_gia_moi = Decimal(0)
    if b.khach_hang_id:
        spend = calculate_lifetime_spend(db, b.khach_hang_id)
        tier_spend = calculate_tier_from_spend(spend)
        rate_spend = get_discount_rate(tier_spend)
        active_mem = get_active_membership(db, b.khach_hang_id)
        rate_mem = 0.0
        if active_mem:
            tier_mem = active_mem.loai_the.value if hasattr(active_mem.loai_the, "value") else str(active_mem.loai_the)
            rate_mem = get_discount_rate(tier_mem)
        best_rate = max(rate_spend, rate_mem)
        if best_rate > 0:
            giam_gia_moi = (tien_san_moi * Decimal(str(best_rate))).quantize(Decimal("1"))

    old_ngay_dat, old_gio_bat_dau, old_gio_ket_thuc = b.ngay_dat, b.gio_bat_dau, b.gio_ket_thuc
    old_info = f"{old_ngay_dat} {old_gio_bat_dau.strftime('%H:%M')}-{old_gio_ket_thuc.strftime('%H:%M')}"
    b.ngay_dat = payload.ngay_dat
    b.gio_bat_dau = payload.gio_bat_dau
    b.gio_ket_thuc = payload.gio_ket_thuc
    b.so_gio = so_gio_moi
    b.tien_san = tien_san_moi
    b.da_doi_lich = True
    b.ngay_doi_lich_gan_nhat = datetime.utcnow()

    note = (
        f"[ĐỔI LỊCH {datetime.now().strftime('%H:%M %d/%m')}] Từ {old_info} sang "
        f"{payload.ngay_dat} {payload.gio_bat_dau.strftime('%H:%M')}-{payload.gio_ket_thuc.strftime('%H:%M')} bởi {user.ho_ten}"
    )
    b.ghi_chu = (b.ghi_chu + "\n" + note) if b.ghi_chu else note

    if b.invoice:
        b.invoice.tien_san = tien_san_moi
        b.invoice.giam_gia = giam_gia_moi
        b.invoice.tong_cong = tien_san_moi + (b.invoice.tien_dich_vu or Decimal(0)) - giam_gia_moi

    db.commit()
    db.refresh(b)

    recipient = b.khach_hang.email if b.khach_hang else b.email_khach_vang_lai
    send_booking_rescheduled_email(
        to_email=recipient,
        ma_dat_san=b.ma_dat_san,
        ten_san=field.ten_san if field else "",
        ngay_dat_cu=old_ngay_dat,
        gio_bat_dau_cu=old_gio_bat_dau,
        gio_ket_thuc_cu=old_gio_ket_thuc,
        ngay_dat_moi=b.ngay_dat,
        gio_bat_dau_moi=b.gio_bat_dau,
        gio_ket_thuc_moi=b.gio_ket_thuc,
        tong_cong=b.invoice.tong_cong if b.invoice else b.tien_san,
    )
    return _booking_to_out(b)


@router.post("/{booking_id}/complete", response_model=BookingOut)
def complete_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)),
):
    """Đánh dấu booking hoàn thành (đã sử dụng xong). Auto-restock các đồ thuê (la_cho_thue=True)."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    if b.trang_thai in (BookingStatus.HUY, BookingStatus.HOAN_THANH):
        raise HTTPException(400, "Không thể đánh dấu hoàn thành")

    # Auto-restock: trả lại tồn kho cho đồ thuê
    restocked = []
    for bs in b.booking_services:
        svc = db.query(Service).filter(Service.id == bs.dich_vu_id).first()
        if svc and svc.la_cho_thue:
            svc.ton_kho += bs.so_luong
            restocked.append(f"{svc.ten_dich_vu} +{bs.so_luong}")

    b.trang_thai = BookingStatus.HOAN_THANH
    if restocked:
        note = f"[AUTO-RESTOCK {datetime.now().strftime('%H:%M %d/%m/%Y')}] " + ", ".join(restocked)
        b.ghi_chu = (b.ghi_chu + "\n" + note) if b.ghi_chu else note
    db.commit()
    db.refresh(b)
    return _booking_to_out(b)


@router.post("/{booking_id}/confirm-refund", response_model=BookingOut)
def confirm_refund(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)),
):
    """Staff xác nhận đã hoàn tiền cho booking đã hủy (CHO_HOAN_TIEN → HOAN_TIEN)."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    if b.trang_thai != BookingStatus.HUY:
        raise HTTPException(400, "Chỉ booking đã hủy mới có thể xác nhận hoàn tiền")
    if not b.invoice:
        raise HTTPException(400, "Booking không có hóa đơn")
    #if b.invoice.trang_thai != PaymentStatus.CHO_HOAN_TIEN:
        #raise HTTPException(400, f"Hóa đơn không ở trạng thái chờ hoàn tiền (hiện: {b.invoice.trang_thai})")

    b.invoice.trang_thai = PaymentStatus.HOAN_TIEN
    note = f"[XÁC NHẬN HOÀN TIỀN {datetime.now().strftime('%H:%M %d/%m/%Y')} bởi {user.ho_ten}]"
    b.ghi_chu = (b.ghi_chu + "\n" + note) if b.ghi_chu else note
    db.commit()
    db.refresh(b)
    return _booking_to_out(b)


# ============ GUEST BOOKING (không cần đăng nhập, dùng cho khách public) ============
from pydantic import BaseModel
from typing import List as ListType


class GuestBookingItem(BaseModel):
    dich_vu_id: int
    so_luong: int


class GuestBookingCreate(BaseModel):
    san_id: int
    ngay_dat: date
    gio_bat_dau: time
    gio_ket_thuc: time
    ten_khach: str
    sdt_khach: str
    email_khach: Optional[str] = None  # tùy chọn — để nhận reminder
    ghi_chu: Optional[str] = None
    services: ListType[GuestBookingItem] = []


@router.post("/guest", response_model=BookingOut)
def create_guest_booking(payload: GuestBookingCreate, db: Session = Depends(get_db)):
    """Khách public đặt sân (không cần login). Mặc định chuyển khoản."""
    if not payload.ten_khach.strip() or not payload.sdt_khach.strip():
        raise HTTPException(400, "Vui lòng nhập đầy đủ họ tên và SĐT")

    field = db.query(Field).filter(Field.id == payload.san_id).first()
    if not field:
        raise HTTPException(404, "Sân không tồn tại")
    if field.trang_thai != FieldStatus.HOAT_DONG:
        raise HTTPException(400, "Sân hiện không hoạt động")

    # Chuẩn hóa thời gian theo giờ Việt Nam UTC+7
    now_vn_dt = datetime.utcnow() + timedelta(hours=7)
    today_vn = now_vn_dt.date()

    if payload.ngay_dat < today_vn:
        raise HTTPException(400, "Không thể đặt ngày trong quá khứ")
    if payload.ngay_dat == today_vn:
        if payload.gio_bat_dau <= now_vn_dt.time():
            raise HTTPException(400, "Khung giờ này đã trôi qua so với thời gian thực.")

    ok, msg = is_valid_booking_time(payload.gio_bat_dau, payload.gio_ket_thuc)
    if not ok:
        raise HTTPException(400, msg)

    if has_booking_conflict(db, payload.san_id, payload.ngay_dat,
                            payload.gio_bat_dau, payload.gio_ket_thuc):
        raise HTTPException(409, "Khung giờ này đã có người đặt")

    # Liên kết user nếu SĐT match
    khach_hang_id = None
    ten_kvl = payload.ten_khach
    sdt_kvl = payload.sdt_khach
    email_kvl = (payload.email_khach or "").strip() or None
    existing = db.query(User).filter(User.sdt == payload.sdt_khach).first()
    if existing:
        khach_hang_id = existing.id
        ten_kvl = None
        sdt_kvl = None
        email_kvl = None  # dùng email của user

    so_gio = calculate_hours(payload.gio_bat_dau, payload.gio_ket_thuc)
    tien_san = calculate_field_price(field, payload.gio_bat_dau, payload.gio_ket_thuc)

    booking = Booking(
        ma_dat_san=generate_code("BK"),
        san_id=payload.san_id,
        khach_hang_id=khach_hang_id,
        ten_khach_vang_lai=ten_kvl,
        sdt_khach_vang_lai=sdt_kvl,
        email_khach_vang_lai=email_kvl,
        ngay_dat=payload.ngay_dat,
        gio_bat_dau=payload.gio_bat_dau,
        gio_ket_thuc=payload.gio_ket_thuc,
        so_gio=so_gio,
        tien_san=tien_san,
        ghi_chu=payload.ghi_chu,
        hinh_thuc_thanh_toan=PaymentMethod.CHUYEN_KHOAN,
        trang_thai=BookingStatus.CHO_XAC_NHAN,
    )
    db.add(booking)
    db.flush()

    tien_dich_vu = Decimal(0)
    for item in payload.services:
        svc = db.query(Service).filter(Service.id == item.dich_vu_id).first()
        if not svc or svc.trang_thai != ServiceStatus.HOAT_DONG:
            continue
        qty = min(item.so_luong, svc.ton_kho)
        if qty <= 0:
            continue
        thanh_tien = svc.don_gia * qty
        db.add(BookingService(
            booking_id=booking.id, dich_vu_id=svc.id,
            so_luong=qty, don_gia=svc.don_gia, thanh_tien=thanh_tien,
        ))
        svc.ton_kho -= qty
        tien_dich_vu += thanh_tien

    # Tính giảm giá kết hợp (Hạng chi tiêu tích lũy + Thẻ hội viên active)
    giam_gia = Decimal(0)
    if khach_hang_id:
        from app.utils.helpers import calculate_lifetime_spend, calculate_tier_from_spend
        spend = calculate_lifetime_spend(db, khach_hang_id)
        tier_spend = calculate_tier_from_spend(spend)
        rate_spend = get_discount_rate(tier_spend)

        active_mem = get_active_membership(db, khach_hang_id)
        rate_mem = 0.0
        if active_mem:
            tier_mem = active_mem.loai_the.value if hasattr(active_mem.loai_the, "value") else str(active_mem.loai_the)
            rate_mem = get_discount_rate(tier_mem)

        best_rate = max(rate_spend, rate_mem)
        if best_rate > 0:
            giam_gia = (tien_san * Decimal(str(best_rate))).quantize(Decimal("1"))

    tong_cong = tien_san + tien_dich_vu - giam_gia

    db.add(Invoice(
        ma_hoa_don=generate_code("HD"),
        booking_id=booking.id,
        tien_san=tien_san, tien_dich_vu=tien_dich_vu,
        giam_gia=giam_gia, tong_cong=tong_cong,
        hinh_thuc_thanh_toan=PaymentMethod.CHUYEN_KHOAN,
        trang_thai=PaymentStatus.CHUA_THANH_TOAN,
    ))
    db.commit()
    db.refresh(booking)

    # Khách vãng lai luôn tạo ở trạng thái CHỜ XÁC NHẬN — mail biên nhận sẽ gửi sau, khi đơn thực sự được xác nhận.
    return _booking_to_out(booking)


@router.get("/public/{booking_id}", response_model=BookingOut)
def get_booking_public(booking_id: int, db: Session = Depends(get_db)):
    """Xem chi tiết booking (không cần auth) - dùng cho trang QR."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    return _booking_to_out(b)


@router.post("/{booking_id}/services", response_model=BookingOut)
def add_booking_service(
    booking_id: int,
    payload: dict,  # {"dich_vu_id": int, "so_luong": int}
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)),
):
    """Staff thêm dịch vụ vào booking đang active (chưa HOAN_THANH/HUY)."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    if b.trang_thai in (BookingStatus.HOAN_THANH, BookingStatus.HUY):
        raise HTTPException(400, "Booking đã hoàn thành/hủy, không thể thêm dịch vụ")

    dich_vu_id = payload.get("dich_vu_id")
    so_luong = int(payload.get("so_luong", 1))
    if not dich_vu_id or so_luong <= 0:
        raise HTTPException(400, "Thiếu thông tin dịch vụ hoặc số lượng")

    svc = db.query(Service).filter(Service.id == dich_vu_id).first()
    if not svc:
        raise HTTPException(404, "Không tìm thấy dịch vụ")
    if svc.trang_thai != ServiceStatus.HOAT_DONG:
        raise HTTPException(400, "Dịch vụ không hoạt động")
    if svc.ton_kho < so_luong:
        raise HTTPException(400, f"Tồn kho không đủ (còn {svc.ton_kho})")

    # Nếu đã có dịch vụ này trong booking → tăng số lượng
    existing = next((bs for bs in b.booking_services if bs.dich_vu_id == dich_vu_id), None)
    thanh_tien = svc.don_gia * so_luong
    if existing:
        existing.so_luong += so_luong
        existing.thanh_tien += thanh_tien
    else:
        # Tạo object mới và gắn trực tiếp vào danh sách của Booking b
        new_item = BookingService(
            dich_vu_id=dich_vu_id,
            so_luong=so_luong,
            don_gia=svc.don_gia,
            thanh_tien=thanh_tien
        )
        b.booking_services.append(new_item)
    svc.ton_kho -= so_luong

    # Update invoice tong_cong
    if b.invoice:
        b.invoice.tien_dich_vu = (b.invoice.tien_dich_vu or Decimal(0)) + thanh_tien
        b.invoice.tong_cong = b.invoice.tien_san + b.invoice.tien_dich_vu - (b.invoice.giam_gia or Decimal(0))

    note = f"[+DV {datetime.now().strftime('%H:%M %d/%m')}] {svc.ten_dich_vu} ×{so_luong} (+{thanh_tien:.0f}đ) bởi {user.ho_ten}"
    b.ghi_chu = (b.ghi_chu + "\n" + note) if b.ghi_chu else note
    db.commit()
    db.expire(b)
    db.refresh(b)
    return _booking_to_out(b)


@router.delete("/{booking_id}/services/{bs_id}", response_model=BookingOut)
def remove_booking_service(
    booking_id: int,
    bs_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)),
):
    """Staff xóa dịch vụ khỏi booking đang active. Restock kho."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    if b.trang_thai in (BookingStatus.HOAN_THANH, BookingStatus.HUY):
        raise HTTPException(400, "Booking đã hoàn thành/hủy, không thể xóa dịch vụ")

    bs = next((x for x in b.booking_services if x.id == bs_id), None)
    if not bs:
        raise HTTPException(404, "Không tìm thấy dịch vụ trong booking")

    svc = db.query(Service).filter(Service.id == bs.dich_vu_id).first()
    refund_amount = bs.thanh_tien
    qty_back = bs.so_luong
    svc_name = svc.ten_dich_vu if svc else "?"

    # Restock vì booking chưa hoàn thành → trả lại kho
    if svc:
        svc.ton_kho += qty_back

    # Update invoice
    if b.invoice:
        b.invoice.tien_dich_vu = (b.invoice.tien_dich_vu or Decimal(0)) - refund_amount
        if b.invoice.tien_dich_vu < 0:
            b.invoice.tien_dich_vu = Decimal(0)
        b.invoice.tong_cong = b.invoice.tien_san + b.invoice.tien_dich_vu - (b.invoice.giam_gia or Decimal(0))

    db.delete(bs)
    note = f"[-DV {datetime.now().strftime('%H:%M %d/%m')}] {svc_name} ×{qty_back} (-{refund_amount:.0f}đ) bởi {user.ho_ten}"
    b.ghi_chu = (b.ghi_chu + "\n" + note) if b.ghi_chu else note
    db.commit()
    db.refresh(b)
    return _booking_to_out(b)


@router.post("/{booking_id}/claim-paid")
def claim_paid(booking_id: int, db: Session = Depends(get_db)):
    """Khách bấm 'Đã thanh toán' - ghi nhận để nhân viên xác nhận."""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    note = f"[KHÁCH BÁO ĐÃ CHUYỂN KHOẢN {datetime.now().strftime('%H:%M %d/%m/%Y')}]"
    if not b.ghi_chu or note not in b.ghi_chu:
        b.ghi_chu = (b.ghi_chu or "") + "\n" + note if b.ghi_chu else note
    db.commit()
    return {"ok": True, "message": "Đã ghi nhận, vui lòng đợi nhân viên xác nhận"}


def _normalize_text(text: str) -> str:
    """Loại bỏ dấu tiếng Việt và ký tự đặc biệt để so sánh chính xác."""
    if not text:
        return ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "D")
    text = re.sub(r"[^a-zA-Z0-9]", "", text)
    return text.upper()


@router.post("/{booking_id}/verify-receipt")
async def verify_receipt(
    booking_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Tự động xác thực hóa đơn chuyển khoản bằng AI Vision (Gemini):
    - Kiểm tra đúng Tên người thụ hưởng (SAN BONG UIT / STK 0123456789)
    - Kiểm tra đúng Số tiền thanh toán (khớp với tổng tiền đơn đặt sân)
    - Kiểm tra đúng Nội dung booking (chứa mã đặt sân BK...)
    - Nếu đúng cả 3, tự động chuyển đơn sang trạng thái ĐÃ XÁC NHẬN (DA_XAC_NHAN).
    """
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy đơn đặt sân")

    if b.trang_thai == BookingStatus.DA_XAC_NHAN:
        return {
            "success": True,
            "already_confirmed": True,
            "message": "Đơn đặt sân này đã được xác nhận trước đó.",
            "booking": _booking_to_out(b),
        }

    if b.trang_thai in (BookingStatus.HUY, BookingStatus.HOAN_THANH):
        raise HTTPException(400, f"Đơn đặt sân đang ở trạng thái '{b.trang_thai}', không thể xác thực biên lai.")

    # 1. Đọc và kiểm tra file ảnh
    contents = await file.read()
    if not contents or len(contents) < 50:
        raise HTTPException(400, "Ảnh tải lên không hợp lệ hoặc không có dữ liệu.")
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(400, "Dung lượng ảnh vượt quá 15MB.")

    content_type = file.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        content_type = "image/jpeg"

    # Lưu ảnh vào backend/uploads/receipts/
    upload_dir = os.path.join("uploads", "receipts")
    os.makedirs(upload_dir, exist_ok=True)
    raw_ext = file.filename.split(".")[-1].lower() if (file.filename and "." in file.filename) else "jpg"
    ext = raw_ext if raw_ext in ("jpg", "jpeg", "png", "webp", "heic") else "jpg"
    filename = f"receipt_{b.id}_{int(datetime.now().timestamp())}.{ext}"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(contents)
    receipt_web_url = f"/uploads/receipts/{filename}"

    # 2. Tính toán giá trị kỳ vọng của đơn đặt sân
    expected_code = b.ma_dat_san
    if b.invoice and b.invoice.tong_cong:
        expected_amount = float(b.invoice.tong_cong)
    else:
        svc_total = sum(float(bs.thanh_tien) for bs in b.booking_services)
        expected_amount = float(b.tien_san) + svc_total

    expected_acc = "0123456789"

    # 3. Phân tích ảnh qua Gemini Vision
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(500, "Hệ thống chưa thiết lập GEMINI_API_KEY để phân tích ảnh.")

    prompt = f"""Bạn là trợ lý AI chuyên đối soát hóa đơn chuyển khoản ngân hàng Việt Nam.
Hãy phân tích hình ảnh biên lai / ảnh chụp màn hình giao dịch chuyển tiền này và trích xuất thông tin giao dịch thành JSON.
YÊU CẦU:
- Trả về DUY NHẤT một chuỗi JSON hợp lệ, KHÔNG bọc mã markdown, KHÔNG viết bất kỳ lời dẫn hay giải thích nào.
- Hãy đọc kỹ: Tên người thụ hưởng/người nhận tiền, Số tài khoản người nhận, Số tiền chuyển (dạng số nguyên integer không dấu chấm phẩy), Nội dung chuyển khoản/lời nhắn/ghi chú, và Trạng thái giao dịch.

Cấu trúc JSON:
{{
  "is_bank_receipt": true,
  "is_success": true,
  "bank_name": "Tên ngân hàng chuyển hoặc nhận",
  "recipient_name": "Tên người nhận thụ hưởng",
  "recipient_account": "Số tài khoản nhận tiền nếu có",
  "transferred_amount": 150000,
  "transfer_content": "Nội dung chuyển khoản hoặc lời nhắn",
  "transaction_id": "Mã giao dịch hoặc số tham chiếu ngân hàng",
  "all_text_detected": "Toàn bộ các đoạn chữ/số quan trọng đọc được trên ảnh"
}}
"""

    candidate_models = [
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
    ]

    img_part = types.Part.from_bytes(data=contents, mime_type=content_type)
    extracted_data = None
    ai_error = None

    for model_name in candidate_models:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=[img_part, prompt],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )
            if response and response.text:
                raw = response.text.strip()
                if raw.startswith("```json"):
                    raw = raw[7:]
                if raw.startswith("```"):
                    raw = raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                extracted_data = json.loads(raw.strip())
                if extracted_data:
                    break
        except Exception as e:
            ai_error = e
            continue

    if not extracted_data:
        return {
            "success": False,
            "message": "Không thể nhận diện nội dung từ ảnh tải lên. Vui lòng đảm bảo ảnh chụp rõ nét hóa đơn chuyển khoản ngân hàng.",
            "error_detail": str(ai_error) if ai_error else "AI không phản hồi",
            "receipt_url": receipt_web_url,
        }

    # 4. Hậu kiểm 3 tiêu chí cốt lõi
    is_receipt = bool(extracted_data.get("is_bank_receipt", False))
    is_success = bool(extracted_data.get("is_success", False))
    recip_name = str(extracted_data.get("recipient_name") or "")
    recip_acc = str(extracted_data.get("recipient_account") or "")
    transferred_amt = float(extracted_data.get("transferred_amount") or 0)
    trans_content = str(extracted_data.get("transfer_content") or "")
    all_text = str(extracted_data.get("all_text_detected") or "")
    trans_id = str(extracted_data.get("transaction_id") or "")

    # Chuẩn hóa xâu ký tự
    norm_recip_name = _normalize_text(recip_name)
    norm_all_text = _normalize_text(all_text)
    norm_content = _normalize_text(trans_content)
    norm_expected_code = _normalize_text(expected_code)
    code_digits = re.sub(r"\D", "", expected_code)

    # 4.1 Tiêu chí 1: Đúng tên thụ hưởng (SAN BONG UIT) hoặc đúng STK (0123456789)
    name_ok = (
        ("SANBONGUIT" in norm_recip_name)
        or ("SANBONG" in norm_recip_name)
        or ("UIT" in norm_recip_name and "SAN" in norm_recip_name)
        or ("SANBONGUIT" in norm_all_text)
        or (expected_acc in recip_acc)
        or (expected_acc in norm_all_text)
    )

    # 4.2 Tiêu chí 2: Đúng số tiền (Cho phép chuyển lớn hơn hoặc bằng, chênh lệch tối đa 1.000đ)
    amount_ok = (transferred_amt >= (expected_amount - 1000))

    # 4.3 Tiêu chí 3: Đúng nội dung booking (Chứa mã đặt sân hoặc dãy số mã đặt sân)
    content_ok = (
        (norm_expected_code in norm_content)
        or (norm_expected_code in norm_all_text)
        or (norm_expected_code in _normalize_text(trans_id))
        or (len(code_digits) >= 5 and code_digits in norm_content)
        or (len(code_digits) >= 5 and code_digits in norm_all_text)
    )

    # Kiểm tra thêm nếu nội dung chuyển khoản có kèm số điện thoại của khách
    customer_phone = b.sdt_khach_vang_lai or (b.khach_hang.sdt if b.khach_hang else "")
    if not content_ok and customer_phone and len(customer_phone) >= 9:
        if customer_phone in trans_content or customer_phone in all_text:
            content_ok = True

    checks = {
        "is_bank_receipt": is_receipt,
        "is_success": is_success,
        "name_ok": name_ok,
        "amount_ok": amount_ok,
        "content_ok": content_ok,
    }

    details = {
        "recipient_name": recip_name,
        "recipient_account": recip_acc,
        "transferred_amount": transferred_amt,
        "expected_amount": expected_amount,
        "transfer_content": trans_content,
        "expected_code": expected_code,
        "bank_name": extracted_data.get("bank_name", ""),
    }

    if is_receipt and is_success and name_ok and amount_ok and content_ok:
        # === TỰ ĐỘNG CHUYỂN TRẠNG THÁI SANG ĐÃ XÁC NHẬN ===
        b.trang_thai = BookingStatus.DA_XAC_NHAN
        if b.invoice:
            b.invoice.trang_thai = PaymentStatus.DA_THANH_TOAN
            b.invoice.hinh_thuc_thanh_toan = PaymentMethod.CHUYEN_KHOAN

        audit = (
            f"[AI XÁC THỰC BILL TỰ ĐỘNG THÀNH CÔNG] "
            f"Số tiền: {transferred_amt:,.0f}đ (Đủ {expected_amount:,.0f}đ) | "
            f"Người nhận: '{recip_name}' | "
            f"ND: '{trans_content}' | "
            f"Ảnh: {receipt_web_url} lúc {datetime.now().strftime('%H:%M %d/%m/%Y')}"
        )
        b.ghi_chu = (b.ghi_chu + "\n" + audit) if b.ghi_chu else audit
        db.commit()
        db.refresh(b)
        _send_booking_confirmed_email(b)

        return {
            "success": True,
            "message": "Đối soát thành công! Đơn đặt sân đã được tự động kích hoạt.",
            "booking": _booking_to_out(b),
            "checks": checks,
            "details": details,
            "receipt_url": receipt_web_url,
        }
    else:
        # Tổng hợp chi tiết lý do chưa khớp
        error_reasons = []
        if not is_receipt:
            error_reasons.append("Ảnh tải lên không phải biên lai chuyển khoản ngân hàng hợp lệ.")
        elif not is_success:
            error_reasons.append("Hóa đơn chưa ở trạng thái thành công.")
        if not name_ok:
            error_reasons.append(f"Tên người nhận ({recip_name or 'Không rõ'}) không khớp chủ tài khoản 'SAN BONG UIT'.")
        if not amount_ok:
            error_reasons.append(f"Số tiền chuyển ({transferred_amt:,.0f}đ) chưa đủ số tiền cần thanh toán ({expected_amount:,.0f}đ).")
        if not content_ok:
            error_reasons.append(f"Nội dung chuyển khoản không tìm thấy mã đặt sân '{expected_code}'.")

        return {
            "success": False,
            "message": " ".join(error_reasons) if error_reasons else "Thông tin trên hóa đơn không khớp.",
            "checks": checks,
            "details": details,
            "receipt_url": receipt_web_url,
        }





@router.post("/run-auto-tasks")
def run_auto_tasks(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    """(Admin) Quét thủ công: Hủy booking quá 60p và Hoàn thành booking quá giờ."""
    now = datetime.now()
    
    # 1. AUTO-CANCEL: Hủy booking "Chờ xác nhận" đã quá 60 phút
    sixty_mins_ago = now - timedelta(minutes=60)
    expired_bookings = db.query(Booking).filter(
        Booking.trang_thai == BookingStatus.CHO_XAC_NHAN,
        Booking.ngay_tao <= sixty_mins_ago
    ).all()
    
    canceled_count = 0
    for b in expired_bookings:
        b.trang_thai = BookingStatus.HUY
        b.ly_do_huy = "Tự động hủy do quá 60 phút không xác nhận thanh toán."
        b.hoan_tien = False # Không hoàn tiền
        
        # Hoàn lại số lượng dịch vụ vào kho
        for bs in b.booking_services:
            if bs.dich_vu:
                bs.dich_vu.ton_kho += bs.so_luong
                
        # Cập nhật ghi chú
        b.ghi_chu = (b.ghi_chu or "") + f"\n[AUTO-CANCEL {now.strftime('%H:%M %d/%m/%Y')}]"
        canceled_count += 1

    # 2. AUTO-COMPLETE: Đánh dấu "Hoàn thành" booking "Đã xác nhận" đã qua thời gian kết thúc
    past_bookings = db.query(Booking).filter(
        Booking.trang_thai == BookingStatus.DA_XAC_NHAN,
        Booking.ngay_dat <= now.date()
    ).all()
    
    completed_count = 0
    for b in past_bookings:
        end_time_dt = datetime.combine(b.ngay_dat, b.gio_ket_thuc)
        if end_time_dt < now:
            b.trang_thai = BookingStatus.HOAN_THANH
            
            # Restock đồ thuê
            restocked = []
            for bs in b.booking_services:
                svc = db.query(Service).filter(Service.id == bs.dich_vu_id).first()
                if svc and svc.la_cho_thue:
                    svc.ton_kho += bs.so_luong
                    restocked.append(f"{svc.ten_dich_vu} +{bs.so_luong}")
            
            note = f"[AUTO-COMPLETE {now.strftime('%H:%M %d/%m/%Y')}]"
            if restocked:
                note += " Restock: " + ", ".join(restocked)
                
            b.ghi_chu = (b.ghi_chu or "") + "\n" + note
            completed_count += 1
            
    db.commit()
    return {
        "ok": True, 
        "canceled": canceled_count, 
        "completed": completed_count
    }
