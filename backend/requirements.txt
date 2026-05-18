"""
Email service: gửi qua SMTP nếu có credentials, fallback log console.

Cấu hình env (tạo file .env trong backend/):
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=your@gmail.com
  SMTP_PASSWORD=your-app-password
  SMTP_FROM=Sân Bóng UIT <noreply@sanbong.vn>

Nếu thiếu bất kỳ env nào → tự động fallback console.
"""
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "noreply@sanbong.vn")


def _can_smtp() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def send_email(to: str, subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
    """Gửi email. Trả về True nếu gửi thành công (hoặc đã log console)."""
    if not to or "@" not in to:
        print(f"[EMAIL] Bỏ qua, email không hợp lệ: '{to}'")
        return False

    if not _can_smtp():
        # Fallback: log ra console
        print("=" * 60)
        print(f"[EMAIL FALLBACK - CONSOLE]")
        print(f"To: {to}")
        print(f"Subject: {subject}")
        print("-" * 60)
        print(text_body or _strip_html(html_body))
        print("=" * 60)
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to

        if text_body:
            msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls(context=context)
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [to], msg.as_string())

        print(f"[EMAIL] Đã gửi tới {to}: {subject}")
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] Không gửi được tới {to}: {e}")
        # Fallback: in ra console khi SMTP fail
        print(f"[EMAIL FALLBACK]\nTo: {to}\nSubject: {subject}\n{text_body or html_body}")
        return False


def _strip_html(html: str) -> str:
    """Lược bỏ tag HTML đơn giản để hiện text plain trên console."""
    import re
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def build_reminder_email(
    ten_khach: str,
    ma_dat_san: str,
    ten_san: str,
    ngay_dat: str,
    gio_bat_dau: str,
    gio_ket_thuc: str,
    tien_san: float,
) -> tuple[str, str, str]:
    """Build email reminder. Trả về (subject, html, text)."""
    subject = f"[Sân Bóng UIT] Nhắc nhở: lịch chơi sắp bắt đầu trong 30 phút - {ma_dat_san}"

    html = f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"></head><body style="font-family:Times New Roman,serif;background:#f5f5f5;margin:0;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5">
        <div style="background:#dc2626;color:white;padding:20px 24px">
          <h1 style="margin:0;font-size:24px">⚽ Lịch sắp bắt đầu!</h1>
          <p style="margin:6px 0 0;opacity:0.9">Còn 30 phút nữa là tới giờ chơi</p>
        </div>
        <div style="padding:24px">
          <p>Xin chào <strong>{ten_khach}</strong>,</p>
          <p>Đây là email nhắc nhở rằng lịch đặt sân của bạn sắp bắt đầu. Vui lòng có mặt đúng giờ.</p>

          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px">
            <tr><td style="padding:8px 0;color:#737373">Mã đặt sân</td><td style="padding:8px 0;font-weight:bold">{ma_dat_san}</td></tr>
            <tr><td style="padding:8px 0;color:#737373">Sân</td><td style="padding:8px 0;font-weight:bold">{ten_san}</td></tr>
            <tr><td style="padding:8px 0;color:#737373">Ngày</td><td style="padding:8px 0;font-weight:bold">{ngay_dat}</td></tr>
            <tr><td style="padding:8px 0;color:#737373">Giờ chơi</td><td style="padding:8px 0;font-weight:bold;color:#dc2626">{gio_bat_dau} - {gio_ket_thuc}</td></tr>
            <tr><td style="padding:8px 0;color:#737373">Tiền sân</td><td style="padding:8px 0;font-weight:bold">{tien_san:,.0f}đ</td></tr>
          </table>

          <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:16px 0;font-size:14px">
            <strong>Lưu ý:</strong> Vui lòng đến trước 10-15 phút để chuẩn bị. Nếu bạn cần hủy, hãy liên hệ ngay với nhân viên (không hoàn tiền khi hủy trong vòng 24h).
          </div>

          <p style="margin-top:24px">Chúc bạn có buổi chơi vui vẻ!</p>
          <p style="color:#737373;font-size:13px;margin-top:24px">— Đội ngũ Sân Bóng UIT</p>
        </div>
      </div>
    </body></html>
    """

    text = f"""⚽ LỊCH SẮP BẮT ĐẦU!

Xin chào {ten_khach},

Đây là email nhắc nhở rằng lịch đặt sân của bạn sắp bắt đầu trong 30 phút.

Mã đặt sân: {ma_dat_san}
Sân: {ten_san}
Ngày: {ngay_dat}
Giờ chơi: {gio_bat_dau} - {gio_ket_thuc}
Tiền sân: {tien_san:,.0f}đ

Vui lòng có mặt đúng giờ. Đến trước 10-15 phút để chuẩn bị.

Chúc bạn có buổi chơi vui vẻ!
— Đội ngũ Sân Bóng UIT
"""
    return subject, html.strip(), text.strip()
