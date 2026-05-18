from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.core.config import UserRole, BookingStatus
from app.models import Feedback, User, Booking
from app.schemas import FeedbackCreate, FeedbackOut

router = APIRouter(prefix="/api/feedbacks", tags=["Feedbacks"])


def _fb_to_out(f: Feedback) -> dict:
    return {
        "id": f.id,
        "booking_id": f.booking_id,
        "ma_dat_san": f.booking.ma_dat_san if f.booking else None,
        "ten_san": f.booking.san.ten_san if f.booking and f.booking.san else None,
        "ten_khach": f.khach_hang.ho_ten if f.khach_hang else (f.booking.ten_khach_vang_lai if f.booking else None),
        "danh_gia_tong": f.danh_gia_tong,
        "danh_gia_co_so": f.danh_gia_co_so,
        "danh_gia_nhan_vien": f.danh_gia_nhan_vien,
        "danh_gia_dich_vu": f.danh_gia_dich_vu,
        "nhan_xet": f.nhan_xet,
        "ngay_tao": f.ngay_tao,
    }


@router.post("", response_model=FeedbackOut)
def create_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    b = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    if not b:
        raise HTTPException(404, "Không tìm thấy booking")
    if b.khach_hang_id != user.id and user.vai_tro == UserRole.KHACH_HANG:
        raise HTTPException(403, "Bạn không phải chủ booking này")
    if b.trang_thai != BookingStatus.HOAN_THANH:
        raise HTTPException(400, "Chỉ feedback được booking đã hoàn thành")
    if b.feedback:
        raise HTTPException(400, "Booking này đã được feedback")

    fb = Feedback(
        booking_id=b.id,
        khach_hang_id=user.id if user.vai_tro == UserRole.KHACH_HANG else b.khach_hang_id,
        danh_gia_tong=payload.danh_gia_tong,
        danh_gia_co_so=payload.danh_gia_co_so,
        danh_gia_nhan_vien=payload.danh_gia_nhan_vien,
        danh_gia_dich_vu=payload.danh_gia_dich_vu,
        nhan_xet=payload.nhan_xet,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return _fb_to_out(fb)


@router.get("", response_model=List[FeedbackOut])
def list_feedbacks(
    san_id: Optional[int] = None,
    min_star: Optional[int] = Query(None, ge=1, le=5),
    max_star: Optional[int] = Query(None, ge=1, le=5),
    db: Session = Depends(get_db),
):
    """Public: ai cũng xem được feedback"""
    q = db.query(Feedback).join(Booking, Feedback.booking_id == Booking.id)
    if san_id:
        q = q.filter(Booking.san_id == san_id)
    if min_star:
        q = q.filter(Feedback.danh_gia_tong >= min_star)
    if max_star:
        q = q.filter(Feedback.danh_gia_tong <= max_star)
    feedbacks = q.order_by(Feedback.ngay_tao.desc()).all()
    return [_fb_to_out(f) for f in feedbacks]


@router.get("/stats")
def feedback_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY)),
):
    """Thống kê đánh giá trung bình"""
    feedbacks = db.query(Feedback).all()
    if not feedbacks:
        return {"tong_so": 0, "trung_binh": 0, "phan_bo": {}, "canh_bao": 0}
    total = len(feedbacks)
    avg = sum(f.danh_gia_tong for f in feedbacks) / total
    dist = {i: 0 for i in range(1, 6)}
    for f in feedbacks:
        dist[f.danh_gia_tong] += 1
    warn = sum(1 for f in feedbacks if f.danh_gia_tong < 3)
    return {
        "tong_so": total,
        "trung_binh": round(avg, 2),
        "phan_bo": dist,
        "canh_bao": warn,
    }
