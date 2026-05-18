from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date, time, datetime, timedelta
from decimal import Decimal
from app.core.database import get_db
from app.core.security import get_current_user, get_current_user_optional, require_roles
from app.core.config import (
    UserRole, BookingStatus, FieldStatus, ServiceStatus,
    PaymentMethod, PaymentStatus
)
from app.models import Booking, Field, User, Service, BookingService, Invoice
from app.schemas import BookingCreate, BookingCancel, BookingOut, BookingServiceOut
from app.utils.helpers import (
    generate_code, calculate_hours, calculate_field_price,
    has_booking_conflict, get_active_membership, get_discount_rate,
    is_valid_booking_time
)

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])


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
    if payload.ngay_dat < date.today():
        raise HTTPException(400, "Không thể đặt ngày trong quá khứ")
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

    # 8) Tính giảm giá theo tier (LIFETIME SPEND, không cần đăng ký thẻ)
    giam_gia = Decimal(0)
    if khach_hang_id:
        from app.utils.helpers import calculate_lifetime_spend, calculate_tier_from_spend
        spend = calculate_lifetime_spend(db, khach_hang_id)
        tier = calculate_tier_from_spend(spend)
        rate = get_discount_rate(tier)
        if rate > 0:
            giam_gia = (tien_san * Decimal(str(rate))).quantize(Decimal("1"))

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
    return _booking_to_out(booking)


@router.get("", response_model=List[BookingOut])
def list_bookings(
    trang_thai: Optional[BookingStatus] = None,
    san_id: Optional[int] = None,
    tu_ngay: Optional[date] = None,
    den_ngay: Optional[date] = None,
    keyword: Optional[str] = None,  # Admin/staff: search mã, tên KH, SĐT
    khach_hang_id: Optional[int] = None,  # Admin/staff: filter by customer
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Booking)
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

    bookings = q.order_by(Booking.ngay_dat.desc(), Booking.gio_bat_dau.desc()).all()
    return [_booking_to_out(b) for b in bookings]


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

    b.trang_thai = BookingStatus.HUY
    b.ly_do_huy = payload.ly_do_huy
    b.hoan_tien = hoan_tien

    # Hoàn dịch vụ vào kho (đặc biệt cho thuê giày...)
    for bs in b.booking_services:
        if bs.dich_vu:
            bs.dich_vu.ton_kho += bs.so_luong

    # Update invoice
    if b.invoice:
        if b.invoice.trang_thai == PaymentStatus.DA_THANH_TOAN and refund_rate > 0:
            # Đặt trạng thái CHỜ HOÀN TIỀN, staff phải confirm bằng action riêng
            b.invoice.trang_thai = PaymentStatus.CHO_HOAN_TIEN
            refund_amount = (b.invoice.tong_cong * Decimal(str(refund_rate))).quantize(Decimal("1"))
            b.ghi_chu = (b.ghi_chu or "") + f"\n[Chờ hoàn {refund_amount}đ ({int(refund_rate*100)}%)] {refund_note}"
        elif not hoan_tien:
            b.ghi_chu = (b.ghi_chu or "") + f"\n[Không hoàn tiền] {refund_note}"

    db.commit()
    db.refresh(b)
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
    if b.invoice.trang_thai != PaymentStatus.CHO_HOAN_TIEN:
        raise HTTPException(400, f"Hóa đơn không ở trạng thái chờ hoàn tiền (hiện: {b.invoice.trang_thai})")

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

    if payload.ngay_dat < date.today():
        raise HTTPException(400, "Không thể đặt ngày trong quá khứ")
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

    giam_gia = Decimal(0)
    if khach_hang_id:
        from app.utils.helpers import calculate_lifetime_spend, calculate_tier_from_spend
        spend = calculate_lifetime_spend(db, khach_hang_id)
        tier = calculate_tier_from_spend(spend)
        rate = get_discount_rate(tier)
        if rate > 0:
            giam_gia = (tien_san * Decimal(str(rate))).quantize(Decimal("1"))

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
        db.add(BookingService(
            booking_id=b.id, dich_vu_id=dich_vu_id,
            so_luong=so_luong, don_gia=svc.don_gia, thanh_tien=thanh_tien,
        ))
    svc.ton_kho -= so_luong

    # Update invoice tong_cong
    if b.invoice:
        b.invoice.tien_dich_vu = (b.invoice.tien_dich_vu or Decimal(0)) + thanh_tien
        b.invoice.tong_cong = b.invoice.tien_san + b.invoice.tien_dich_vu - (b.invoice.giam_gia or Decimal(0))

    note = f"[+DV {datetime.now().strftime('%H:%M %d/%m')}] {svc.ten_dich_vu} ×{so_luong} (+{thanh_tien:.0f}đ) bởi {user.ho_ten}"
    b.ghi_chu = (b.ghi_chu + "\n" + note) if b.ghi_chu else note
    db.commit()
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


@router.post("/{booking_id}/send-reminder-now")
def send_reminder_now(
    booking_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)),
):
    """Admin/NV gửi reminder ngay (không đợi 30 phút trước). Hữu ích để test."""
    from app.utils.email_service import send_email, build_reminder_email

    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")

    if b.khach_hang_id:
        user = db.query(User).filter(User.id == b.khach_hang_id).first()
        recipient_email = user.email if user else None
        recipient_name = user.ho_ten if user else "Khách"
    else:
        recipient_email = b.email_khach_vang_lai
        recipient_name = b.ten_khach_vang_lai

    if not recipient_email:
        raise HTTPException(400, "Booking này không có email người nhận")

    field = db.query(Field).filter(Field.id == b.san_id).first()
    subject, html, text = build_reminder_email(
        ten_khach=recipient_name or "Khách",
        ma_dat_san=b.ma_dat_san,
        ten_san=field.ten_san if field else "—",
        ngay_dat=b.ngay_dat.strftime("%d/%m/%Y"),
        gio_bat_dau=b.gio_bat_dau.strftime("%H:%M"),
        gio_ket_thuc=b.gio_ket_thuc.strftime("%H:%M"),
        tien_san=float(b.tien_san),
    )
    ok = send_email(recipient_email, subject, html, text)
    b.reminder_sent = True
    db.commit()
    return {"ok": ok, "to": recipient_email}
