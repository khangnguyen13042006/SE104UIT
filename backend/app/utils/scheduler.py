import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.config import BookingStatus, PaymentStatus, PAYMENT_WINDOW_MINUTES
from app.models import Booking, User, Field, Service
from app.utils.helpers import payment_deadline, amount_paid

SCAN_INTERVAL_SECONDS = 60 

async def reminder_loop():
    """Vòng lặp chạy ngầm quét dọn đơn hàng mỗi phút."""
    print("[SCHEDULER] Background tasks khởi động (Quét mỗi 60s)")
    while True:
        try:
            auto_clean_bookings()
            await asyncio.sleep(SCAN_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            print("[SCHEDULER] Reminder loop dừng")
            break
        except Exception as e:
            print(f"[SCHEDULER ERROR] {e}")

def cancel_expired_unpaid(db: Session, commit: bool = True) -> int:
    """Hủy các đơn CHỜ XÁC NHẬN đã quá hạn thanh toán (mặc định PAYMENT_WINDOW_MINUTES = 30 phút kể từ lúc đặt).
    Đơn chưa thanh toán nên không có khoản nào để hoàn. Trả về số đơn đã hủy."""
    now_utc = datetime.utcnow()
    pending = db.query(Booking).filter(Booking.trang_thai == BookingStatus.CHO_XAC_NHAN).all()
    count = 0
    for b in pending:
        # Không hủy đơn khách đã báo chuyển khoản (đang chờ nhân viên duyệt) hoặc đã trả một phần (chờ bù chênh lệch đổi lịch)
        if payment_deadline(b) > now_utc or b.khach_bao_chuyen_khoan or amount_paid(b) > 0:
            continue
        b.trang_thai = BookingStatus.HUY
        b.ly_do_huy = f"Hệ thống tự động hủy đơn do quá {PAYMENT_WINDOW_MINUTES} phút chưa thanh toán."
        b.hoan_tien = False
        b.ty_le_hoan_tien = 0.0
        b.ngay_huy = now_utc
        b.han_thanh_toan = None
        b.ghi_chu = (b.ghi_chu or "") + f"\n[AUTO-CANCEL {(now_utc + timedelta(hours=7)).strftime('%H:%M %d/%m/%Y')}] Quá hạn thanh toán"

        # Trả lại tồn kho dịch vụ
        for bs in b.booking_services:
            if bs.dich_vu:
                bs.dich_vu.ton_kho += bs.so_luong

        if b.invoice and b.invoice.trang_thai == PaymentStatus.CHUA_THANH_TOAN:
            b.invoice.trang_thai = PaymentStatus.HUY
        print(f"[AUTO-CANCEL] Đã hủy đơn: {b.ma_dat_san or 'N/A'}")
        count += 1
    if commit:
        db.commit()
    return count


def auto_clean_bookings():
    """Hủy đơn quá hạn và Hoàn thành đơn đã đá xong."""
    db = SessionLocal()
    try:
        # Lấy giờ UTC hiện tại (khớp với múi giờ mặc định của DB khi lưu ngay_tao)
        now_utc = datetime.utcnow()
        
        # Lấy giờ Việt Nam hiện tại (UTC+7) để so sánh với ngày đặt sân (ngay_dat)
        now_vn = now_utc + timedelta(hours=7)
        
        # --- 1. TỰ ĐỘNG HỦY: Đơn Chờ xác nhận quá hạn thanh toán (30 phút) ---
        cancel_expired_unpaid(db, commit=False)

        # --- 2. TỰ ĐỘNG HOÀN THÀNH: Đơn Đã xác nhận khi qua giờ kết thúc ---
        # So sánh dựa trên ngày đặt (ngay_dat) và giờ Việt Nam (now_vn)
        past_bookings = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.DA_XAC_NHAN,
            Booking.ngay_dat <= now_vn.date()
        ).all()
        
        for b in past_bookings:
            # Kết hợp ngày đặt và giờ kết thúc (đã lưu theo giờ VN)
            end_time_dt = datetime.combine(b.ngay_dat, b.gio_ket_thuc)
            
            if end_time_dt < now_vn:
                b.trang_thai = BookingStatus.HOAN_THANH
                
                # Hoàn lại tồn kho cho các dịch vụ cho thuê
                for bs in b.booking_services:
                    svc = db.query(Service).filter(Service.id == bs.dich_vu_id).first()
                    if svc and svc.la_cho_thue:
                        svc.ton_kho += bs.so_luong
                
                print(f"[AUTO-COMPLETE] Đã hoàn thành đơn: {b.ma_dat_san or 'N/A'}")
                
        db.commit()
    except Exception as e:
        print(f"[AUTO-CLEAN ERROR] {e}")
        db.rollback()
    finally:
        db.close()
