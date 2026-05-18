# 🗄️ MySQL Database Setup

Hướng dẫn chuyển từ SQLite (default) sang MySQL cho production hoặc multi-user dev.

## 📋 Schema overview

Database `san_bong` lưu trữ:

| Bảng | Mục đích | Khóa chính |
|---|---|---|
| `users` | Tài khoản (admin, quản lý, nhân viên, khách hàng) | id |
| `fields` | Sân bóng | id |
| `bookings` | **Booking** (đặt sân) — lưu trạng thái + lý do hủy + `hoan_tien` flag | id, ma_dat_san |
| `booking_services` | **Bảng nối** booking ↔ services (nhiều-nhiều có qty) | id |
| `services` | Dịch vụ (giày, nước, áo) | id |
| `invoices` | **Hóa đơn** — lưu `trang_thai`: CHUA_THANH_TOAN / DA_THANH_TOAN / **CHO_HOAN_TIEN** / **HOAN_TIEN** | id, ma_hoa_don |
| `memberships` | Thẻ thành viên (legacy, tier giờ tính từ lifetime spend) | id |
| `shifts` | Phân ca nhân viên | id |
| `feedbacks` | Đánh giá | id |

### 🔁 Refund tracking

3 status workflow được lưu trong `invoices.trang_thai`:

```
DA_THANH_TOAN (paid)
    ↓ cancel với refund policy
CHO_HOAN_TIEN (Pending Refund)
    ↓ staff confirm-refund
HOAN_TIEN (Refunded)
```

Hoặc booking hủy không refund → `invoices.trang_thai` giữ nguyên (`DA_THANH_TOAN` hoặc `CHUA_THANH_TOAN`) + `bookings.hoan_tien = False`.

---

## 🚀 Setup steps

### 1. Cài MySQL Server

**Windows:**
- Tải MySQL Installer từ https://dev.mysql.com/downloads/installer/
- Chọn "MySQL Server" + "MySQL Workbench"
- Mật khẩu root: tự chọn (nhớ kỹ để ghi vào .env)

**macOS:**
```bash
brew install mysql
brew services start mysql
mysql_secure_installation  # set password
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
sudo mysql_secure_installation
```

### 2. Tạo database

```bash
mysql -u root -p
```

Trong MySQL shell:
```sql
CREATE DATABASE san_bong CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sanbong_user'@'localhost' IDENTIFIED BY 'sanbong_pass_123';
GRANT ALL PRIVILEGES ON san_bong.* TO 'sanbong_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3. Cấu hình .env

Tạo file `backend/.env`:
```
DATABASE_URL=mysql+pymysql://sanbong_user:sanbong_pass_123@localhost:3306/san_bong
```

> ⚠️ Nếu password có ký tự đặc biệt (@, :, /, %), URL-encode: `%40`, `%3A`, `%2F`, `%25`.

### 4. Cài driver Python

`pymysql` đã có trong `requirements.txt`. Cài lại nếu chưa:
```bash
cd backend
pip install -r requirements.txt
```

### 5. Khởi tạo schema + seed

```bash
cd backend
python seed.py
```

Script sẽ:
- Tạo tất cả bảng tự động (SQLAlchemy `Base.metadata.create_all`)
- Insert dữ liệu mẫu: 6 sân, 4 users (admin/QL/NV/khách), 5 booking, 8 dịch vụ, ca trực

### 6. Chạy backend

```bash
uvicorn app.main:app --reload
```

Endpoint check: http://localhost:8000/api/debug/db

---

## 🐛 Troubleshooting

**`Access denied for user`**
- Verify password trong `.env` đúng
- Test login thủ công: `mysql -u sanbong_user -p`

**`Unknown database 'san_bong'`**
- Chưa tạo DB ở bước 2. Vào MySQL shell và `CREATE DATABASE san_bong;`

**`(2003, "Can't connect to MySQL server")`**
- MySQL server chưa chạy. Linux: `sudo systemctl start mysql`. Mac: `brew services start mysql`

**`OperationalError: (1366, "Incorrect string value...")`**
- DB không phải utf8mb4. Drop và tạo lại với `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`

**`ModuleNotFoundError: No module named 'pymysql'`**
- `pip install pymysql cryptography`

**Connection drops sau khi idle**
- Đã config `pool_pre_ping=True` và `pool_recycle=3600` trong `app/core/database.py`. Nếu vẫn lỗi, tăng `wait_timeout` trong `my.cnf` của MySQL.

---

## 🔄 Switch back to SQLite

Xóa hoặc comment dòng `DATABASE_URL` trong `.env`. Backend sẽ fallback sang `sqlite:///./san_bong.db`.

---

## 🐳 Docker MySQL (1-command setup)

Không muốn cài MySQL local, dùng Docker:

```bash
docker run -d \
  --name san-bong-mysql \
  -e MYSQL_ROOT_PASSWORD=root123 \
  -e MYSQL_DATABASE=san_bong \
  -e MYSQL_USER=sanbong_user \
  -e MYSQL_PASSWORD=sanbong_pass_123 \
  -p 3306:3306 \
  -v san-bong-mysql-data:/var/lib/mysql \
  mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci
```

Sau khi container chạy (~30 giây để init), set `.env` rồi `python seed.py`.

Stop / start lại: `docker stop san-bong-mysql` / `docker start san-bong-mysql`.

---

## 📦 Migration từ SQLite sang MySQL

Nếu đã có data trong SQLite muốn chuyển sang MySQL:

```bash
# 1. Export data từ SQLite
pip install pgloader  # hoặc dùng sqlite3-to-mysql
sqlite3 san_bong.db .dump > dump.sql

# 2. Convert syntax (manual edit nếu cần) - SQLite syntax khác MySQL
# Hoặc dùng tool: https://github.com/dumblob/mysql2sqlite (chiều ngược lại)

# Cách đơn giản hơn: viết script Python copy từ SQLite session sang MySQL session
```

Script Python migration đơn giản (`backend/migrate_sqlite_to_mysql.py`):
```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, User, Field, Booking, Service, BookingService, Invoice, Membership, Shift, Feedback

SQLITE_URL = "sqlite:///./san_bong.db"
MYSQL_URL = os.getenv("DATABASE_URL")  # set trong .env trước khi chạy

src = create_engine(SQLITE_URL)
dst = create_engine(MYSQL_URL)
Base.metadata.create_all(dst)

SrcSession = sessionmaker(bind=src)()
DstSession = sessionmaker(bind=dst)()

for Model in [User, Field, Service, Membership, Booking, BookingService, Invoice, Shift, Feedback]:
    for row in SrcSession.query(Model).all():
        DstSession.merge(row)
    DstSession.commit()
    print(f"✓ {Model.__tablename__}")

print("Migration done!")
```

Chạy:
```bash
DATABASE_URL=mysql+pymysql://user:pass@host/san_bong python migrate_sqlite_to_mysql.py
```
