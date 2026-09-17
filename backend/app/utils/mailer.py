import os
import logging
from datetime import date, time
from decimal import Decimal
from typing import Optional, Union

import resend

logger = logging.getLogger("uvicorn.error")

resend.api_key = os.environ.get("RESEND_API_KEY")
FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")

PAYMENT_STATUS_LABEL = {
    "CHUA_THANH_TOAN": "Chưa thanh toán",
    "DA_THANH_TOAN": "Đã thanh toán",
    "CHO_HOAN_TIEN": "Chờ hoàn tiền",
    "HOAN_TIEN": "Đã hoàn tiền",
    "HUY": "Đã hủy",
}


def _send(to_email: Optional[str], subject: str, html: str) -> None:
    """Gửi email qua Resend. Không bao giờ raise — lỗi gửi mail không được làm hỏng luồng nghiệp vụ chính."""
    if not to_email:
        return
    if not resend.api_key:
        logger.warning("RESEND_API_KEY chưa được cấu hình, bỏ qua gửi email tới %s", to_email)
        return
    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": to_email,
            "subject": subject,
            "html": html,
        })
    except Exception as e:
        logger.error("Gửi email tới %s thất bại: %s", to_email, e)


def send_otp_email(to_email: str, otp: str) -> None:
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1a1a1a;">
      <h2 style="color:#10b981;">Sân Bóng UIT — Mã xác thực</h2>
      <p>Mã xác thực (OTP) của bạn là:</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 16px 0;">{otp}</div>
      <p>Mã có hiệu lực trong <strong>5 phút</strong>. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
      <p style="color:#888; font-size: 12px;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email.</p>
    </div>
    """
    _send(to_email, "Mã xác thực Sân Bóng UIT", html)


def send_booking_success_email(
    to_email: Optional[str],
    ma_dat_san: str,
    ten_san: str,
    ngay_dat: date,
    gio_bat_dau: time,
    gio_ket_thuc: time,
    tong_cong: Union[Decimal, float, int],
    trang_thai_thanh_toan: str,
) -> None:
    status_label = PAYMENT_STATUS_LABEL.get(trang_thai_thanh_toan, trang_thai_thanh_toan)
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1a1a1a;">
      <h2 style="color:#10b981;">Đặt sân thành công!</h2>
      <p>Cảm ơn bạn đã đặt sân tại <strong>Sân Bóng UIT</strong>. Dưới đây là biên nhận đơn của bạn:</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:6px 0; color:#888;">Mã đặt sân</td><td style="padding:6px 0; text-align:right; font-weight:bold;">{ma_dat_san}</td></tr>
        <tr><td style="padding:6px 0; color:#888;">Sân</td><td style="padding:6px 0; text-align:right;">{ten_san}</td></tr>
        <tr><td style="padding:6px 0; color:#888;">Ngày</td><td style="padding:6px 0; text-align:right;">{ngay_dat.strftime('%d/%m/%Y')}</td></tr>
        <tr><td style="padding:6px 0; color:#888;">Khung giờ</td><td style="padding:6px 0; text-align:right;">{gio_bat_dau.strftime('%H:%M')} - {gio_ket_thuc.strftime('%H:%M')}</td></tr>
        <tr><td style="padding:6px 0; color:#888;">Tổng tiền</td><td style="padding:6px 0; text-align:right; font-weight:bold;">{int(tong_cong):,}đ</td></tr>
        <tr><td style="padding:6px 0; color:#888;">Trạng thái</td><td style="padding:6px 0; text-align:right;">{status_label}</td></tr>
      </table>
      <p style="color:#888; font-size: 12px;">Xem chi tiết và quản lý lịch đặt tại mục "Lịch đặt của tôi" trên website.</p>
    </div>
    """
    _send(to_email, f"Biên nhận đặt sân {ma_dat_san}", html)
