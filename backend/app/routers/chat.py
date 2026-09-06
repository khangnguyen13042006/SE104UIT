import os
import json
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from google import genai
from google.genai import types

from app.core.database import get_db
from app.core.security import get_current_user_optional
from app.core.config import FieldStatus, ServiceStatus, BookingStatus
from app.models import Field, Booking, Service, User

router = APIRouter(prefix="/api/chat", tags=["Chatbot"])

client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
)

class ChatRequest(BaseModel):
    message: str

@router.post("")
def chat_with_bot(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    try:
        today = date.today()
        now_vn = (datetime.utcnow() + timedelta(hours=7)).strftime("%H:%M")

        # 1. Đọc dữ liệu sân kèm ID
        fields = db.query(Field).filter(Field.trang_thai == FieldStatus.HOAT_DONG).all()
        fields_data = [
            f"- Sân ID {f.id}: {f.ten_san} | Loại: {f.loai_san.value} ({f.suc_chua} người) | "
            f"Giá thường: {int(f.gia_tieu_chuan):,}đ/h | Cao điểm: {int(f.gia_cao_diem):,}đ/h | "
            f"Mô tả: {f.mo_ta or 'Không có'}"
            for f in fields
        ]

        # 2. Đọc dịch vụ đi kèm
        services = db.query(Service).filter(Service.trang_thai == ServiceStatus.HOAT_DONG).all()
        services_data = [
            f"- {s.ten_dich_vu}: {int(s.don_gia):,}đ/{s.don_vi_tinh} (Còn kho: {s.ton_kho})"
            for s in services
        ]

        # 3. Đọc lịch đã bận trong 3 ngày tới
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

        user_display = f"Khách hàng: {current_user.ho_ten}" if current_user else "Khách vãng lai"

        system_instruction = f"""
Bạn là trợ lý lễ tân ảo của hệ thống Sân Bóng UIT (KICKOFF).
Thời gian thực tế: {today.strftime('%Y-%m-%d')}, lúc {now_vn}.
Đang trò chuyện với: {user_display}.

DANH SÁCH SÂN ĐANG HOẠT ĐỘNG:
{chr(10).join(fields_data)}

DỊCH VỤ & TIỆN ÍCH:
{chr(10).join(services_data)}

CÁC KHUNG GIỜ ĐÃ KÍN LỊCH:
{chr(10).join(busy_data) if busy_data else "Hiện tất cả khung giờ đều còn trống."}

QUY ĐỊNH HỆ THỐNG:
- Giờ cao điểm: 17:00 - 22:00.
- Giảm giá thành viên: Bạc 5%, Vàng 10%, Kim Cương 15%.
- Hủy trước 24h hoàn 50% cọc.

QUY TẮC PHẢN HỒI (BẮT BUỘC TRẢ VỀ JSON):
Luôn trả về đúng 1 JSON object gồm 2 khóa:
1. "reply": Câu trả lời tiếng Việt ngắn gọn, niềm nở, báo giá và tình trạng sân.
2. "booking_action":
   - Khi phát hiện khách muốn đặt một loại sân/sân cụ thể vào Ngày và Giờ bắt đầu còn trống: Hãy tạo object gồm field_id (int), field_name (str), date (YYYY-MM-DD), time (HH:MM), duration (float, mặc định 1.5).
   - Nếu có nhiều sân cùng loại còn trống (ví dụ có 2 Sân 7 còn trống), HÃY TỰ ĐỘNG CHỌN SÂN ĐẦU TIÊN CÒN TRỐNG để gán vào booking_action.
   - Nếu khách chỉ chào hỏi, hỏi thông tin chung chung, hoặc giờ đó đã kín lịch: gán null.
"""

        candidate_models = [
            "gemini-3.6-flash",
            "gemini-3-flash-preview",
            "gemini-2.0-flash",
        ]

        last_error = None
        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=req.message,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.2,
                        response_mime_type="application/json",
                    ),
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
                    return {
                        "reply": parsed.get("reply", ""),
                        "booking_action": parsed.get("booking_action"),
                    }
            except Exception as err:
                last_error = err
                continue

        raise last_error or Exception("Không xử lý được dữ liệu AI")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))