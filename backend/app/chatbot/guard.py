"""Lớp bảo vệ cho chatbot — chạy TRƯỚC khi gọi AI và SAU khi AI trả lời.

Nguyên tắc: quyền hạn thật sự luôn do server kiểm tra ở từng công cụ (xem tools.py), đây chỉ là lớp phòng thủ
thêm để (1) chặn sớm các câu độc hại, không tốn lượt gọi AI, (2) giới hạn tần suất chống spam/dò quét,
(3) không để lộ bí mật hệ thống qua câu trả lời.
"""
import re
import time
import unicodedata
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Optional

MAX_MESSAGE_CHARS = 1200
MAX_HISTORY_TURNS = 8
MAX_HISTORY_CHARS = 700

# Giới hạn tần suất (sliding window). Khách vãng lai chặt hơn tài khoản đã đăng nhập.
RATE_LIMITS = {
    "GUEST": [(60, 8), (3600, 60)],
    "KHACH_HANG": [(60, 15), (3600, 200)],
    "STAFF": [(60, 30), (3600, 600)],
}
# Vi phạm nội dung nhiều lần trong thời gian ngắn → khóa tạm
STRIKE_WINDOW_S = 600
STRIKE_LIMIT = 3
LOCKOUT_S = 300

_hits: dict[str, deque] = defaultdict(deque)
_strikes: dict[str, deque] = defaultdict(deque)
_lockouts: dict[str, float] = {}


