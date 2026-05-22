import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.config import BookingStatus, PaymentStatus
from app.models import Booking, User, Field, Service
from app.utils.email_service import send_email, build_reminder_email

# Cấu hình thời gian
SCAN_INTERVAL_SECONDS = 60 

async def reminder_loop():
    """Background loop: quét mỗi phút và xử lý các tác vụ tự động."""
    print("[SCHEDULER] Background tasks khởi động (Quét mỗi 60s)")
    while True:
        try:
            scan_and_send()
            auto_clean_bookings()
            await asyncio.sleep(SCAN_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            print("[SCHEDULER] Reminder loop dừng")
            break
        except Exception as e:
            print(f"[SCHEDULER ERROR] {e}")

def auto_clean_bookings():
    """Hủy booking quá 60p và Hoàn thành đơn qua giờ (Dựa trên giờ VN)"""
    db = SessionLocal()
    try:
        # Quan trọng: Đồng bộ múi giờ Việt Nam (UTC+7)
        now = datetime.utcnow() + timedelta(hours=7)
        
        # 1. AUTO-CANCEL: Đơn 'Chờ xác nhận' quá 60 phút
        expiry_limit = now - timedelta(minutes=60)
        expired = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.CHO_XAC_NHAN,
            Booking.ngay_tao <= expiry_limit
        ).all()
        
        for b in expired:
            b.trang_thai = BookingStatus.HUY # Trạng thái này CÓ trong config
            b.ly_do_huy = u"Tự động hủy do quá 60 phút không xác nhận thanh toán."
            b.hoan_tien = False 
            
            # Hoàn tồn kho dịch vụ
            for bs in b.booking_services:
                if bs.dich_vu:
                    bs.dich_vu.ton_kho += bs.so_luong
            
            # Cập nhật ghi chú
            b.ghi_chu = (b.ghi_chu or "") + f"\n[AUTO-CANCEL {now.strftime('%H:%M %d/%m/%Y')}]"
            
            # KHANG LƯU Ý: Vì config không có PaymentStatus.HUY, mình sẽ để nguyên 
            # trạng thái hóa đơn là CHUA_THANH_TOAN nhưng đơn đặt đã thành HUY.
            # Hoặc nếu Khang muốn, có thể gán cứng chuỗi text:
            if b.invoice:
                b.invoice.trang_thai = "HUY" # Gán chuỗi trực tiếp để tránh lỗi Enum
            
            print(f"[AUTO-CANCEL] Đã hủy booking {b.ma_dat_san}")

        # 2. AUTO-COMPLETE: Đơn 'Đã xác nhận' qua giờ kết thúc
        past_bookings = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.DA_XAC_NHAN,
            Booking.ngay_dat <= now.date()
        ).all()
        
        for b in past_bookings:
            end_time_dt = datetime.combine(b.ngay_dat, b.gio_ket_thuc)
            # So sánh với giờ Việt Nam hiện tại
            if end_time_dt < now:
                b.trang_thai = BookingStatus.HOAN_THANH
                
                # Restock đồ thuê
                for bs in b.booking_services:
                    svc = db.query(Service).filter(Service.id == bs.dich_vu_id).first()
                    if svc and svc.la_cho_thue:
                        svc.ton_kho += bs.so_luong
                
                b.ghi_chu = (b.ghi_chu or "") + f"\n[AUTO-COMPLETE {now.strftime('%H:%M %d/%m/%Y')}]"
                print(f"[AUTO-COMPLETE] Đã hoàn thành booking {b.ma_dat_san}.")
                
        db.commit()
    except Exception as e:
        print(f"[AUTO-CLEAN ERROR] {e}")
        db.rollback()
    finally:
        db.close()

def scan_and_send():
    """Logic gửi mail nhắc lịch (Khang giữ nguyên bản cũ của Khang)"""
    pass
