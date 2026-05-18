# ⚽ Hệ thống Đặt lịch & Quản lý Sân bóng

**Đồ án môn SE104 — Đặc tả yêu cầu phần mềm**
**Nhóm SE104.Q28 — Trường Đại học Công nghệ Thông tin (UIT)**
**GVHD: ThS. Đỗ Văn Tiến**

## 🎯 Giới thiệu

Website cho phép khách hàng đặt sân online 24/7, đồng thời cung cấp công cụ quản trị đầy đủ cho chủ sân: quản lý sân, dịch vụ, nhân viên, hóa đơn, thẻ thành viên, ca trực, đánh giá, và báo cáo thống kê.

Đáp ứng đầy đủ **9 chức năng nghiệp vụ** trong tài liệu đặc tả.

## 🛠️ Công nghệ

| Lớp | Công nghệ |
|---|---|
| **Backend** | FastAPI 0.115 + SQLAlchemy 2.0 + JWT |
| **Database** | SQLite (dev) / **MySQL** (production) |
| **Frontend** | Next.js 14 (App Router) + TypeScript + TailwindCSS v4 |
| **UI** | KICKOFF theme — Emerald Green + Inter + Space Grotesk |
| **Animation** | Framer Motion |
| **Biểu đồ** | Recharts |
| **Icon** | Lucide React |

## 📁 Cấu trúc dự án

```
san-bong/
├── backend/                # FastAPI + SQLite
│   ├── app/
│   │   ├── core/          # config, database, security
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── routers/       # API endpoints (10 routers)
│   │   ├── utils/         # helpers (tính tiền, mã, ...)
│   │   └── main.py        # Entry point
│   ├── requirements.txt
│   └── seed.py            # Tạo dữ liệu mẫu
│
└── frontend/              # Next.js 14
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx           # Trang chủ
    │   │   ├── login/             # Đăng nhập
    │   │   ├── register/          # Đăng ký
    │   │   ├── booking/           # Đặt sân (grid lịch)
    │   │   ├── my-bookings/       # Lịch của tôi
    │   │   ├── feedback/          # Đánh giá public
    │   │   ├── membership/        # Thẻ thành viên
    │   │   └── admin/             # Khu vực quản trị
    │   │       ├── page.tsx       # Dashboard
    │   │       ├── bookings/      # QL lịch đặt
    │   │       ├── fields/        # QL sân
    │   │       ├── services/      # QL dịch vụ
    │   │       ├── users/         # QL tài khoản
    │   │       ├── shifts/        # Phân ca
    │   │       ├── feedbacks/     # Đánh giá admin
    │   │       └── reports/       # Báo cáo
    │   ├── components/Navbar.tsx
    │   └── lib/api.ts             # Wrapper fetch + auth
    ├── package.json
    └── tailwind.config.js
```

## ⚙️ Yêu cầu môi trường

- **Python 3.10+**
- **Node.js 18+** & npm
- 2 cổng trống: `8000` (backend) và `3000` (frontend)

## 🚀 Cách chạy

### 1) Cài & chạy Backend

```bash
cd backend

# (Khuyến nghị) tạo virtual env
python3 -m venv .venv
source .venv/bin/activate          # Linux/Mac
# .venv\Scripts\activate           # Windows

# Cài thư viện
pip install -r requirements.txt

# Tạo DB và seed dữ liệu mẫu
python seed.py

# Chạy server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend chạy tại: **http://localhost:8000**
Tài liệu API tự động (Swagger UI): **http://localhost:8000/docs**

### 🗄️ Database: SQLite, MySQL, hay Azure SQL?

**SQLite** — mặc định, **không cần cấu hình gì**. Phù hợp dev/demo/đồ án.
**MySQL** — production-ready local hoặc VPS.
**Azure SQL Database** — cloud-hosted, scalable, không lo backup/HA.

#### Option A: Chuyển sang MySQL

```sql
CREATE DATABASE san_bong CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sanbong'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON san_bong.* TO 'sanbong'@'localhost';
FLUSH PRIVILEGES;
```

Trong `.env`:
```bash
DATABASE_URL=mysql+pymysql://sanbong:your_password@localhost:3306/san_bong
```

#### Option B: Chuyển sang Azure SQL Database

**1) Tạo Azure SQL trên portal:**
- portal.azure.com → Create resource → SQL Database
- Server: tạo mới (ví dụ `sanbong-uit`), authentication: **SQL authentication**, lưu admin login + password
- Networking → **Allow Azure services**: Yes; **Add current client IP**

**2) Cài Microsoft ODBC Driver 18:**

| OS | Lệnh |
|---|---|
| Windows | Tải .msi từ https://aka.ms/odbcdriver |
| Mac | `brew install msodbcsql18` (sau khi `brew tap microsoft/mssql-release ...`) |
| Ubuntu | `sudo ACCEPT_EULA=Y apt install msodbcsql18` (sau khi add Microsoft apt repo) |

**3) Set `DATABASE_URL` trong `backend/.env`:**

```bash
DATABASE_URL=mssql+pyodbc://sqladmin:YourPass123!@sanbong-uit.database.windows.net:1433/san_bong?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no
```

⚠️ Password có ký tự đặc biệt phải URL-encode: `@` → `%40`, `!` → `%21`, `#` → `%23`, `$` → `%24`.

