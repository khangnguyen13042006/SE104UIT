# ============================================================================
# Sân Bóng UIT — Backend Configuration
# ============================================================================
# Copy file này thành `.env` rồi điền giá trị thật:
#   cp .env.example .env

# ============ CORS (cho Vercel frontend) ============
# Danh sách origin được phép, ngăn cách bằng dấu phẩy
# Default đã include https://se104uit.vercel.app
ALLOWED_ORIGINS=https://se104uit.vercel.app,http://localhost:3000

# ============ DATABASE ============
# Mặc định: SQLite (file san_bong.db, không cần config)

# ── Option A: SQLite (dev local) ─────────────────────────────────
# (Để trống DATABASE_URL → tự dùng SQLite)

# ── Option B: Azure SQL Database (PRODUCTION - đang dùng) ─────────
# User: adminK
# Password: Khang@123 (đã URL-encode `@` → `%40` thành Khang%40123)
# Thay <YOUR_AZURE_SERVER> bằng tên server thật, vd: sanbong-uit
DATABASE_URL=mssql+pyodbc://adminK:Khang%40123@<YOUR_AZURE_SERVER>.database.windows.net:1433/san_bong?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no&Connection+Timeout=30

# ⚠️ Lưu ý quan trọng về URL-encoding password:
#   @ → %40,  ! → %21,  # → %23,  $ → %24,  & → %26,  + → %2B,  / → %2F
#   Khang@123  ──►  Khang%40123

# Setup Azure SQL trước khi connect:
#   1. Portal → SQL Database → Networking → Add current client IP
#   2. Set "Allow Azure services" = Yes (Render IPs sẽ được cho qua)
#   3. Cài ODBC Driver 18 trên máy dev (https://aka.ms/odbcdriver)

# ── Option C: MySQL (alternative production) ─────────────────────
# DATABASE_URL=mysql+pymysql://sanbong:password@host:3306/san_bong

# ── Debug ─────────────────────────────────────────────────────────
# SQL_ECHO=true

# ============ SMTP — Email reminder (TUỲ CHỌN) ============
# Nếu để trống → reminder log ra console, không gửi mail thật
# Gmail: 1) Bật 2FA  2) Tạo App Password  3) Điền dưới đây
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-char-app-password
SMTP_FROM=Sân Bóng UIT <your-email@gmail.com>
