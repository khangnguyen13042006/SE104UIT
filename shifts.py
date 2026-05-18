from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date, time, datetime, timedelta
from app.core.database import get_db
from app.core.security import require_roles, get_current_user_optional
from app.core.config import UserRole, FieldStatus, BookingStatus, FieldType
from app.models import Field, Booking, User
from app.schemas import FieldCreate, FieldUpdate, FieldOut

router = APIRouter(prefix="/api/fields", tags=["Fields"])


@router.get("", response_model=List[FieldOut])
def list_fields(
    trang_thai: Optional[FieldStatus] = None,
    loai_san: Optional[FieldType] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Field)
    if trang_thai:
        q = q.filter(Field.trang_thai == trang_thai)
    if loai_san:
        q = q.filter(Field.loai_san == loai_san)
    return q.order_by(Field.id).all()


@router.post("", response_model=FieldOut)
def create_field(
    payload: FieldCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    if db.query(Field).filter(Field.ten_san == payload.ten_san).first():
        raise HTTPException(400, "Tên sân đã tồn tại")
    field = Field(**payload.model_dump())
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.get("/{field_id}", response_model=FieldOut)
def get_field(field_id: int, db: Session = Depends(get_db)):
    field = db.query(Field).filter(Field.id == field_id).first()
    if not field:
        raise HTTPException(404, "Không tìm thấy sân")
    return field


@router.put("/{field_id}", response_model=FieldOut)
def update_field(
    field_id: int,
    payload: FieldUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    field = db.query(Field).filter(Field.id == field_id).first()
    if not field:
        raise HTTPException(404, "Không tìm thấy sân")

    # Quy định: sân đang có lịch đặt không được chuyển BAO_TRI
    if payload.trang_thai == FieldStatus.BAO_TRI:
        has_active = db.query(Booking).filter(
            Booking.san_id == field_id,
            Booking.ngay_dat >= date.today(),
            Booking.trang_thai.in_([BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN]),
        ).first()
        if has_active:
            raise HTTPException(400, "Sân đang có lịch đặt, không thể chuyển sang Bảo trì")

    if payload.ten_san and payload.ten_san != field.ten_san:
        if db.query(Field).filter(Field.ten_san == payload.ten_san).first():
            raise HTTPException(400, "Tên sân đã tồn tại")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(field, k, v)
    db.commit()
    db.refresh(field)
    return field


@router.get("/{field_id}/schedule")
def get_field_schedule(
    field_id: int,
    ngay: date = Query(..., description="Ngày cần xem (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """Trả về tất cả booking trong ngày cho 1 sân (cho lịch dạng lưới)"""
    field = db.query(Field).filter(Field.id == field_id).first()
    if not field:
        raise HTTPException(404, "Không tìm thấy sân")

    bookings = db.query(Booking).filter(
        Booking.san_id == field_id,
        Booking.ngay_dat == ngay,
        Booking.trang_thai != BookingStatus.HUY,
    ).all()

    slots = []
    for b in bookings:
        slots.append({
            "id": b.id,
            "gio_bat_dau": b.gio_bat_dau.strftime("%H:%M"),
            "gio_ket_thuc": b.gio_ket_thuc.strftime("%H:%M"),
            "trang_thai": b.trang_thai.value,
        })

    return {
        "san_id": field.id,
        "ten_san": field.ten_san,
        "trang_thai_san": field.trang_thai.value,
        "ngay": ngay.isoformat(),
        "bookings": slots,
    }


@router.get("/schedule/grid")
def get_schedule_grid(
    ngay: date = Query(..., description="Ngày xem lịch"),
    loai_san: Optional[FieldType] = None,
    db: Session = Depends(get_db),
):
    """Trả về lưới lịch cho tất cả sân trong ngày (giờ x sân)"""
    q = db.query(Field).filter(Field.trang_thai != FieldStatus.DONG_CUA)
    if loai_san:
        q = q.filter(Field.loai_san == loai_san)
    fields = q.order_by(Field.id).all()

    result = []
    for f in fields:
        bookings = db.query(Booking).filter(
            Booking.san_id == f.id,
            Booking.ngay_dat == ngay,
            Booking.trang_thai != BookingStatus.HUY,
        ).all()
        result.append({
            "san_id": f.id,
            "ten_san": f.ten_san,
            "loai_san": f.loai_san.value,
            "trang_thai": f.trang_thai.value,
            "gia_tieu_chuan": float(f.gia_tieu_chuan),
            "gia_cao_diem": float(f.gia_cao_diem),
            "bookings": [
                {
                    "id": b.id,
                    "gio_bat_dau": b.gio_bat_dau.strftime("%H:%M"),
                    "gio_ket_thuc": b.gio_ket_thuc.strftime("%H:%M"),
                    "trang_thai": b.trang_thai.value,
                }
                for b in bookings
            ],
        })
    return {"ngay": ngay.isoformat(), "fields": result}
