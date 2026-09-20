from datetime import date, datetime, time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.chatbot import engine, guard
from app.chatbot.base import ToolError, tools_for_role
from app.core.config import FieldStatus
from app.core.database import get_db
from app.core.security import get_current_user_optional
from app.models import Field, User
from app.utils.helpers import has_booking_conflict

router = APIRouter(prefix="/api/chat", tags=["Chatbot"])


class ChatMessage(BaseModel):
    sender: str
    text: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None


class ConfirmRequest(BaseModel):
    token: str


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


def _identity(req: Request, user: Optional[User]) -> str:
    return f"u{user.id}" if user else f"ip{req.client.host if req.client else '?'}"


@router.post("")
def chat_with_bot(req: ChatRequest, request: Request, db: Session = Depends(get_db),
                  current_user: Optional[User] = Depends(get_current_user_optional)):
    """Một endpoint cho mọi vai trò: công cụ khả dụng do server lọc theo vai trò của người gọi."""
    ctx = engine.make_ctx(db, current_user)
    ident = _identity(request, current_user)
    wait = guard.check_rate_limit(ident, ctx.role)
    if wait:
        return {"reply": wait, "proposals": [], "booking_action": None}
    g = guard.check_message(req.message, ctx.role)
    if not g.ok:
        if g.reason not in ("empty", "too_long"):
            engine.audit(db, "BLOCKED", ctx.role, current_user.id if current_user else None, g.reason, req.message[:300])
            if guard.record_violation(ident):
                return {"reply": "Bạn đã gửi các nội dung không phù hợp nhiều lần, chat tạm khóa vài phút.", "proposals": [], "booking_action": None}
        return {"reply": g.reply, "proposals": [], "booking_action": None}
    try:
        return engine.chat(ctx, g.text, req.history)
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").exception("chat failed: %s", e)
        raise HTTPException(status_code=503, detail="Trợ lý AI đang bận, vui lòng thử lại sau giây lát.")


@router.post("/admin")
def chat_admin_alias(req: ChatRequest, request: Request, db: Session = Depends(get_db),
                     current_user: Optional[User] = Depends(get_current_user_optional)):
    if not current_user or current_user.vai_tro.value == "KHACH_HANG":
        raise HTTPException(status_code=403, detail="Chỉ dành cho nhân sự")
    return chat_with_bot(req, request, db, current_user)


@router.post("/confirm")
def confirm_proposal(req: ConfirmRequest, db: Session = Depends(get_db),
                     current_user: Optional[User] = Depends(get_current_user_optional)):
    """Người dùng bấm xác nhận thẻ đề xuất: kiểm tra chữ ký, hạn, chủ sở hữu, quyền rồi mới thực hiện."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Cần đăng nhập")
    try:
        return engine.execute_confirmed(engine.make_ctx(db, current_user), req.token)
    except ToolError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/capabilities")
def capabilities(current_user: Optional[User] = Depends(get_current_user_optional)):
    """Danh sách việc chatbot làm được với tài khoản hiện tại (để giao diện gợi ý)."""
    role = engine.role_of(current_user)
    return {"vai_tro": role, "cong_cu": [{"ten": t.name, "mo_ta": t.label or t.name, "loai": t.kind, "icon": t.icon}
                                        for t in tools_for_role(role) if t.label]}
