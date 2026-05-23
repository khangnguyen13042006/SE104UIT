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
        # Lấy giờ UTC hiện tại (khớp với múi giờ mặc định của DB khi lưu ngay_tao)
        now_utc = datetime.utcnow()
        
        # Lấy giờ Việt Nam hiện tại (UTC+7) để so sánh với ngày đặt sân (ngay_dat)
        now_vn = now_utc + timedelta(hours=7)
        
        # --- 1. TỰ ĐỘNG HỦY: Đơn Chờ xác nhận quá 60 phút ---
        # So sánh UTC với UTC để không bị lệch 7 tiếng
        expiry_limit_utc = now_utc - timedelta(minutes=60)
        
        expired = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.CHO_XAC_NHAN,
            Booking.ngay_tao <= expiry_limit_utc
        ).all()
        
        for b in expired:
            b.trang_thai = BookingStatus.HUY
            b.ly_do_huy = u"Hệ thống tự động hủy đơn sau 60 phút chờ thanh toán."
            
            # Cập nhật tồn kho dịch vụ
            for bs in b.booking_services:
                if bs.dich_vu:
                    bs.dich_vu.ton_kho += bs.so_luong
            
            # Cập nhật trạng thái hóa đơn
            if b.invoice and b.invoice.trang_thai == PaymentStatus.CHUA_THANH_TOAN:
                b.invoice.trang_thai = PaymentStatus.HUY
            
            print(f"[AUTO-CANCEL] Đã hủy đơn: {b.ma_booking or 'N/A'}")

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
                
                print(f"[AUTO-COMPLETE] Đã hoàn thành đơn: {b.ma_booking or 'N/A'}")
                
        db.commit()
    except Exception as e:
        print(f"[AUTO-CLEAN ERROR] {e}")
        db.rollback()
    finally:
        db.close()