**4) Test connection:**

```bash
python test_azure_connection.py
```

**5) Khởi tạo schema + seed:**

```bash
python init_db.py    # tạo 9 tables
python seed.py       # seed data demo
```

Driver `pyodbc` đã có sẵn trong `requirements.txt`. Schema gồm 9 bảng: `users`, `fields`, `services`, `bookings`, `booking_services`, `invoices` (track refund status), `memberships`, `shifts`, `feedbacks`. Refund flow track qua `invoices.trang_thai` với 4 trạng thái: `CHUA_THANH_TOAN`, `DA_THANH_TOAN`, `CHO_HOAN_TIEN` (Pending Refund), `HOAN_TIEN` (Refunded).

#### Init schema bằng SQL thủ công

Chỉ với MySQL (Azure SQL syntax khác — dùng `init_db.py`):

```bash
mysql -u sanbong -p san_bong < schema.sql
```

### 2) Cài & chạy Frontend

Mở terminal mới:

```bash
cd frontend

# Cài thư viện
npm install

# (Tuỳ chọn) Tạo file .env.local nếu backend chạy port khác
cp .env.local.example .env.local

# Chạy dev server
npm run dev
```

Frontend chạy tại: **http://localhost:3000**

## 🔐 Tài khoản demo

Sau khi chạy `python seed.py`, các tài khoản sau được tạo sẵn:

| Vai trò | Email | Mật khẩu | Ghi chú |
|---|---|---|---|
| **Admin** | `admin@sanbong.vn` | `admin123` | Toàn quyền |
| **Quản lý** | `quanly@sanbong.vn` | `quanly123` | Quản trị + báo cáo |
| **Nhân viên** | `nva@sanbong.vn` | `nhanvien123` | Vận hành |
| **Nhân viên** | `nvb@sanbong.vn` | `nhanvien123` | Vận hành |
| **Khách hàng** | `khach@gmail.com` | `khach1234` | Khách thường |
| **Khách VIP** | `quen@gmail.com` | `khach1234` | Có thẻ Vàng (giảm 10%) |

## ✨ 9 module chức năng

1. **Quản lý hệ thống** — Tài khoản, phân quyền 4 cấp (Admin / Quản lý / Nhân viên / Khách hàng).
2. **Quản lý sân** — CRUD sân (5/7/11 người), trạng thái Hoạt động / Bảo trì / Đóng cửa.
3. **Đặt & hủy lịch** — Lưới lịch trực quan, kiểm tra xung đột, chính sách hủy (>24h hoàn 50%).
4. **Thành viên** — Thẻ Bạc 5% / Vàng 10% / Bạch Kim 15%, gia hạn 1–12 tháng, khuyến mãi theo gói.
5. **Dịch vụ đi kèm** — Thuê giày, nước uống... với tồn kho, tự trừ khi đặt.
6. **Thanh toán & hóa đơn** — Tạo hóa đơn tự động, hỗ trợ Tiền mặt + Chuyển khoản, hoàn tiền khi hủy.
7. **Phân ca nhân viên** — Ca Sáng / Chiều, gắn sân phụ trách, lập trước ≥24h.
8. **Feedback** — Đánh giá 4 chiều (Tổng / Cơ sở / Nhân viên / Dịch vụ), bộ lọc theo sao.
9. **Báo cáo & thống kê** — Doanh thu theo ngày/tuần/tháng (biểu đồ), xếp hạng sân, khung giờ cao điểm.

## 📐 Quy định nghiệp vụ

- **Giờ cao điểm:** 17:00 – 22:00 (giá riêng)
- **Đặt sân:** tối thiểu 30 phút (0.5h), tối đa 3h, bước 30 phút
- **Slot duration:** linh hoạt — 0.5h, 1h, 1.5h, 2h, 2.5h, 3h
- **Hủy >24h:** hoàn 50% tiền sân
- **Hủy <24h:** không hoàn tiền
- **Phân ca:** lập tối thiểu 24h trước
- **Email reminder:** tự động gửi 30 phút trước giờ chơi
- **Email login/register:** bắt buộc `@gmail.com` (trừ tài khoản staff `@sanbong.vn`)

