from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.core.config import UserRole, UserStatus
from app.models import Shift, User
from app.schemas import ShiftCreate, ShiftOut

router = APIRouter(prefix="/api/shifts", tags=["Shifts"])


def _shift_to_out(s: Shift) -> dict:
    return {
        "id": s.id,
        "nhan_vien_id": s.nhan_vien_id,
        "ten_nhan_vien": s.nhan_vien.ho_ten if s.nhan_vien else None,
        "ngay": s.ngay,
        "ca_truc": s.ca_truc,
        "san_phu_trach": s.san_phu_trach,
        "ghi_chu": s.ghi_chu,
    }


@router.get("", response_model=List[ShiftOut])
def list_shifts(
    tu_ngay: Optional[date] = None,
    den_ngay: Optional[date] = None,
    nhan_vien_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Shift)
    # Nhân viên chỉ xem lịch của mình
    if user.vai_tro == UserRole.NHAN_VIEN:
        q = q.filter(Shift.nhan_vien_id == user.id)
    elif nhan_vien_id:
        q = q.filter(Shift.nhan_vien_id == nhan_vien_id)
    if tu_ngay:
        q = q.filter(Shift.ngay >= tu_ngay)
    if den_ngay:
        q = q.filter(Shift.ngay <= den_ngay)
    shifts = q.order_by(Shift.ngay.desc(), Shift.ca_truc).all()
    return [_shift_to_out(s) for s in shifts]


@router.post("", response_model=ShiftOut)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    # Validate NV
    nv = db.query(User).filter(
        User.id == payload.nhan_vien_id,
        User.vai_tro == UserRole.NHAN_VIEN,
        User.trang_thai == UserStatus.HOAT_DONG,
    ).first()
    if not nv:
        raise HTTPException(400, "Nhân viên không hợp lệ")

    # Phân ca tối thiểu 24h trước
    if payload.ngay < date.today() + timedelta(days=1):
        raise HTTPException(400, "Phân ca phải lập tối thiểu 24 giờ trước")

    # Block: trùng đúng ca trong ngày (Sáng & Sáng) — không bao giờ cho phép
    exact_dup = db.query(Shift).filter(
        Shift.nhan_vien_id == payload.nhan_vien_id,
        Shift.ngay == payload.ngay,
        Shift.ca_truc == payload.ca_truc,
    ).first()
    if exact_dup:
        raise HTTPException(400, f"Nhân viên đã có ca {payload.ca_truc.value} trong ngày này")

    # Warn: đã có ca khác trong cùng ngày → cần force=True để confirm
    existing_today = db.query(Shift).filter(
        Shift.nhan_vien_id == payload.nhan_vien_id,
        Shift.ngay == payload.ngay,
    ).all()
    if existing_today and not payload.force:
        ca_list = ", ".join(s.ca_truc.value for s in existing_today)
        raise HTTPException(
            status_code=409,
            detail={
                "code": "SHIFT_OVERLAP_DAY",
                "message": f"{nv.ho_ten} đã có ca {ca_list} trong ngày {payload.ngay.strftime('%d/%m/%Y')}. Phân thêm có thể gây quá tải.",
                "existing_shifts": [{"ca_truc": s.ca_truc.value, "id": s.id} for s in existing_today],
            },
        )

    san_str = ",".join(str(i) for i in (payload.san_phu_trach or []))
    shift = Shift(
        nhan_vien_id=payload.nhan_vien_id,
        ngay=payload.ngay,
        ca_truc=payload.ca_truc,
        san_phu_trach=san_str,
        ghi_chu=payload.ghi_chu,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _shift_to_out(shift)


@router.delete("/{shift_id}")
def delete_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    s = db.query(Shift).filter(Shift.id == shift_id).first()
    if not s:
        raise HTTPException(404, "Không tìm thấy ca")
    db.delete(s)
    db.commit()
    return {"message": "Đã xoá ca trực"}
