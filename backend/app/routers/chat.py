import os
import json
from datetime import date, datetime, timedelta, time
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from google import genai
from google.genai import types

from app.core.database import get_db
from app.core.security import get_current_user_optional, require_roles
from app.core.config import FieldStatus, ServiceStatus, BookingStatus, UserRole, MEMBERSHIP_NAME, FieldType
from app.models import Field, Booking, Service, User, Feedback
from app.utils.helpers import (
    has_booking_conflict, get_active_membership, get_discount_rate,
    calculate_lifetime_spend, calculate_tier_from_spend,
)

router = APIRouter(prefix="/api/chat", tags=["Chatbot"])

client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
)

class ChatMessage(BaseModel):
    sender: str
    text: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None


def validate_and_sanitize_booking_action(
    db: Session,
    action: Optional[dict],
    today: date,
    now_vn_time: time
) -> Optional[dict]:
    """Hậu kiểm tra và làm sạch booking_action do AI sinh ra để đảm bảo 100% khả dụng"""
    if not isinstance(action, dict):
        return None

    field_id = action.get("field_id")
    date_str = action.get("date")
    time_str = action.get("time")
    duration = action.get("duration", 1.5)

    # 1. Kiểm tra ngày
    try:
        if not date_str or not isinstance(date_str, str):
            return None
        target_date = datetime.strptime(date_str.strip(), "%Y-%m-%d").date()
        if target_date < today:
            return None
    except Exception:
        return None

    # 2. Kiểm tra giờ và làm tròn theo bước 15 phút
    try:
        if not time_str or not isinstance(time_str, str):
            return None
        parts = time_str.strip().split(":")
        th = int(parts[0])
        tm = int(parts[1]) if len(parts) > 1 else 0

        tm = round(tm / 15.0) * 15
        if tm == 60:
            th += 1
            tm = 0

        if th < 6:
            th = 6
            tm = 0
        elif th > 22:
            th = 22
            tm = 0

        start_time = time(th, tm)
    except Exception:
        return None

    # 3. Chuẩn hóa duration trong các mốc hệ thống hỗ trợ
    try:
        duration = float(duration)
        valid_durations = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
        if duration not in valid_durations:
            duration = min(valid_durations, key=lambda x: abs(x - duration))
    except Exception:
        duration = 1.5

    # Đảm bảo ca không vượt quá 23:00 (giờ đóng cửa)
    total_start_min = start_time.hour * 60 + start_time.minute
    total_end_min = total_start_min + int(duration * 60)
    if total_end_min > 23 * 60:
        total_end_min = 23 * 60
        duration = (total_end_min - total_start_min) / 60.0
        if duration < 0.5:
            return None

    end_time = time(total_end_min // 60, total_end_min % 60)

    # 4. Kiểm tra giờ trong quá khứ nếu là hôm nay
    if target_date == today and start_time <= now_vn_time:
        return None

    # 5. Xác định sân
    field = None
    if field_id is not None:
        field = db.query(Field).filter(
            Field.id == field_id,
            Field.trang_thai == FieldStatus.HOAT_DONG
        ).first()

    field_name = action.get("field_name", "")
    if not field and field_name:
        field = db.query(Field).filter(
            Field.ten_san.ilike(f"%{field_name}%"),
            Field.trang_thai == FieldStatus.HOAT_DONG
        ).first()

    if not field:
        field = db.query(Field).filter(Field.trang_thai == FieldStatus.HOAT_DONG).first()
        if not field:
            return None

    # 6. Kiểm tra xung đột lịch thực tế với DB
    if has_booking_conflict(db, field.id, target_date, start_time, end_time):
        # Tự động tìm sân cùng loại còn trống để thay thế
        alt_fields = db.query(Field).filter(
            Field.loai_san == field.loai_san,
            Field.id != field.id,
            Field.trang_thai == FieldStatus.HOAT_DONG
        ).all()
        found_alt = False
        for alt in alt_fields:
            if not has_booking_conflict(db, alt.id, target_date, start_time, end_time):
                field = alt
                found_alt = True
                break
        if not found_alt:
            return None

    return {
        "field_id": field.id,
        "field_name": field.ten_san,
        "date": target_date.strftime("%Y-%m-%d"),
        "time": start_time.strftime("%H:%M"),
        "duration": duration,
    }


def build_shared_context(db: Session, today: date) -> dict:
    """Dữ liệu dùng chung cho cả chat khách hàng và chat nội bộ: sân (kèm đánh giá), dịch vụ, lịch bận 3 ngày tới."""
    fields = db.query(Field).filter(Field.trang_thai == FieldStatus.HOAT_DONG).all()

    # 1 query gộp cho đánh giá của TẤT CẢ sân, thay vì 1 query riêng mỗi sân (N+1) — giảm độ trễ chatbot.
    rating_rows = (
        db.query(
            Booking.san_id,
            func.count(Feedback.id).label("cnt"),
            func.avg(Feedback.danh_gia_tong).label("avg_rating"),
        )
        .join(Booking, Feedback.booking_id == Booking.id)
        .group_by(Booking.san_id)
        .all()
    )
    rating_map = {r.san_id: (r.cnt, float(r.avg_rating or 0)) for r in rating_rows}

    fields_data = []
    for f in fields:
        cnt, avg_rating = rating_map.get(f.id, (0, 0.0))
        rating_text = f"Đánh giá TB: {round(avg_rating, 2)}/5 ({cnt} lượt)" if cnt > 0 else "Chưa có đánh giá"
        fields_data.append(
            f"- Sân ID {f.id}: {f.ten_san} | Loại: {f.loai_san.value} ({f.suc_chua} người) | "
            f"Giá thường: {int(f.gia_tieu_chuan):,}đ/h | Cao điểm: {int(f.gia_cao_diem):,}đ/h | "
            f"{rating_text} | Mô tả: {f.mo_ta or 'Không có'}"
        )

    services = db.query(Service).filter(Service.trang_thai == ServiceStatus.HOAT_DONG).all()
    services_data = [
        f"- {s.ten_dich_vu}: {int(s.don_gia):,}đ/{s.don_vi_tinh} (Còn kho: {s.ton_kho})"
        for s in services
    ]

    end_date = today + timedelta(days=3)
    busy_bookings = (
        db.query(Booking)
        .filter(
            Booking.trang_thai.in_([
                BookingStatus.CHO_XAC_NHAN,
                BookingStatus.DA_XAC_NHAN,
                BookingStatus.DANG_SU_DUNG
            ]),
            Booking.ngay_dat >= today,
            Booking.ngay_dat <= end_date,
        )
        .all()
    )
    busy_data = [
        f"- Ngày {b.ngay_dat}: Sân ID {b.san_id} ('{b.san.ten_san if b.san else ''}') bận từ {b.gio_bat_dau.strftime('%H:%M')} đến {b.gio_ket_thuc.strftime('%H:%M')}"
        for b in busy_bookings
    ]

    return {
        "fields": fields,
        "fields_data": fields_data,
        "services": services,
        "services_data": services_data,
        "busy_data": busy_data,
    }


def validate_add_service_action(db: Session, action: Optional[dict]) -> Optional[dict]:
    """Hậu kiểm đề xuất 'thêm dịch vụ vào bill' do AI sinh ra trước khi FE gọi API thật."""
    if not isinstance(action, dict):
        return None

    ma_dat_san = str(action.get("ma_dat_san") or "").strip().upper()
    if not ma_dat_san:
        return None

    booking = db.query(Booking).filter(Booking.ma_dat_san == ma_dat_san).first()
    if not booking or booking.trang_thai in (BookingStatus.HUY, BookingStatus.HOAN_THANH):
        return None

    dich_vu_id = action.get("dich_vu_id")
    dich_vu_ten = str(action.get("dich_vu_ten") or "").strip()

    svc = None
    if dich_vu_id is not None:
        svc = db.query(Service).filter(
            Service.id == dich_vu_id, Service.trang_thai == ServiceStatus.HOAT_DONG
        ).first()
    if not svc and dich_vu_ten:
        svc = db.query(Service).filter(
            Service.ten_dich_vu.ilike(f"%{dich_vu_ten}%"), Service.trang_thai == ServiceStatus.HOAT_DONG
        ).first()
    if not svc:
        return None

    try:
        so_luong = int(action.get("so_luong", 1))
    except (TypeError, ValueError):
        so_luong = 1
    if so_luong <= 0 or svc.ton_kho < so_luong:
        return None

    return {
        "booking_id": booking.id,
        "ma_dat_san": booking.ma_dat_san,
        "dich_vu_id": svc.id,
        "dich_vu_ten": svc.ten_dich_vu,
        "don_gia": float(svc.don_gia),
        "so_luong": so_luong,
    }


def validate_create_service_action(action: Optional[dict]) -> Optional[dict]:
    """Hậu kiểm đề xuất 'tạo dịch vụ mới' do AI sinh ra trước khi FE gọi API thật."""
    if not isinstance(action, dict):
        return None

    ten = str(action.get("ten_dich_vu") or "").strip()
    if not ten:
        return None

    try:
        don_gia = float(action.get("don_gia", 0))
    except (TypeError, ValueError):
        don_gia = 0
    if don_gia < 0:
        return None

    don_vi_tinh = str(action.get("don_vi_tinh") or "Cái").strip() or "Cái"

    try:
        ton_kho = int(action.get("ton_kho", 0))
    except (TypeError, ValueError):
        ton_kho = 0
    if ton_kho < 0:
        ton_kho = 0

    return {
        "ten_dich_vu": ten,
        "don_gia": don_gia,
        "don_vi_tinh": don_vi_tinh,
        "ton_kho": ton_kho,
        "la_cho_thue": bool(action.get("la_cho_thue", False)),
    }


def validate_confirm_booking_action(db: Session, action: Optional[dict]) -> Optional[dict]:
    """Hậu kiểm đề xuất 'xác nhận booking' do AI sinh ra trước khi FE gọi API thật."""
    if not isinstance(action, dict):
        return None
    ma_dat_san = str(action.get("ma_dat_san") or "").strip().upper()
    if not ma_dat_san:
        return None
    booking = db.query(Booking).filter(Booking.ma_dat_san == ma_dat_san).first()
    if not booking or booking.trang_thai != BookingStatus.CHO_XAC_NHAN:
        return None
    return {
        "booking_id": booking.id,
        "ma_dat_san": booking.ma_dat_san,
        "ten_san": booking.san.ten_san if booking.san else "",
    }


def validate_cancel_booking_action(db: Session, action: Optional[dict]) -> Optional[dict]:
    """Hậu kiểm đề xuất 'hủy booking' do AI sinh ra trước khi FE gọi API thật."""
    if not isinstance(action, dict):
        return None
    ma_dat_san = str(action.get("ma_dat_san") or "").strip().upper()
    if not ma_dat_san:
        return None
    booking = db.query(Booking).filter(Booking.ma_dat_san == ma_dat_san).first()
    if not booking or booking.trang_thai not in (BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN):
        return None

    ly_do_huy = str(action.get("ly_do_huy") or "").strip() or "Hủy theo yêu cầu qua trợ lý AI nội bộ"

    hoan_tien_raw = action.get("hoan_tien")
    hoan_tien = hoan_tien_raw if isinstance(hoan_tien_raw, bool) else None

    loi_tu_san_raw = action.get("loi_tu_san")
    loi_tu_san = bool(loi_tu_san_raw) if isinstance(loi_tu_san_raw, bool) else None

    return {
        "booking_id": booking.id,
        "ma_dat_san": booking.ma_dat_san,
        "ten_san": booking.san.ten_san if booking.san else "",
        "ly_do_huy": ly_do_huy,
        "hoan_tien": hoan_tien,
        "loi_tu_san": loi_tu_san,
    }


def validate_create_field_action(action: Optional[dict]) -> Optional[dict]:
    """Hậu kiểm đề xuất 'tạo sân mới' do AI sinh ra trước khi FE gọi API thật."""
    if not isinstance(action, dict):
        return None
    ten_san = str(action.get("ten_san") or "").strip()
    if not ten_san:
        return None
    loai_san_raw = str(action.get("loai_san") or "").strip().upper()
    if loai_san_raw not in {t.value for t in FieldType}:
        return None
    try:
        suc_chua = int(action.get("suc_chua", 0))
        gia_tieu_chuan = float(action.get("gia_tieu_chuan", 0))
        gia_cao_diem = float(action.get("gia_cao_diem", 0))
    except (TypeError, ValueError):
        return None
    if suc_chua <= 0 or gia_tieu_chuan <= 0 or gia_cao_diem <= 0:
        return None
    return {
        "ten_san": ten_san,
        "loai_san": loai_san_raw,
        "suc_chua": suc_chua,
        "gia_tieu_chuan": gia_tieu_chuan,
        "gia_cao_diem": max(gia_cao_diem, gia_tieu_chuan),
        "mo_ta": str(action.get("mo_ta") or "").strip() or None,
    }


def validate_update_field_action(db: Session, action: Optional[dict]) -> Optional[dict]:
    """Hậu kiểm đề xuất 'sửa giá/trạng thái sân' do AI sinh ra trước khi FE gọi API thật."""
    if not isinstance(action, dict):
        return None
    ten_san_query = str(action.get("ten_san") or "").strip()
    if not ten_san_query:
        return None
    field = db.query(Field).filter(Field.ten_san.ilike(f"%{ten_san_query}%")).first()
    if not field:
        return None

    payload = {"field_id": field.id, "ten_san": field.ten_san}
    has_change = False

    if action.get("gia_tieu_chuan") is not None:
        try:
            v = float(action["gia_tieu_chuan"])
            if v > 0:
                payload["gia_tieu_chuan"] = v
                has_change = True
        except (TypeError, ValueError):
            pass
    if action.get("gia_cao_diem") is not None:
        try:
            v = float(action["gia_cao_diem"])
            if v > 0:
                payload["gia_cao_diem"] = v
                has_change = True
        except (TypeError, ValueError):
            pass
    trang_thai_raw = str(action.get("trang_thai") or "").strip().upper()
    if trang_thai_raw in {s.value for s in FieldStatus}:
        payload["trang_thai"] = trang_thai_raw
        has_change = True

    if not has_change:
        return None
    return payload


@router.post("")
def chat_with_bot(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    try:
        # Chuẩn hóa thời gian theo múi giờ Việt Nam (UTC+7)
        now_vn_dt = datetime.utcnow() + timedelta(hours=7)
        today = now_vn_dt.date()
        now_vn = now_vn_dt.strftime("%H:%M")

        # 1-3. Dữ liệu sân (kèm đánh giá), dịch vụ và lịch bận 3 ngày tới
        ctx = build_shared_context(db, today)
        fields_data = ctx["fields_data"]
        services_data = ctx["services_data"]
        busy_data = ctx["busy_data"]

        # 4. Xác định thông tin thành viên và ưu đãi giảm giá
        user_display = f"Khách hàng: {current_user.ho_ten}" if current_user else "Khách vãng lai"
        membership_info = ""
        user_bookings_data = []

        if current_user:
            # Hạng tự tính theo tổng chi tiêu lũy kế (cơ chế chính của hệ thống)
            spend = calculate_lifetime_spend(db, current_user.id)
            tier_spend = calculate_tier_from_spend(spend)
            rate_spend = get_discount_rate(tier_spend)

            # Thẻ hội viên đã mua (nếu có) - áp dụng nếu ưu đãi cao hơn
            membership = get_active_membership(db, current_user.id)
            rate_mem = 0.0
            tier_mem_val = None
            if membership:
                tier_mem_val = membership.loai_the.value if hasattr(membership.loai_the, "value") else str(membership.loai_the)
                rate_mem = get_discount_rate(tier_mem_val)

            best_rate = max(rate_spend, rate_mem)
            effective_tier = tier_mem_val if rate_mem >= rate_spend and tier_mem_val else tier_spend
            tier_name = MEMBERSHIP_NAME.get(effective_tier, effective_tier)

            if best_rate > 0:
                membership_info = (
                    f"- Hạng thành viên hiện tại (tự tính theo tổng chi tiêu, không cần đăng ký): {tier_name}, "
                    f"được GIẢM {int(best_rate * 100)}% TIỀN SÂN. Tổng chi tiêu lũy kế: {int(spend):,}đ."
                )
            else:
                membership_info = (
                    f"- Khách hàng chưa đạt hạng thành viên nào (tổng chi tiêu lũy kế: {int(spend):,}đ). "
                    f"Mốc kế tiếp: Bạc từ 1.000.000đ (giảm 5%)."
                )

            # Tra cứu các đơn đặt sân sắp tới của khách
            upcoming = (
                db.query(Booking)
                .filter(
                    Booking.khach_hang_id == current_user.id,
                    Booking.ngay_dat >= today,
                    Booking.trang_thai != BookingStatus.HUY,
                )
                .order_by(Booking.ngay_dat.asc(), Booking.gio_bat_dau.asc())
                .limit(5)
                .all()
            )
            for b in upcoming:
                stt_text = "Chờ xác nhận"
                if b.trang_thai == BookingStatus.DA_XAC_NHAN:
                    stt_text = "Đã xác nhận"
                elif b.trang_thai == BookingStatus.DANG_SU_DUNG:
                    stt_text = "Đang sử dụng"
                elif b.trang_thai == BookingStatus.HOAN_THANH:
                    stt_text = "Hoàn thành"

                total_amount = int(b.invoice.tong_cong if b.invoice else b.tien_san)
                user_bookings_data.append(
                    f"- Mã đơn: {b.ma_dat_san} | {b.san.ten_san if b.san else 'Sân'} | Ngày: {b.ngay_dat} ({b.gio_bat_dau.strftime('%H:%M')} - {b.gio_ket_thuc.strftime('%H:%M')}) | Trạng thái: {stt_text} | Tổng cộng: {total_amount:,}đ"
                )

        # 5. Xử lý lịch sử hội thoại gần nhất
        history_context = ""
        if req.history:
            recent = req.history[-6:]
            formatted = []
            for item in recent:
                sender_name = "Khách hàng" if item.sender == "user" else "Lễ tân"
                formatted.append(f"{sender_name}: {item.text}")
            if formatted:
                history_context = "LỊCH SỬ TRÒ CHUYỆN GẦN NHẤT:\n" + "\n".join(formatted) + "\n\n"

        system_instruction = f"""
Bạn là trợ lý lễ tân ảo thông minh, nhanh nhẹn và niềm nở của hệ thống Sân Bóng UIT (KICKOFF).
Thời gian thực tế hiện tại: {today.strftime('%Y-%m-%d')}, lúc {now_vn}.
Đang trò chuyện với: {user_display}.
{membership_info}

GIỜ HOẠT ĐỘNG & QUY ĐỊNH:
- Giờ mở cửa: 06:00 - 23:00 mỗi ngày.
- Giờ bắt đầu các ca đặt theo bước 15 phút (ví dụ 17:00, 17:15, 17:30, 17:45, 18:00...).
- Thời lượng đặt: 0.5h, 1h, 1.5h, 2h, 2.5h, 3h (mặc định khuyến nghị 1.5h).
- Giờ cao điểm: 17:00 - 22:00.
- Giảm giá thành viên: Bạc 5%, Vàng 10%, Kim Cương 15% tiền sân.

DANH SÁCH SÂN ĐANG HOẠT ĐỘNG:
{chr(10).join(fields_data)}

DỊCH VỤ & TIỆN ÍCH:
{chr(10).join(services_data)}

LỊCH ĐẶT SÂN SẮP TỚI CỦA CHÍNH KHÁCH HÀNG NÀY:
{chr(10).join(user_bookings_data) if user_bookings_data else ("Khách hàng chưa có lịch đặt sân nào sắp tới." if current_user else "Khách chưa đăng nhập, vui lòng gợi ý đăng nhập nếu khách muốn tra cứu lịch cá nhân.")}

THÔNG TIN CHUYỂN KHOẢN & THANH TOÁN CHÍNH THỨC:
- Ngân hàng: Vietcombank
- Số tài khoản: 0123456789
- Tên chủ tài khoản: SAN BONG UIT
- Cú pháp nội dung chuyển khoản: [Mã đơn] [Số điện thoại] (Ví dụ: BK12345678 0901234567)
- Thời hạn giữ chỗ: 30 phút sau khi tạo đơn.

HƯỚNG DẪN HỦY SÂN & HOÀN TIỀN:
- Khách có thể hủy đơn tại mục "Lịch đặt của tôi" (/my-bookings).
- Hủy trước 24h: Hoàn 50% cọc. Hủy dưới 24h: Không hoàn tiền cọc.

CÁC KHUNG GIỜ ĐÃ KÍN LỊCH TRONG 3 NGÀY TỚI:
{chr(10).join(busy_data) if busy_data else "Hiện tất cả khung giờ đều còn trống."}

QUY TẮC PHẢN HỒI (BẮT BUỘC TRẢ VỀ JSON):
Luôn trả về đúng 1 JSON object gồm 2 khóa:
1. "reply": Câu trả lời tiếng Việt ngắn gọn, niềm nở, tư vấn đầy đủ và chính xác theo thông tin hệ thống đã cung cấp ở trên. Có thể gợi ý thêm dịch vụ tiện ích (nước, áo, bóng) hoặc hướng dẫn thanh toán/hủy sân khi phù hợp.
2. "booking_action":
   - Khi phát hiện khách muốn đặt một loại sân/sân cụ thể vào Ngày và Giờ bắt đầu còn trống:
     Tạo object gồm:
       "field_id": (int) ID sân còn trống,
       "field_name": (str) tên sân,
       "date": (str) định dạng YYYY-MM-DD (quy đổi chuẩn từ "hôm nay", "ngày mai", v.v. dựa trên mốc {today.strftime('%Y-%m-%d')}),
       "time": (str) định dạng HH:MM (phút là 00/15/30/45, nằm trong dải 06:00 đến 22:00),
       "duration": (float) số giờ đặt (mặc định 1.5).
   - Nếu khách chỉ định loại sân (ví dụ "sân 7" hoặc "sân 5"), HÃY TỰ ĐỘNG CHỌN SÂN ĐẦU TIÊN CÙNG LOẠI CÒN TRỐNG để gán vào booking_action.
   - Nếu khách tra cứu lịch cá nhân, hỏi STK thanh toán, hỏi chính sách hủy hoặc giờ đó đã kín lịch: gán "booking_action": null.
"""

        # (model, hỗ trợ thinking_config?) — model "lite" không nhận thinking_config (400 INVALID_ARGUMENT nếu truyền vào).
        # Ưu tiên model lite trước vì nhanh hơn nhiều (~1s so với ~5s) cho tác vụ JSON đơn giản này.
        # gemini-2.5-flash/2.0-flash/1.5-flash đã bị Google ngừng hỗ trợ (404) — giữ lại các bản 3.x/latest còn hoạt động.
        candidate_models = [
            ("gemini-3.5-flash-lite", False),
            ("gemini-flash-lite-latest", False),
            ("gemini-3.5-flash", True),
            ("gemini-3.6-flash", True),
        ]

        full_prompt = f"{history_context}Khách hàng vừa nhắn: \"{req.message}\""

        last_error = None
        for model_name, supports_thinking in candidate_models:
            try:
                config_kwargs = dict(
                    system_instruction=system_instruction,
                    temperature=0.2,
                    response_mime_type="application/json",
                    http_options=types.HttpOptions(timeout=10000),  # ms — API yêu cầu tối thiểu 10s
                )
                if supports_thinking:
                    # Tắt "thinking" mở rộng: đây là tác vụ trả lời/JSON đơn giản, không cần suy luận nhiều bước —
                    # thinking mặc định (đặc biệt ở model 2.5) là nguyên nhân chính khiến phản hồi chậm ~10s.
                    config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
                response = client.models.generate_content(
                    model=model_name,
                    contents=full_prompt,
                    config=types.GenerateContentConfig(**config_kwargs),
                )
                if response and response.text:
                    raw = response.text.strip()
                    if raw.startswith("```json"):
                        raw = raw[7:]
                    if raw.startswith("```"):
                        raw = raw[3:]
                    if raw.endswith("```"):
                        raw = raw[:-3]
                    parsed = json.loads(raw.strip())

                    # Xác thực và làm sạch booking_action trước khi trả về
                    raw_action = parsed.get("booking_action")
                    validated_action = validate_and_sanitize_booking_action(
                        db=db,
                        action=raw_action,
                        today=today,
                        now_vn_time=now_vn_dt.time(),
                    )

                    return {
                        "reply": parsed.get("reply", ""),
                        "booking_action": validated_action,
                    }
            except Exception as err:
                last_error = err
                continue

        raise last_error or Exception("Không xử lý được dữ liệu AI")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AdminChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None


@router.post("/admin")
def chat_with_bot_admin(
    req: AdminChatRequest,
    db: Session = Depends(get_db),
    staff: User = Depends(require_roles(UserRole.ADMIN, UserRole.QUAN_LY, UserRole.NHAN_VIEN)),
):
    """Trợ lý chat nội bộ cho Admin/Quản lý/Nhân viên: trả lời số liệu vận hành,
    đề xuất thêm dịch vụ vào bill của một booking, hoặc đề xuất tạo dịch vụ mới."""
    try:
        now_vn_dt = datetime.utcnow() + timedelta(hours=7)
        today = now_vn_dt.date()
        now_vn = now_vn_dt.strftime("%H:%M")

        ctx = build_shared_context(db, today)

        pending_bookings = (
            db.query(Booking)
            .filter(Booking.trang_thai == BookingStatus.CHO_XAC_NHAN)
            .order_by(Booking.ngay_dat.asc())
            .limit(10)
            .all()
        )
        pending_data = [
            f"- {b.ma_dat_san} | {b.san.ten_san if b.san else ''} | {b.ngay_dat} "
            f"{b.gio_bat_dau.strftime('%H:%M')}-{b.gio_ket_thuc.strftime('%H:%M')} | "
            f"Khách: {b.ten_khach_vang_lai or (b.khach_hang.ho_ten if b.khach_hang else 'N/A')}"
            for b in pending_bookings
        ]

        low_rating_feedbacks = (
            db.query(Feedback)
            .filter(Feedback.danh_gia_tong <= 2)
            .order_by(Feedback.ngay_tao.desc())
            .limit(5)
            .all()
        )
        low_rating_data = [
            f"- {f.danh_gia_tong}/5 sao | {f.booking.san.ten_san if f.booking and f.booking.san else ''} | "
            f"\"{f.nhan_xet or 'Không có nhận xét'}\""
            for f in low_rating_feedbacks
        ]

        low_stock_data = [
            f"- {s.ten_dich_vu}: còn {s.ton_kho} {s.don_vi_tinh}"
            for s in ctx["services"] if s.ton_kho < 5
        ]

        history_context = ""
        if req.history:
            recent = req.history[-6:]
            formatted = [
                f"{'Nhân viên' if item.sender == 'user' else 'Trợ lý'}: {item.text}" for item in recent
            ]
            if formatted:
                history_context = "LỊCH SỬ TRÒ CHUYỆN GẦN NHẤT:\n" + "\n".join(formatted) + "\n\n"

        system_instruction = f"""
Bạn là trợ lý AI nội bộ hỗ trợ vận hành cho nhân viên/quản lý hệ thống Sân Bóng UIT (KICKOFF).
Đang trò chuyện với nhân viên: {staff.ho_ten} ({staff.vai_tro.value}).
Thời gian thực tế hiện tại: {today.strftime('%Y-%m-%d')}, lúc {now_vn}.

DANH SÁCH SÂN ĐANG HOẠT ĐỘNG:
{chr(10).join(ctx["fields_data"])}

DỊCH VỤ ĐANG KINH DOANH:
{chr(10).join(ctx["services_data"])}

DỊCH VỤ SẮP HẾT HÀNG (dưới 5 đơn vị):
{chr(10).join(low_stock_data) if low_stock_data else "Không có dịch vụ nào sắp hết hàng."}

BOOKING ĐANG CHỜ XÁC NHẬN:
{chr(10).join(pending_data) if pending_data else "Không có booking nào đang chờ xác nhận."}

ĐÁNH GIÁ THẤP GẦN ĐÂY (≤2 sao, cần chú ý xử lý):
{chr(10).join(low_rating_data) if low_rating_data else "Không có đánh giá thấp nào gần đây."}

QUY TẮC PHẢN HỒI (BẮT BUỘC TRẢ VỀ JSON):
Luôn trả về đúng 1 JSON object gồm 7 khóa: "reply", "add_service_action", "create_service_action", "confirm_booking_action", "cancel_booking_action", "create_field_action", "update_field_action".

1. "reply": Câu trả lời tiếng Việt ngắn gọn, chuyên nghiệp, dựa đúng trên dữ liệu hệ thống ở trên. Có thể chủ động nhắc nhân viên về dịch vụ sắp hết hàng, booking chờ xác nhận hoặc đánh giá thấp nếu phù hợp với câu hỏi.
2. "add_service_action": CHỈ điền khi nhân viên muốn THÊM một dịch vụ có sẵn vào bill của MỘT BOOKING ĐÃ TỒN TẠI (ví dụ "thêm 2 nước cho đơn BK12345678"):
   Tạo object gồm: "ma_dat_san" (str, mã đơn được nhắc tới), "dich_vu_id" (int nếu chắc chắn biết) hoặc "dich_vu_ten" (str tên dịch vụ, có thể gần đúng), "so_luong" (int, mặc định 1).
   Nếu thiếu mã đơn hoặc không xác định được dịch vụ, gán null.
3. "create_service_action": CHỈ điền khi nhân viên muốn TẠO MỚI một loại dịch vụ trong danh mục (ví dụ "tạo dịch vụ mới tên Khăn lạnh giá 5000 đơn vị Cái tồn kho 20"):
   Tạo object gồm: "ten_dich_vu" (str), "don_gia" (number), "don_vi_tinh" (str, mặc định "Cái"), "ton_kho" (int, mặc định 0), "la_cho_thue" (bool, true nếu là đồ cho thuê như giày/áo, mặc định false).
   Nếu không đủ thông tin, gán null.
4. "confirm_booking_action": CHỈ điền khi nhân viên muốn XÁC NHẬN một booking đang ở trạng thái "Chờ xác nhận" (ví dụ "xác nhận đơn BK12345678", "duyệt đơn BK..."):
   Tạo object gồm: "ma_dat_san" (str). Nếu thiếu mã đơn, gán null.
4b. "cancel_booking_action": CHỈ điền khi nhân viên muốn HỦY một booking đang "Chờ xác nhận" hoặc "Đã xác nhận" (ví dụ "hủy đơn BK12345678 vì khách báo bận", "hủy đơn BK... do sân bị lỗi đèn"):
   Tạo object gồm: "ma_dat_san" (str), "ly_do_huy" (str, tóm tắt lý do nếu nhân viên có nêu, để trống nếu không rõ),
   "loi_tu_san" (true CHỈ khi lý do là lỗi/sự cố/hỏng hóc từ phía sân → hoàn 100%, ngược lại null),
   "hoan_tien" (true/false CHỈ khi nhân viên nói rõ có/không hoàn tiền theo yêu cầu khách (hoàn 50%), ngược lại null cho hệ thống tự áp policy 24h). KHÔNG điền cả "loi_tu_san" và "hoan_tien" cùng lúc — nếu là lỗi từ sân thì chỉ điền "loi_tu_san": true.
   Không thu thập thông tin STK ở đây — khách sẽ tự cung cấp sau tại "Lịch đặt của tôi".
   Nếu thiếu mã đơn, gán null.
5. "create_field_action": CHỈ điền khi nhân viên muốn TẠO MỚI một sân bóng (ví dụ "thêm sân mới tên Sân 6, loại 7 người, sức chứa 14, giá thường 200000, giá cao điểm 250000"):
   Tạo object gồm: "ten_san" (str), "loai_san" ("SAN_5"|"SAN_7"|"SAN_11"), "suc_chua" (int), "gia_tieu_chuan" (number), "gia_cao_diem" (number), "mo_ta" (str, có thể rỗng).
   Nếu không đủ thông tin, gán null.
6. "update_field_action": CHỈ điền khi nhân viên muốn SỬA GIÁ GIỜ THƯỜNG/CAO ĐIỂM hoặc TRẠNG THÁI của một sân đã tồn tại (ví dụ "chỉnh giá giờ cao điểm sân 1 lên 300000", "cho sân 2 bảo trì"):
   Tạo object gồm: "ten_san" (str, tên sân cần sửa), và CHỈ các trường thực sự cần đổi trong số: "gia_tieu_chuan" (number), "gia_cao_diem" (number), "trang_thai" ("HOAT_DONG"|"BAO_TRI"|"DONG_CUA").
   Nếu không xác định được sân hoặc không có trường nào cần đổi, gán null.

QUY TẮC QUAN TRỌNG NHẤT: Hệ thống chỉ thực sự thực hiện hành động khi 1 trong 6 khóa action ở trên khác null VÀ được người dùng bấm xác nhận trên giao diện — "reply" của bạn KHÔNG bao giờ tự ý thực hiện điều gì. TUYỆT ĐỐI KHÔNG được viết trong "reply" rằng đã xác nhận/hủy/sửa/xóa/thêm THÀNH CÔNG nếu action tương ứng không được điền ở trên — làm vậy là nói dối nhân viên về trạng thái hệ thống. Nếu yêu cầu của nhân viên không khớp với bất kỳ action nào ở trên (ví dụ: đổi giờ một booking cụ thể, xóa dịch vụ khỏi bill...), phải trả lời rõ ràng là thao tác này chưa được hỗ trợ qua chat và hướng dẫn dùng đúng trang quản trị tương ứng, tất cả action đều để null.
Mỗi phản hồi chỉ được điền khác null TỐI ĐA MỘT trong 6 khóa action; các khóa còn lại luôn là null. Nếu câu hỏi chỉ là hỏi thông tin/báo cáo, tất cả action đều null.
"""

        full_prompt = f"{history_context}Nhân viên vừa nhắn: \"{req.message}\""

        candidate_models = [
            ("gemini-3.5-flash-lite", False),
            ("gemini-flash-lite-latest", False),
            ("gemini-3.5-flash", True),
            ("gemini-3.6-flash", True),
        ]

        last_error = None
        for model_name, supports_thinking in candidate_models:
            try:
                config_kwargs = dict(
                    system_instruction=system_instruction,
                    temperature=0.2,
                    response_mime_type="application/json",
                    http_options=types.HttpOptions(timeout=10000),  # ms — API yêu cầu tối thiểu 10s
                )
                if supports_thinking:
                    config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
                response = client.models.generate_content(
                    model=model_name,
                    contents=full_prompt,
                    config=types.GenerateContentConfig(**config_kwargs),
                )
                if response and response.text:
                    raw = response.text.strip()
                    if raw.startswith("```json"):
                        raw = raw[7:]
                    if raw.startswith("```"):
                        raw = raw[3:]
                    if raw.endswith("```"):
                        raw = raw[:-3]
                    parsed = json.loads(raw.strip())

                    add_service_action = validate_add_service_action(db, parsed.get("add_service_action"))
                    create_service_action = validate_create_service_action(parsed.get("create_service_action"))
                    confirm_booking_action = validate_confirm_booking_action(db, parsed.get("confirm_booking_action"))
                    cancel_booking_action = validate_cancel_booking_action(db, parsed.get("cancel_booking_action"))
                    create_field_action = validate_create_field_action(parsed.get("create_field_action"))
                    update_field_action = validate_update_field_action(db, parsed.get("update_field_action"))

                    return {
                        "reply": parsed.get("reply", ""),
                        "add_service_action": add_service_action,
                        "create_service_action": create_service_action,
                        "confirm_booking_action": confirm_booking_action,
                        "cancel_booking_action": cancel_booking_action,
                        "create_field_action": create_field_action,
                        "update_field_action": update_field_action,
                    }
            except Exception as err:
                last_error = err
                continue

        raise last_error or Exception("Không xử lý được dữ liệu AI")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))