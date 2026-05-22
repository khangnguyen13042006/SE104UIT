import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.config import BookingStatus, PaymentStatus
from app.models import Booking, User, Field, Service

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

def auto_clean_bookings():
    """Hủy đơn quá hạn và Hoàn thành đơn đã đá xong."""
    db = SessionLocal()
    try:
        # Sử dụng giờ Việt Nam (UTC+7) cho chính xác
        now = datetime.utcnow() + timedelta(hours=7)
        
        # 1. TỰ ĐỘNG HỦY: Đơn Chờ xác nhận quá 60 phút
        expiry_limit = now - timedelta(minutes=60)
        expired = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.CHO_XAC_NHAN,
            Booking.ngay_tao <= expiry_limit
        ).all()
        
        for b in expired:
            b.trang_thai = BookingStatus.HUY
            b.ly_do_huy = u"Tự động hủy do quá 60 phút không xác nhận thanh toán."
            
            # Hoàn tồn kho
            for bs in b.booking_services:
                if bs.dich_vu:
                    bs.dich_vu.ton_kho += bs.so_luong
            
            # Cập nhật trạng thái hóa đơn về HUY (đã thêm vào config)
            if b.invoice and b.invoice.trang_thai == PaymentStatus.CHUA_THANH_TOAN:
                b.invoice.trang_thai = PaymentStatus.HUY
            
            print(f"[AUTO-CANCEL] Đã hủy booking {b.ma_dat_san}")

        # 2. TỰ ĐỘNG HOÀN THÀNH: Đơn Đã xác nhận khi qua giờ kết thúc
        past_bookings = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.DA_XAC_NHAN,
            Booking.ngay_dat <= now.date()
        ).all()
        
        for b in past_bookings:
            end_time_dt = datetime.combine(b.ngay_dat, b.gio_ket_thuc)
            if end_time_dt < now:
                b.trang_thai = BookingStatus.HOAN_THANH
                
                # Restock các dịch vụ cho thuê (giày, áo...)
                for bs in b.booking_services:
                    svc = db.query(Service).filter(Service.id == bs.dich_vu_id).first()
                    if svc and svc.la_cho_thue:
                        svc.ton_kho += bs.so_luong
                
                print(f"[AUTO-COMPLETE] Đã hoàn thành booking {b.ma_dat_san}")
                
        db.commit()
    except Exception as e:
        print(f"[AUTO-CLEAN ERROR] {e}")
        db.rollback()
    finally:
        db.close()
