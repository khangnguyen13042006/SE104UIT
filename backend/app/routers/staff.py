from datetime import date, datetime, timedelta
from calendar import monthrange
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import require_roles
from app.core.config import UserRole, UserStatus, WorkStatus, DEFAULT_LUONG_CA
from app.models import User, Shift, SalaryPayment, SalaryRateChange, Booking

router = APIRouter(prefix="/api/staff", tags=["Staff"])

ADMIN_QL = (UserRole.ADMIN, UserRole.QUAN_LY)


class StaffUpdate(BaseModel):
    luong_ca: Optional[int] = Field(None, ge=0)
    tinh_trang_lam_viec: Optional[WorkStatus] = None


class SalaryConfirm(BaseModel):
    nhan_vien_id: int
    thang: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    da_chuyen: bool


def _get_staff(db: Session, staff_id: int) -> User:
    nv = db.query(User).filter(User.id == staff_id, User.vai_tro == UserRole.NHAN_VIEN).first()
    if not nv:
        raise HTTPException(404, "Không tìm thấy nhân viên")
    return nv


def _is_paid(pay: Optional[SalaryPayment], thang: str) -> bool:
    """Tháng đã qua mặc định coi là đã chuyển lương (dữ liệu quá khứ); trừ khi đã có bản ghi xác nhận tường minh."""
    if pay is not None:
        return bool(pay.da_chuyen)
    return thang < date.today().strftime("%Y-%m")


def _month_range(thang: str) -> tuple[date, date]:
    y, m = int(thang[:4]), int(thang[5:7])
    return date(y, m, 1), date(y, m, monthrange(y, m)[1])


@router.get("/salary")
def salary_summary(
    thang: Optional[str] = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN_QL)),
):
    """Danh sách nhân viên + lương tổng hợp theo tháng.
    Chỉ tính các ca đã tới ngày làm (ngay <= hôm nay); ca sắp tới đếm riêng."""
    today = date.today()
    thang = thang or today.strftime("%Y-%m")
    start, end = _month_range(thang)

    staff = db.query(User).filter(User.vai_tro == UserRole.NHAN_VIEN).order_by(User.id).all()
    shifts = db.query(Shift).filter(Shift.ngay >= start, Shift.ngay <= end).order_by(Shift.ngay).all()
    payments = {
        p.nhan_vien_id: p
        for p in db.query(SalaryPayment).filter(SalaryPayment.thang == thang).all()
    }

    all_counts: dict[int, int] = {}
    for (nv_id,) in db.query(Shift.nhan_vien_id).all():
        all_counts[nv_id] = all_counts.get(nv_id, 0) + 1

    by_staff: dict[int, list[Shift]] = {}
    for s in shifts:
        by_staff.setdefault(s.nhan_vien_id, []).append(s)

    result = []
    for u in staff:
        worked, upcoming = [], []
        for s in by_staff.get(u.id, []):
            (worked if s.ngay <= today else upcoming).append(s)
        rate = lambda s: s.luong_ca if s.luong_ca is not None else DEFAULT_LUONG_CA
        pay = payments.get(u.id)
        result.append({
            "id": u.id,
            "ho_ten": u.ho_ten,
            "email": u.email,
            "sdt": u.sdt,
            "luong_ca": u.luong_ca if u.luong_ca is not None else DEFAULT_LUONG_CA,
            "tinh_trang_lam_viec": u.tinh_trang_lam_viec or "DANG_LAM",
            "tong_so_ca": all_counts.get(u.id, 0),
            "so_ca_thang": len(worked),
            "so_ca_sap_toi": len(upcoming),
            "tong_luong": sum(rate(s) for s in worked),
            "da_chuyen": _is_paid(pay, thang),
            "ngay_chuyen": pay.ngay_chuyen if pay and pay.da_chuyen else None,
            "chi_tiet": [
                {"ngay": s.ngay, "ca_truc": s.ca_truc.value, "luong": rate(s)} for s in worked
            ],
        })
    return {"thang": thang, "nhan_vien": result}


