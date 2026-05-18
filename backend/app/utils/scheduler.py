"""
Scheduler: quét bookings để gửi reminder 30 phút trước giờ chơi.

Chạy mỗi phút trong background (lifespan của FastAPI). 
Đánh dấu reminder_sent=True sau khi gửi để không gửi lại.
"""
import asyncio
from datetime import datetime, timedelta, time as dt_time
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.config import BookingStatus
from app.models import Booking, User, Field
from app.utils.email_service import send_email, build_reminder_email


REMINDER_MINUTES_BEFORE = 30
SCAN_INTERVAL_SECONDS = 60  # Quét mỗi 60 giây
# Cửa sổ "đáng gửi": booking nằm trong khoảng [now+25min, now+35min]
WINDOW_MINUTES = 5


async def reminder_loop():
    """Background loop: quét mỗi phút và gửi reminder."""
    print("[SCHEDULER] Reminder loop khởi động (quét mỗi 60s, gửi mail 30p trước giờ chơi)")
    while True:
        try:
            await asyncio.sleep(SCAN_INTERVAL_SECONDS)
            scan_and_send()
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

        # Chỉ quét bookings ngày hôm nay và ngày mai (đủ cho window 30p)
        today = now.date()
        tomorrow = today + timedelta(days=1)

        candidates = db.query(Booking).filter(
            Booking.reminder_sent == False,
            Booking.trang_thai.in_([BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN]),
            Booking.ngay_dat.in_([today, tomorrow]),
        ).all()

        for b in candidates:
            # Ghép ngày + giờ bắt đầu thành datetime
            start_dt = datetime.combine(b.ngay_dat, b.gio_bat_dau)
            if not (target_min <= start_dt <= target_max):
                continue

            # Lấy email người nhận
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
                # Không có email → đánh dấu sent để khỏi quét lại
                b.reminder_sent = True
                db.commit()
                print(f"[REMINDER] Booking {b.ma_dat_san}: không có email, bỏ qua")
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
            else:
                # Vẫn đánh dấu để tránh spam khi SMTP fail liên tục
                # (đã có fallback console, nên ok=True hầu như luôn xảy ra)
                print(f"[REMINDER] Gửi thất bại cho {b.ma_dat_san}")
    finally:
        db.close()
