"""
Scheduler: 
1. Quét bookings để gửi reminder 30 phút trước giờ chơi.
2. Tự động HỦY đơn 'Chờ xác nhận' quá 60 phút.
3. Tự động HOÀN THÀNH đơn 'Đã xác nhận' khi qua giờ kết thúc.

Chạy mỗi phút trong background (lifespan của FastAPI). 
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.config import BookingStatus, PaymentStatus
from app.models import Booking, User, Field, Service
from app.utils.email_service import send_email, build_reminder_email


REMINDER_MINUTES_BEFORE = 30
SCAN_INTERVAL_SECONDS = 60  # Quét mỗi 60 giây
# Cửa sổ "đáng gửi": booking nằm trong khoảng [now+25min, now+35min]
WINDOW_MINUTES = 5


async def reminder_loop():
    """Background loop: quét mỗi phút và xử lý các tác vụ tự động."""
    print("[SCHEDULER] Background tasks khởi động (Quét mail, Auto-Cancel, Auto-Complete mỗi 60s)")
    while True:
        try:
            await asyncio.sleep(SCAN_INTERVAL_SECONDS)
            scan_and_send()
            auto_clean_bookings() # Gọi thêm hàm dọn dẹp tự động
        except asyncio.CancelledError:
            print("[SCHEDULER] Reminder loop dừng")
            break
        except Exception as e:
            print(f"[SCHEDULER ERROR] {e}")


def scan_and_send():
    """Quét DB, tìm bookings cần gửi reminder, gửi từng cái."""
    db: Session = SessionLocal()
    try:
        now = datetime.now()
        target_min = now + timedelta(minutes=REMINDER_MINUTES_BEFORE - WINDOW_MINUTES)
        target_max = now + timedelta(minutes=REMINDER_MINUTES_BEFORE + WINDOW_MINUTES)

        today = now.date()
        tomorrow = today + timedelta(days=1)

        candidates = db.query(Booking).filter(
            Booking.reminder_sent == False,
            Booking.trang_thai.in_([BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN]),
            Booking.ngay_dat.in_([today, tomorrow]),
        ).all()

        for b in candidates:
            start_dt = datetime.combine(b.ngay_dat, b.gio_bat_dau)
            if not (target_min <= start_dt <= target_max):
                continue

            recipient_email = None
            recipient_name = None
            if b.khach_hang_id:
                user = db.query(User).filter(User.id == b.khach_hang_id).first()
                if user:
                    recipient_email = user.email
                    recipient_name = user.ho_ten
            else:
                recipient_email = b.email_khach_vang_lai
                recipient_name = b.ten_khach_vang_lai

            if not recipient_email:
                b.reminder_sent = True
                db.commit()
                continue

            field = db.query(Field).filter(Field.id == b.san_id).first()
            ten_san = field.ten_san if field else f"Sân #{b.san_id}"

            subject, html, text = build_reminder_email(
                ten_khach=recipient_name or "Khách",
                ma_dat_san=b.ma_dat_san,
                ten_san=ten_san,
                ngay_dat=b.ngay_dat.strftime("%d/%m/%Y"),
                gio_bat_dau=b.gio_bat_dau.strftime("%H:%M"),
                gio_ket_thuc=b.gio_ket_thuc.strftime("%H:%M"),
                tien_san=float(b.tien_san),
            )
            ok = send_email(recipient_email, subject, html, text)
            if ok:
                b.reminder_sent = True
                db.commit()
                print(f"[REMINDER] Đã gửi cho booking {b.ma_dat_san} → {recipient_email}")
    finally:
        db.close()


def auto_clean_bookings():
    """Hủy booking quá 60p không thanh toán, và Hoàn thành booking qua giờ."""
    db: Session = SessionLocal()
    try:
        now = datetime.now()
        
        # 1. AUTO-CANCEL: Hủy booking "Chờ xác nhận" đã quá 60 phút
        sixty_mins_ago = now - timedelta(minutes=60)
        expired_bookings = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.CHO_XAC_NHAN,
            Booking.ngay_tao <= sixty_mins_ago
        ).all()
        
        for b in expired_bookings:
            b.trang_thai = BookingStatus.HUY
            b.ly_do_huy = "Tự động hủy do quá 60 phút không xác nhận thanh toán."
            b.hoan_tien = False 
            
            # Hoàn lại dịch vụ (nếu có)
            for bs in b.booking_services:
                if bs.dich_vu:
                    bs.dich_vu.ton_kho += bs.so_luong
                    
            b.ghi_chu = (b.ghi_chu or "") + f"\n[AUTO-CANCEL {now.strftime('%H:%M %d/%m/%Y')}]"
            if b.invoice and b.invoice.trang_thai == PaymentStatus.CHUA_THANH_TOAN:
                b.invoice.trang_thai = PaymentStatus.DA_HUY
            print(f"[AUTO-CANCEL] Đã hủy booking {b.ma_dat_san} do quá 60p.")

        # 2. AUTO-COMPLETE: Đánh dấu "Hoàn thành" booking "Đã xác nhận" qua giờ
        past_bookings = db.query(Booking).filter(
            Booking.trang_thai == BookingStatus.DA_XAC_NHAN,
            Booking.ngay_dat <= now.date()
        ).all()
        
        for b in past_bookings:
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
    finally:
        db.close()
