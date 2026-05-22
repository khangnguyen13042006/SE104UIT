from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models import Feedback, Booking
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/feedbacks", tags=["feedbacks"])

@router.get("/")
def get_feedbacks(
    min_star: Optional[int] = None,
    max_star: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Feedback)
    if min_star is not None:
        query = query.filter(Feedback.danh_gia_tong >= min_star)
    if max_star is not None:
        query = query.filter(Feedback.danh_gia_tong <= max_star)
    
    feedbacks = query.order_by(Feedback.ngay_tao.desc()).all()
    
    # Format dữ liệu trả về cho Frontend
    result = []
    for f in feedbacks:
        result.append({
            "id": f.id,
            "ten_khach": f.booking.ten_khach if f.booking else u"Khách vãng lai",
            "ten_san": f.booking.field.ten_san if f.booking and f.booking.field else u"Sân bóng",
            "danh_gia_tong": f.danh_gia_tong,
            "danh_gia_co_so": f.danh_gia_co_so,
            "danh_gia_nhan_vien": f.danh_gia_nhan_vien,
            "danh_gia_dich_vu": f.danh_gia_dich_vu,
            "nhan_xet": f.nhan_xet,
            "ngay_tao": f.ngay_tao.isoformat()
        })
    return result

@router.get("/stats")
def get_feedback_stats(db: Session = Depends(get_db)):
    feedbacks = db.query(Feedback).all()
    if not feedbacks:
        return {"tong_so": 0, "trung_binh": 0, "hai_long": 0, "canh_bao": 0}
    
    tong = len(feedbacks)
    avg = sum([f.danh_gia_tong for f in feedbacks]) / tong
    hai_long = len([f for f in feedbacks if f.danh_gia_tong >= 4])
    canh_bao = len([f for f in feedbacks if f.danh_gia_tong < 3])
    
    return {
        "tong_so": tong,
        "trung_binh": round(avg, 1),
        "hai_long": hai_long,
        "canh_bao": canh_bao
    }
