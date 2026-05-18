from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List, Optional
from datetime import date, datetime, timedelta
from app.core.database import get_db
from app.core.security import require_roles
from app.core.config import UserRole, BookingStatus, PaymentStatus
from app.models import Booking, Field, Invoice, BookingService, User

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def _date_label(d: date, nhom: str) -> str:
    if nhom == "TUAN":
        # ISO week
        y, w, _ = d.isocalendar()
        return f"{y}-W{w:02d}"
    if nhom == "THANG":
        return d.strftime("%Y-%m")
    return d.strftime("%Y-%m-%d")


def _validate_range(tu: date, den: date):
    if tu > den:
        raise HTTPException(400, "Ngày bắt đầu không được sau ngày kết thúc")


@router.get("/revenue")
def revenue_report(
    tu_ngay: date = Query(...),
    den_ngay: date = Query(...),
    nhom_theo: str = Query("NGAY", pattern="^(NGAY|TUAN|THANG)$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    _validate_range(tu_ngay, den_ngay)
    # Lấy invoices của booking hoàn thành hoặc đã thanh toán
    rows = (
        db.query(Booking, Invoice)
        .join(Invoice, Invoice.booking_id == Booking.id)
        .filter(Booking.ngay_dat >= tu_ngay, Booking.ngay_dat <= den_ngay)
        .filter(Booking.trang_thai != BookingStatus.HUY)
        .filter(Invoice.trang_thai == PaymentStatus.DA_THANH_TOAN)
        .all()
    )

    groups = {}
    tong_tien_san = 0.0
    tong_tien_dv = 0.0
    for b, inv in rows:
        label = _date_label(b.ngay_dat, nhom_theo)
        g = groups.setdefault(label, {"tien_san": 0.0, "tien_dich_vu": 0.0, "tong": 0.0})
        tsan = float(inv.tien_san)
        tdv = float(inv.tien_dich_vu)
        # Giảm giá trừ vào tiền sân
        tong = float(inv.tong_cong)
        g["tien_san"] += tsan
        g["tien_dich_vu"] += tdv
        g["tong"] += tong
        tong_tien_san += tsan
        tong_tien_dv += tdv

    chi_tiet = sorted(
        [{"label": k, **v} for k, v in groups.items()],
        key=lambda x: x["label"],
    )
    tong_dt = sum(g["tong"] for g in groups.values())
    so_ngay = (den_ngay - tu_ngay).days + 1
    return {
        "tong_doanh_thu": round(tong_dt),
        "doanh_thu_tien_san": round(tong_tien_san),
        "doanh_thu_dich_vu": round(tong_tien_dv),
        "doanh_thu_tb_ngay": round(tong_dt / so_ngay) if so_ngay else 0,
        "chi_tiet": chi_tiet,
    }


@router.get("/field-ranking")
def field_ranking(
    tu_ngay: date = Query(...),
    den_ngay: date = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    _validate_range(tu_ngay, den_ngay)
    so_ngay = (den_ngay - tu_ngay).days + 1
    # Giả định sân hoạt động 16h/ngày (6h - 22h)
    gio_hd_tong = so_ngay * 16

    fields = db.query(Field).all()
    result = []
    for f in fields:
        bookings = db.query(Booking).filter(
            Booking.san_id == f.id,
            Booking.ngay_dat >= tu_ngay,
            Booking.ngay_dat <= den_ngay,
            Booking.trang_thai.in_([BookingStatus.HOAN_THANH, BookingStatus.DA_XAC_NHAN]),
        ).all()
        tong_luot = len(bookings)
        tong_gio = sum(b.so_gio for b in bookings)
        doanh_thu = sum(
            float(b.invoice.tong_cong) for b in bookings
            if b.invoice and b.invoice.trang_thai == PaymentStatus.DA_THANH_TOAN
        )
        ty_le = round((tong_gio / gio_hd_tong * 100), 2) if gio_hd_tong else 0
        result.append({
            "san_id": f.id,
            "ten_san": f.ten_san,
            "loai_san": f.loai_san.value,
            "tong_luot_dat": tong_luot,
            "tong_gio": round(tong_gio, 1),
            "ty_le_lap_day": ty_le,
            "doanh_thu": round(doanh_thu),
        })
    # Xếp hạng theo tổng lượt đặt
    result.sort(key=lambda x: x["tong_luot_dat"], reverse=True)
    for i, r in enumerate(result):
        r["xep_hang"] = i + 1
    return result


@router.get("/peak-hours")
def peak_hours(
    tu_ngay: date = Query(...),
    den_ngay: date = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    _validate_range(tu_ngay, den_ngay)
    bookings = db.query(Booking).filter(
        Booking.ngay_dat >= tu_ngay,
        Booking.ngay_dat <= den_ngay,
        Booking.trang_thai != BookingStatus.HUY,
    ).all()

    # Đếm theo từng giờ 6-22
    hour_counts = {h: 0 for h in range(6, 22)}
    for b in bookings:
        start_h = b.gio_bat_dau.hour
        end_h = b.gio_ket_thuc.hour
        # Đếm phần phút thực tế cũng được nhưng đơn giản: count mọi giờ trùng
        if b.gio_ket_thuc.minute > 0:
            end_h += 1
        for h in range(start_h, min(end_h, 22)):
            if h in hour_counts:
                hour_counts[h] += 1

    so_san = db.query(Field).count() or 1
    so_ngay = (den_ngay - tu_ngay).days + 1
    max_per_hour = so_san * so_ngay

    chi_tiet = []
    for h, count in hour_counts.items():
        ty_le = round((count / max_per_hour * 100), 2) if max_per_hour else 0
        chi_tiet.append({
            "khung_gio": f"{h:02d}:00-{h+1:02d}:00",
            "tong_luot_dat": count,
            "ty_le_lap_day": ty_le,
        })
    top3 = sorted(chi_tiet, key=lambda x: x["tong_luot_dat"], reverse=True)[:3]
    return {
        "chi_tiet": chi_tiet,
        "top_3": top3,
    }


@router.get("/summary")
def summary_report(
    tu_ngay: date = Query(...),
    den_ngay: date = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    _validate_range(tu_ngay, den_ngay)
    so_ngay = (den_ngay - tu_ngay).days + 1

    bookings = db.query(Booking).filter(
        Booking.ngay_dat >= tu_ngay,
        Booking.ngay_dat <= den_ngay,
        Booking.trang_thai != BookingStatus.HUY,
    ).all()

    tong_luot = len(bookings)
    tong_gio = sum(b.so_gio for b in bookings)

    invoices = (
        db.query(Invoice)
        .join(Booking, Invoice.booking_id == Booking.id)
        .filter(
            Booking.ngay_dat >= tu_ngay, Booking.ngay_dat <= den_ngay,
            Invoice.trang_thai == PaymentStatus.DA_THANH_TOAN,
        )
        .all()
    )
    tong_dt = sum(float(inv.tong_cong) for inv in invoices)

    # Sân được đặt nhiều nhất
    field_counts = {}
    for b in bookings:
        field_counts[b.san_id] = field_counts.get(b.san_id, 0) + 1
    san_top = None
    if field_counts:
        top_id = max(field_counts, key=field_counts.get)
        top_f = db.query(Field).filter(Field.id == top_id).first()
        san_top = top_f.ten_san if top_f else None

    # Giờ cao điểm
    hour_counts = {h: 0 for h in range(6, 22)}
    for b in bookings:
        for h in range(b.gio_bat_dau.hour, min(b.gio_ket_thuc.hour + (1 if b.gio_ket_thuc.minute > 0 else 0), 22)):
            if h in hour_counts:
                hour_counts[h] += 1
    gio_top = None
    if any(hour_counts.values()):
        top_h = max(hour_counts, key=hour_counts.get)
        gio_top = f"{top_h:02d}:00-{top_h+1:02d}:00"

    # Tổng khách hàng (unique)
    khach_set = set()
    for b in bookings:
        if b.khach_hang_id:
            khach_set.add(b.khach_hang_id)
        elif b.sdt_khach_vang_lai:
            khach_set.add(f"vl:{b.sdt_khach_vang_lai}")

    # Tổng số lượt dùng dịch vụ
    tong_dv = sum(len(b.booking_services) for b in bookings)

    so_san = db.query(Field).count() or 1
    gio_hd_tong = so_ngay * 16 * so_san
    ty_le_lap_day = round((tong_gio / gio_hd_tong * 100), 2) if gio_hd_tong else 0

    return {
        "tong_luot_dat": tong_luot,
        "tong_doanh_thu": round(tong_dt),
        "doanh_thu_tb_ngay": round(tong_dt / so_ngay) if so_ngay else 0,
        "san_dat_nhieu_nhat": san_top,
        "khung_gio_cao_diem": gio_top,
        "tong_khach_hang": len(khach_set),
        "tong_dich_vu": tong_dv,
        "ty_le_lap_day": ty_le_lap_day,
    }
