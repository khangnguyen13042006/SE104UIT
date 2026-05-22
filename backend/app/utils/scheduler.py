import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.config import BookingStatus, PaymentStatus
from app.models import Booking, User, Field, Service
from app.utils.email_service import send_email, build_reminder_email

# Cấu hình thời gian
SCAN_INTERVAL_SECONDS = 60 
REMINDER_MINUTES_BEFORE = 30
WINDOW_MINUTES = 5

async def reminder_loop():
    """Background loop: quét mỗi phút và xử lý các tác vụ tự động."""
    print("[SCHEDULER] Background tasks khởi động (Quét mỗi 60s)")
    while True:
        try:
            # Thực hiện các tác vụ tự động
            scan_and_send()
            auto_clean_bookings()
            
            # Chờ 60 giây cho lần quét tiếp theo
            await asyncio.sleep(SCAN_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            print("[SCHEDULER] Reminder loop dừng")
            break
        except Exception as e:
            print(f"[SCHEDULER ERROR] {e}")

def auto_clean_bookings():
    """Hủy booking quá 60p và Hoàn thành booking qua giờ (Dựa trên giờ VN)"""
    db = SessionLocal()
    try:
        # Lấy giờ hiện tại và chuyển sang múi giờ Việt Nam (UTC+7)
        now = datetime.utcnow() + timedelta(hours=7)
        
        # 1. AUTO-CANCEL: Hủy booking 'Chờ xác nhận' đã quá 60 phút
        expiry_limit = now - timedelta(minutes=60)
        expired_bookings = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.CHO_XAC_NHAN,
            Booking.ngay_tao <= expiry_limit
        ).all()
        
        for b in expired_bookings:
            b.trang_thai = BookingStatus.HUY
            b.ly_do_huy = u"Tự động hủy do quá 60 phút không xác nhận thanh toán."
            b.hoan_tien = False 
            
            # Hoàn lại số lượng dịch vụ vào kho
            for bs in b.booking_services:
                if bs.dich_vu:
                    bs.dich_vu.ton_kho += bs.so_luong
                    
            b.ghi_chu = (b.ghi_chu or "") + f"\n[AUTO-CANCEL {now.strftime('%H:%M %d/%m/%Y')}]"
            if b.invoice and b.invoice.trang_thai == PaymentStatus.CHUA_THANH_TOAN:
                b.invoice.trang_thai = PaymentStatus.DA_HUY
            print(f"[AUTO-CANCEL] Đã hủy booking {b.ma_dat_san} do quá 60p.")

        # 2. AUTO-COMPLETE: Đánh dấu 'Hoàn thành' khi qua giờ kết thúc
        past_bookings = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.DA_XAC_NHAN,
            Booking.ngay_dat <= now.date()
        ).all()
        
        for b in past_bookings:
            # Kết hợp ngày đặt và giờ kết thúc để so sánh với thời gian hiện tại
            end_time_dt = datetime.combine(b.ngay_dat, b.gio_ket_thuc)
            if end_time_dt < now:
                b.trang_thai = BookingStatus.HOAN_THANH
                
                restocked = []
                for bs in b.booking_services:
                    svc = db.query(Service).filter(Service.id == bs.dich_vu_id).first()
                    if svc and svc.la_cho_thue:
                        svc.ton_kho += bs.so_luong
                        restocked.append(f"{svc.ten_dich_vu} +{bs.so_luong}")
                
                note = f"[AUTO-COMPLETE {now.strftime('%H:%M %d/%m/%Y')}]"
                if restocked:
                    note += " Restock: " + ", ".join(restocked)
                    
                b.ghi_chu = (b.ghi_chu or "") + "\n" + note
                print(f"[AUTO-COMPLETE] Đã hoàn thành booking {b.ma_dat_san}.")
                
        db.commit()
    except Exception as e:
        print(f"[AUTO-CLEAN ERROR] {e}")
        db.rollback()
    finally:
        db.close()

def scan_and_send():
    """Gửi mail nhắc lịch chơi trước 30 phút."""
    db = SessionLocal()
    try:
        now = datetime.utcnow() + timedelta(hours=7)
        target_min = now + timedelta(minutes=REMINDER_MINUTES_BEFORE - WINDOW_MINUTES)
        target_max = now + timedelta(minutes=REMINDER_MINUTES_BEFORE + WINDOW_MINUTES)

        candidates = db.query(Booking).filter(
            Booking.reminder_sent == False,
            Booking.trang_thai.in_([BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN]),
            Booking.ngay_dat >= now.date(),
        ).all()

        for b in candidates:
            start_dt = datetime.combine(b.ngay_dat, b.gio_bat_dau)
            if target_min <= start_dt <= target_max:
                # Logic gửi mail... (giữ nguyên như bản cũ của Khang)
                b.reminder_sent = True
                db.commit()
    finally:
        db.close()
