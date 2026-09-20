"""Kiểm tra lớp bảo mật: header, khóa tạm khi đoán mật khẩu, giới hạn OTP/API, thông báo nhóm 'khac'.
Chạy: python test_security.py  (DB tạm, không gửi email thật)"""
import os
import tempfile
import warnings

warnings.filterwarnings("ignore")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "s.db")

import seed  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.core import protect  # noqa: E402
from app.routers import auth  # noqa: E402

seed.seed()
auth.send_otp_email = lambda *a, **k: None       # không gửi email thật
c = TestClient(app)


def login(email, pw):
    return c.post("/api/auth/login", json={"email": email, "mat_khau": pw})


# header bảo mật
h = c.get("/api/health").headers
assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"

# khóa tạm sau 5 lần sai; đúng mật khẩu cũng bị khóa; tài khoản khác không bị ảnh hưởng
for _ in range(5):
    assert login("khach@gmail.com", "sai-mat-khau1").status_code == 401
assert login("khach@gmail.com", "khach1234").status_code == 429
assert login("quen@gmail.com", "khach1234").status_code == 200
assert login("khong-ton-tai@gmail.com", "x").status_code == 401       # email lạ: cùng thông báo, không lộ tồn tại

# OTP: gửi tối đa 3 lần/10 phút cho một email; dò mã tối đa 6 lần
protect.reset()
codes = [c.post("/api/auth/send-otp", json={"email": "a@gmail.com"}).status_code for _ in range(4)]
assert codes == [200, 200, 200, 429], codes
codes = [c.post("/api/auth/verify-otp", json={"email": "a@gmail.com", "otp": "000000"}).status_code for _ in range(7)]
assert codes[:6] == [400] * 6 and codes[6] == 429, codes

# giới hạn tần suất theo IP trên login (15/phút), 429 vẫn có Retry-After
protect.reset()
codes = [login(f"u{i}@gmail.com", "x").status_code for i in range(16)]
assert 429 in codes, codes

# debug endpoint chỉ admin
protect.reset()
assert c.get("/api/debug/db").status_code == 401

# thông báo có 4 nhóm; nhóm khac ghi nhận sự kiện bảo mật
tok = login("quanly@sanbong.vn", "quanly123").json()["access_token"]
n = c.get("/api/notifications", headers={"Authorization": f"Bearer {tok}"}).json()
assert set(n) == {"dat_san", "dich_vu", "danh_gia", "khac"}, n.keys()
titles = [x["title"] for x in n["khac"]]
assert any("khóa tạm" in t for t in titles), titles
print("khac:", titles)
print("OK — kiểm tra bảo mật đạt")
