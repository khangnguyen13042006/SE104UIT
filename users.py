from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.core.config import UserRole, PaymentStatus, BookingStatus
from app.models import Invoice, User, Booking
from app.schemas import InvoiceOut, InvoicePayment

router = APIRouter(prefix="/api/invoices", tags=["Invoices"])


@router.get("", response_model=List[InvoiceOut])
def list_invoices(
    trang_thai: Optional[PaymentStatus] = None,
    tu_ngay: Optional[date] = None,
    den_ngay: Optional[date] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Invoice).join(Booking, Invoice.booking_id == Booking.id)
    if user.vai_tro == UserRole.KHACH_HANG:
        q = q.filter(Booking.khach_hang_id == user.id)
    if trang_thai:
        q = q.filter(Invoice.trang_thai == trang_thai)
    if tu_ngay:
        q = q.filter(Booking.ngay_dat >= tu_ngay)
    if den_ngay:
        q = q.filter(Booking.ngay_dat <= den_ngay)
    return q.order_by(Invoice.id.desc()).all()


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    if user.vai_tro == UserRole.KHACH_HANG and inv.booking.khach_hang_id != user.id:
        raise HTTPException(403, "Bạn không có quyền xem hóa đơn này")
    return inv


@router.post("/{invoice_id}/pay", response_model=InvoiceOut)
def pay_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)),
):
    """Đánh dấu hóa đơn đã thanh toán (do nhân viên xác nhận)"""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    if inv.trang_thai == PaymentStatus.DA_THANH_TOAN:
        raise HTTPException(400, "Hóa đơn đã thanh toán")
    inv.trang_thai = PaymentStatus.DA_THANH_TOAN
    # Auto-confirm booking
    if inv.booking and inv.booking.trang_thai == BookingStatus.CHO_XAC_NHAN:
        inv.booking.trang_thai = BookingStatus.DA_XAC_NHAN
    db.commit()
    db.refresh(inv)
    return inv