def _strip_accents(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace("đ", "d").replace("Đ", "D")


def normalize(text: str) -> str:
    """Không dấu, chữ thường, gọn khoảng trắng — dùng để so khớp mẫu độc hại bất kể cách gõ."""
    t = _strip_accents(text).lower()
    t = re.sub(r"[\u200b-\u200f\u2060\ufeff]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def sanitize_text(text: str, limit: int = MAX_MESSAGE_CHARS) -> str:
    """Bỏ ký tự điều khiển / ký tự vô hình (thường dùng để giấu chỉ dẫn), cắt độ dài."""
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text or "")
    text = re.sub(r"[\u200b-\u200f\u202a-\u202e\u2060\ufeff]", "", text)
    return text.strip()[:limit]


# (nhãn, regex trên văn bản đã normalize)
_BLOCK_PATTERNS: list[tuple[str, re.Pattern]] = [(label, re.compile(p)) for label, p in [
    # --- Cố ghi đè chỉ dẫn / bẻ khóa ---
    ("prompt_injection", r"(ignore|disregard|forget|override)\b.{0,30}\b(previous|above|prior|all|your|system)\b.{0,20}\b(instruction|prompt|rule|direction)"),
    ("prompt_injection", r"(bo qua|quen het|quen di|huy bo|vo hieu hoa|khong can tuan theo)\b.{0,30}\b(huong dan|chi thi|quy tac|luat|gioi han|rang buoc|cai dat)"),
    ("prompt_injection", r"(system prompt|prompt he thong|chi thi he thong|huong dan he thong|developer message|initial instructions)"),
    ("prompt_injection", r"(in ra|hien thi|cho toi xem|tiet lo|lap lai|show|reveal|print|repeat|leak)\b.{0,25}\b(prompt|chi thi|huong dan|instruction|cau hinh cua ban)"),
    ("jailbreak", r"\b(jailbreak|dan mode|developer mode|god mode|do anything now|unfiltered mode|che do khong gioi han)\b"),
    ("jailbreak", r"(tu bay gio|from now on|you are now|ban bay gio la|hay dong vai|pretend (to be|you are)|act as (an? )?(admin|root|developer|hacker))"),
    ("jailbreak", r"(toi la (admin|quan ly|chu he thong|nha phat trien|developer)|i am (the )?(admin|owner|developer)).{0,40}(cap quyen|cho phep|bo qua|mo khoa|unlock|grant)"),
    # --- Đòi bí mật hệ thống ---
    ("secrets", r"(api ?key|gemini_api_key|resend_api_key|secret ?key|jwt|bearer token|access token|refresh token|database_url|connection string|chuoi ket noi|\.env\b|bien moi truong|environment variable)"),
    ("secrets", r"(mat khau|password|passwd|pwd|hash).{0,30}(cua (admin|nguoi khac|khach|nhan vien|user|tai khoan)|cua .{0,15}@|toan bo|tat ca|cua moi)"),
    ("secrets", r"(bcrypt|mat_khau_hash|secret_key|private key|ssh key)"),
    # --- Tấn công dữ liệu / mã độc ---
    ("sql_injection", r"(\bdrop\s+(table|database)\b|\bdelete\s+from\b|\btruncate\s+table\b|\bunion\s+select\b|\binsert\s+into\b.{0,30}\bvalues\b|\bupdate\s+\w+\s+set\b|;\s*--|'\s*or\s*'?1'?\s*=\s*'?1|\bxp_cmdshell\b|\bexec\s*\()"),
    ("mass_delete", r"(xoa|huy|drop|wipe|erase|delete)\s+(toan bo|het|sach|tat ca)\s+(du lieu|database|co so du lieu|bang|tai khoan|nguoi dung|users?)"),
    ("code_injection", r"(<\s*script|javascript:|onerror\s*=|onload\s*=|<\s*iframe|<\s*img[^>]+src\s*=|\beval\s*\(|__import__|os\.system|subprocess|rm\s+-rf|\bcurl\s+http|\bwget\s+http|powershell\s+-)"),
    ("path_traversal", r"(\.\./|\.\.\\|/etc/passwd|c:\\windows|file://)"),
]]

# Chỉ chặn với người KHÔNG phải nhân sự (nhân sự có nhu cầu tra cứu khách hợp lệ)
_PII_HARVEST = re.compile(
    r"(danh sach|liet ke|xuat|export|dump|toan bo|tat ca)\b.{0,25}\b(sdt|so dien thoai|email|gmail|thong tin ca nhan|tai khoan)\b.{0,25}\b(khach|nguoi dung|user|thanh vien|nhan vien|moi nguoi|toan he thong)"
    r"|(so dien thoai|sdt|email)\b.{0,15}\b(cua|cua nhung)\b.{0,15}\b(khach|nguoi khac|nguoi dung khac|nhan vien)"
)

BLOCK_REPLY = (
    "Em không thể hỗ trợ yêu cầu này vì nó liên quan đến bảo mật của hệ thống. "
    "Em có thể giúp anh/chị về đặt sân, giá, dịch vụ, lịch đặt và các thao tác trong quyền hạn của tài khoản mình nhé!"
)
PII_REPLY = (
    "Vì lý do riêng tư, em không thể cung cấp thông tin cá nhân của khách hàng/nhân viên khác. "
    "Em chỉ hỗ trợ tra cứu thông tin thuộc quyền của tài khoản anh/chị."
)


@dataclass
class GuardResult:
    ok: bool
    text: str = ""            # văn bản đã làm sạch (dùng để gửi cho AI)
    reason: str = ""          # nhãn vi phạm
    reply: str = ""           # câu trả lời dựng sẵn khi bị chặn
    status: int = 200


def check_message(message: str, role: str) -> GuardResult:
    """role: GUEST | KHACH_HANG | NHAN_VIEN | QUAN_LY | ADMIN"""
    raw = message or ""
    if len(raw) > MAX_MESSAGE_CHARS * 3:
        return GuardResult(False, reason="too_long", reply="Tin nhắn quá dài, anh/chị vui lòng nhắn ngắn gọn hơn nhé.")
    text = sanitize_text(raw)
    if not text:
        return GuardResult(False, reason="empty", reply="Anh/chị chưa nhập nội dung tin nhắn ạ.")
    if len(raw.strip()) > MAX_MESSAGE_CHARS:
        return GuardResult(False, reason="too_long", reply=f"Tin nhắn quá dài (tối đa {MAX_MESSAGE_CHARS} ký tự), anh/chị vui lòng nhắn ngắn gọn hơn nhé.")

    norm = normalize(text)
    for label, pat in _BLOCK_PATTERNS:
        if pat.search(norm):
            return GuardResult(False, text=text, reason=label, reply=BLOCK_REPLY)
    if role not in ("NHAN_VIEN", "QUAN_LY", "ADMIN") and _PII_HARVEST.search(norm):
        return GuardResult(False, text=text, reason="pii_harvest", reply=PII_REPLY)
    return GuardResult(True, text=text)


def sanitize_history(history) -> list[tuple[str, str]]:
    """Lịch sử do phía client gửi lên nên KHÔNG đáng tin: chỉ giữ vài lượt gần nhất, làm sạch và cắt ngắn.
    Trả về [(role 'user'|'model', text)]. Lượt bot chỉ dùng làm ngữ cảnh hội thoại, không cấp thêm quyền nào."""
    out: list[tuple[str, str]] = []
    for item in (history or [])[-MAX_HISTORY_TURNS:]:
        sender = getattr(item, "sender", None) or (item.get("sender") if isinstance(item, dict) else None)
        text = getattr(item, "text", None) or (item.get("text") if isinstance(item, dict) else "")
        t = sanitize_text(text or "", MAX_HISTORY_CHARS)
        if not t:
            continue
        # Lượt của "user" trong lịch sử cũng phải qua bộ lọc mẫu độc hại (chống chèn chỉ dẫn qua lịch sử)
        if sender == "user":
            n = normalize(t)
            if any(p.search(n) for _, p in _BLOCK_PATTERNS):
                continue
        out.append(("user" if sender == "user" else "model", t))
    return out


# ---------------- Giới hạn tần suất ----------------
def _bucket(role: str) -> str:
    if role in ("NHAN_VIEN", "QUAN_LY", "ADMIN"):
        return "STAFF"
    return role if role in RATE_LIMITS else "GUEST"


def check_rate_limit(identity: str, role: str) -> Optional[str]:
    """Trả về thông báo lỗi nếu vượt giới hạn / đang bị khóa tạm, ngược lại None (và ghi nhận 1 lượt)."""
    now = time.time()
    until = _lockouts.get(identity)
    if until and until > now:
        return f"Bạn đã gửi các nội dung không phù hợp nhiều lần. Chat tạm khóa, vui lòng thử lại sau {int(until - now) // 60 + 1} phút."
    if until:
        _lockouts.pop(identity, None)

    dq = _hits[identity]
    longest = max(w for w, _ in RATE_LIMITS[_bucket(role)])
    while dq and dq[0] < now - longest:
        dq.popleft()
    for window, limit in RATE_LIMITS[_bucket(role)]:
        if sum(1 for t in dq if t >= now - window) >= limit:
            wait = window if window <= 60 else 60
            return f"Anh/chị nhắn hơi nhanh, vui lòng đợi khoảng {wait} giây rồi thử lại nhé."
    dq.append(now)
    return None


def record_violation(identity: str) -> bool:
    """Ghi nhận 1 lần vi phạm nội dung. Trả về True nếu vừa bị khóa tạm."""
    now = time.time()
    dq = _strikes[identity]
    while dq and dq[0] < now - STRIKE_WINDOW_S:
        dq.popleft()
    dq.append(now)
    if len(dq) >= STRIKE_LIMIT:
        _lockouts[identity] = now + LOCKOUT_S
        dq.clear()
        return True
    return False


def reset_state() -> None:
    """Dùng cho test."""
    _hits.clear()
    _strikes.clear()
    _lockouts.clear()


# ---------------- Lọc đầu ra ----------------
_SECRET_PATTERNS = [
    re.compile(r"AIza[0-9A-Za-z_\-]{30,}"),                       # Google API key
    re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{50,}"),            # bcrypt hash
    re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}"),  # JWT
    re.compile(r"\bre_[A-Za-z0-9]{16,}\b"),                        # Resend key
    re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
    re.compile(r"(?i)(mssql|mysql\+pymysql|postgresql)(\+\w+)?://[^\s]+"),   # chuỗi kết nối DB
]
# Các cụm chỉ xuất hiện trong chỉ dẫn hệ thống — nếu AI lặp lại nghĩa là đã lộ prompt
_PROMPT_MARKERS = ("[[SYSTEM-PROMPT-KICKOFF]]", "QUY TẮC BẢO MẬT BẤT BIẾN")


def scrub_output(reply: str) -> str:
    text = reply or ""
    for marker in _PROMPT_MARKERS:
        if marker in text:
            return "Em không thể chia sẻ nội dung cấu hình nội bộ của hệ thống ạ. Em giúp gì khác được cho anh/chị không?"
    for pat in _SECRET_PATTERNS:
        text = pat.sub("[đã ẩn]", text)
    return text