## 🏆 Hệ thống Tier Thành Viên (tự động)

Tier được **tự tính theo tổng tiền sân đã chi** (lifetime spend từ các booking hoàn thành), không cần đăng ký:

| Tier | Mốc tích lũy | Giảm giá |
|---|---|---|
| Thường | 0đ | 0% |
| 🥈 **Bạc** | > 1.000.000đ | 5% |
| 🥇 **Vàng** | > 3.000.000đ | 10% |
| 💎 **Kim Cương** | > 7.000.000đ | 15% |

- Discount tự áp dụng vào tiền sân mỗi lần đặt (không áp cho dịch vụ)
- Trang `/membership`: card thẻ thành viên + progress bar tới mốc kế tiếp

## 🔄 Auto-Restock Đồ Thuê

- Service có flag `la_cho_thue=true` (giày, áo tập) → khi booking **hoàn thành**, tồn kho tự cộng lại số lượng đã thuê
- Service `la_cho_thue=false` (nước, đồ tiêu hao) → trừ kho vĩnh viễn
- Admin có thể bật/tắt flag này khi tạo/sửa dịch vụ

## 🔍 Booking Audit (Admin/Staff)

Trang `/admin/bookings` có search bar:
- Tìm theo mã booking, tên khách, SĐT, email
- Lọc theo trạng thái + khoảng ngày
- Khách hàng chỉ thấy booking của riêng mình

## 📧 Cấu hình Email Reminder (tuỳ chọn)

Mặc định: reminder được **log ra console** terminal backend (đủ dùng demo).

Để gửi **email thật** qua Gmail:
1. Bật 2FA: https://myaccount.google.com/security
2. Tạo App Password: https://myaccount.google.com/apppasswords
3. Copy `backend/.env.example` → `backend/.env` rồi điền:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-16-char-app-password
SMTP_FROM=Sân Bóng UIT <your@gmail.com>
```
4. Restart backend → reminder sẽ gửi qua Gmail thật.

Reminder logic:
- Background scheduler quét DB mỗi 60 giây
- Tìm bookings có `gio_bat_dau` cách hiện tại ~30 phút (cửa sổ ±5 phút)
- Chỉ gửi 1 lần (flag `reminder_sent`)
- Admin có thể force gửi ngay qua endpoint `POST /api/bookings/{id}/send-reminder-now`

## 🧪 Kiểm thử nhanh

1. Truy cập http://localhost:3000 → bấm **"Đặt sân ngay"**
2. Chọn ngày, bấm vào ô **xanh** (còn trống) → đặt sân
3. Đăng nhập bằng admin → vào **/admin** xem dashboard, báo cáo, biểu đồ
4. Đăng nhập bằng `quen@gmail.com` → đặt sân để thấy giảm giá 10% từ thẻ Vàng

## 🐛 Khắc phục sự cố thường gặp

### ❗ Lỗi 1: Login/Register "không phản hồi", hoặc Booking page kẹt loading
**Nguyên nhân:** Database trống — chưa chạy `seed.py` hoặc DB bị xoá.

**Fix:** Chạy lại seed:
```bash
cd backend
rm san_bong.db      # (Windows: del san_bong.db)
python seed.py
# Rồi restart backend
```

Hoặc dùng quickstart script:
- **Mac/Linux:** `bash backend/quickstart.sh`
- **Windows:** double-click `backend/quickstart.bat`

### ❗ Lỗi 2: "Không kết nối được tới backend"
**Nguyên nhân:** Backend chưa chạy hoặc sai cổng.

**Fix:**
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```
Sau đó mở http://localhost:8000/api/health — phải thấy `{"status":"ok"}`.

### ❗ Lỗi khác
- **`bcrypt` install fail:** thử `pip install bcrypt==4.2.0 --break-system-packages`
- **Port 8000/3000 bận:** đổi port bằng `--port 8001` (uvicorn) hoặc `PORT=3001 npm run dev`
- **CORS:** backend đã mở `localhost:3000`. Đổi nếu frontend chạy port khác trong `app/main.py`.
- **Frontend cache cũ:** xoá `frontend/.next/` rồi `npm run dev` lại.

## 👥 Thành viên nhóm

- Ngô Hoàng Khang — 24520748
- Võ Huy Khang — 24520772
- Võ Thanh Nguyên Khang — 24520773
- Nguyễn Đỗ Hoàng Khang — 24520754

---

*© 2025 — Đồ án SE104 • UIT*