@router.put("/{staff_id}")
def update_staff(
    staff_id: int,
    payload: StaffUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN_QL)),
):
    nv = _get_staff(db, staff_id)

    if payload.luong_ca is not None and payload.luong_ca != nv.luong_ca:
        db.add(SalaryRateChange(
            nhan_vien_id=nv.id,
            luong_cu=nv.luong_ca if nv.luong_ca is not None else DEFAULT_LUONG_CA,
            luong_moi=payload.luong_ca,
            ngay_ap_dung=date.today() + timedelta(days=1),
        ))
        nv.luong_ca = payload.luong_ca
        # Lương mới chỉ áp dụng cho các ca SAU hôm nay (đã phân trước nhưng chưa tới ngày).
        # Ca từ hôm nay trở về trước giữ nguyên mức lương đã snapshot (hoặc mặc định nếu là ca cũ).
        db.query(Shift).filter(Shift.nhan_vien_id == nv.id, Shift.ngay > date.today()).update(
            {Shift.luong_ca: payload.luong_ca}, synchronize_session=False
        )
        # Ca cũ chưa có snapshot -> chốt lại mức mặc định để không bị đổi theo lương mới
        db.query(Shift).filter(
            Shift.nhan_vien_id == nv.id, Shift.ngay <= date.today(), Shift.luong_ca.is_(None)
        ).update({Shift.luong_ca: DEFAULT_LUONG_CA}, synchronize_session=False)

    if payload.tinh_trang_lam_viec is not None:
        nv.tinh_trang_lam_viec = payload.tinh_trang_lam_viec.value
        # Chỉ nhân viên đang làm mới được đăng nhập / phân ca
        nv.trang_thai = (
            UserStatus.HOAT_DONG if payload.tinh_trang_lam_viec == WorkStatus.DANG_LAM
            else UserStatus.VO_HIEU_HOA
        )

    db.commit()
    return {"message": "Đã cập nhật nhân viên"}


@router.post("/salary/confirm")
def confirm_salary(
    payload: SalaryConfirm,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN_QL)),
):
    _get_staff(db, payload.nhan_vien_id)
    start, end = _month_range(payload.thang)
    today = date.today()
    shifts = db.query(Shift).filter(
        Shift.nhan_vien_id == payload.nhan_vien_id,
        Shift.ngay >= start, Shift.ngay <= min(end, today),
    ).all()
    total = sum(s.luong_ca if s.luong_ca is not None else DEFAULT_LUONG_CA for s in shifts)

    pay = db.query(SalaryPayment).filter(
        SalaryPayment.nhan_vien_id == payload.nhan_vien_id,
        SalaryPayment.thang == payload.thang,
    ).first()
    if not pay:
        pay = SalaryPayment(nhan_vien_id=payload.nhan_vien_id, thang=payload.thang)
        db.add(pay)
    pay.da_chuyen = payload.da_chuyen
    pay.so_tien = total if payload.da_chuyen else None
    pay.ngay_chuyen = datetime.utcnow() if payload.da_chuyen else None
    db.commit()
    return {"message": "Đã xác nhận chuyển lương" if payload.da_chuyen else "Đã bỏ xác nhận chuyển lương"}


@router.delete("/{staff_id}")
def delete_staff(
    staff_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    nv = _get_staff(db, staff_id)
    # Giữ nguyên booking do nhân viên tạo, chỉ gỡ liên kết người tạo
    db.query(Booking).filter(Booking.nguoi_tao_id == nv.id).update(
        {Booking.nguoi_tao_id: None}, synchronize_session=False
    )
    db.query(Shift).filter(Shift.nhan_vien_id == nv.id).delete(synchronize_session=False)
    db.query(SalaryPayment).filter(SalaryPayment.nhan_vien_id == nv.id).delete(synchronize_session=False)
    db.query(SalaryRateChange).filter(SalaryRateChange.nhan_vien_id == nv.id).delete(synchronize_session=False)
    db.delete(nv)
    db.commit()
    return {"message": "Đã xoá nhân viên"}


@router.get("/{staff_id}/history")
def staff_history(
    staff_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*ADMIN_QL)),
):
    """Lịch sử lương theo từng tháng (số ca, tổng lương, đã chuyển chưa) + lịch sử đổi mức lương/ca."""
    nv = _get_staff(db, staff_id)
    today = date.today()
    shifts = db.query(Shift).filter(Shift.nhan_vien_id == nv.id, Shift.ngay <= today).all()
    payments = {p.thang: p for p in db.query(SalaryPayment).filter(SalaryPayment.nhan_vien_id == nv.id).all()}

    months: dict[str, dict] = {}
    for s in shifts:
        key = s.ngay.strftime("%Y-%m")
        m = months.setdefault(key, {"thang": key, "so_ca": 0, "tong_luong": 0})
        m["so_ca"] += 1
        m["tong_luong"] += s.luong_ca if s.luong_ca is not None else DEFAULT_LUONG_CA
    for key, m in months.items():
        p = payments.get(key)
        m["da_chuyen"] = _is_paid(p, key)
        m["ngay_chuyen"] = p.ngay_chuyen if p and p.da_chuyen else None

    changes = (
        db.query(SalaryRateChange)
        .filter(SalaryRateChange.nhan_vien_id == nv.id)
        .order_by(SalaryRateChange.ngay_thay_doi.desc())
        .all()
    )
    return {
        "ho_ten": nv.ho_ten,
        "luong_hien_tai": nv.luong_ca if nv.luong_ca is not None else DEFAULT_LUONG_CA,
        "thang": sorted(months.values(), key=lambda m: m["thang"], reverse=True),
        "doi_luong": [
            {
                "luong_cu": c.luong_cu,
                "luong_moi": c.luong_moi,
                "ngay_ap_dung": c.ngay_ap_dung,
                "ngay_thay_doi": c.ngay_thay_doi,
            }
            for c in changes
        ],
    }
