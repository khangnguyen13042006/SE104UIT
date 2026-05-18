-- ============================================================================
-- Sân Bóng UIT — MySQL Schema (Manual DDL)
-- ============================================================================
-- Sử dụng nếu muốn quản lý schema thủ công thay vì dùng init_db.py
-- 
-- Cách dùng:
--   1. CREATE DATABASE san_bong CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   2. USE san_bong;
--   3. SOURCE schema.sql;
--   4. python seed.py để có data demo
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============ USERS ============
CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    ho_ten          VARCHAR(100) NOT NULL,
    email           VARCHAR(100) NOT NULL UNIQUE,
    sdt             VARCHAR(20)  NOT NULL UNIQUE,
    mat_khau_hash   VARCHAR(255) NOT NULL,
    vai_tro         ENUM('ADMIN', 'QUAN_LY', 'NHAN_VIEN', 'KHACH_HANG') NOT NULL,
    trang_thai      ENUM('HOAT_DONG', 'VO_HIEU_HOA') NOT NULL DEFAULT 'HOAT_DONG',
    ngay_tao        DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_role (vai_tro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ FIELDS (Sân bóng) ============
CREATE TABLE IF NOT EXISTS fields (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    ten_san         VARCHAR(100) NOT NULL,
    loai_san        ENUM('SAN_5', 'SAN_7', 'SAN_11') NOT NULL,
    suc_chua        INT NOT NULL,
    gia_tieu_chuan  DECIMAL(12,2) NOT NULL,
    gia_cao_diem    DECIMAL(12,2) NOT NULL,
    mo_ta           TEXT,
    trang_thai      ENUM('HOAT_DONG', 'BAO_TRI', 'DONG_CUA') NOT NULL DEFAULT 'HOAT_DONG',
    ngay_tao        DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ SERVICES (Dịch vụ) ============
CREATE TABLE IF NOT EXISTS services (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    ten_dich_vu     VARCHAR(100) NOT NULL,
    don_gia         DECIMAL(12,2) NOT NULL,
    don_vi_tinh     VARCHAR(20) NOT NULL,
    ton_kho         INT NOT NULL DEFAULT 0,
    la_cho_thue     BOOLEAN NOT NULL DEFAULT FALSE,
    trang_thai      ENUM('HOAT_DONG', 'NGUNG_KINH_DOANH') NOT NULL DEFAULT 'HOAT_DONG',
    ngay_tao        DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ BOOKINGS ============
CREATE TABLE IF NOT EXISTS bookings (
    id                          INT AUTO_INCREMENT PRIMARY KEY,
    ma_dat_san                  VARCHAR(20) NOT NULL UNIQUE,
    san_id                      INT NOT NULL,
    khach_hang_id               INT,
    ten_khach_vang_lai          VARCHAR(100),
    sdt_khach_vang_lai          VARCHAR(20),
    email_khach_vang_lai        VARCHAR(100),
    reminder_sent               BOOLEAN NOT NULL DEFAULT FALSE,
    ngay_dat                    DATE NOT NULL,
    gio_bat_dau                 TIME NOT NULL,
    gio_ket_thuc                TIME NOT NULL,
    so_gio                      FLOAT NOT NULL,
    tien_san                    DECIMAL(12,2) NOT NULL,
    ghi_chu                     TEXT,
    ly_do_huy                   TEXT,
    hoan_tien                   BOOLEAN NOT NULL DEFAULT FALSE,
    nguoi_tao_id                INT,
    hinh_thuc_thanh_toan        ENUM('TIEN_MAT', 'CHUYEN_KHOAN') NOT NULL,
    trang_thai                  ENUM('CHO_XAC_NHAN', 'DA_XAC_NHAN', 'DANG_SU_DUNG', 'HOAN_THANH', 'HUY') NOT NULL DEFAULT 'CHO_XAC_NHAN',
    ngay_tao                    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (san_id) REFERENCES fields(id),
    FOREIGN KEY (khach_hang_id) REFERENCES users(id),
    FOREIGN KEY (nguoi_tao_id) REFERENCES users(id),
    INDEX idx_bookings_date (ngay_dat),
    INDEX idx_bookings_status (trang_thai),
    INDEX idx_bookings_khach (khach_hang_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ BOOKING_SERVICES (Junction: many-to-many với số lượng) ============
CREATE TABLE IF NOT EXISTS booking_services (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    booking_id  INT NOT NULL,
    dich_vu_id  INT NOT NULL,
    so_luong    INT NOT NULL,
    don_gia     DECIMAL(12,2) NOT NULL,
    thanh_tien  DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (dich_vu_id) REFERENCES services(id),
    INDEX idx_bs_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ INVOICES (Hóa đơn) — track refund status ============
CREATE TABLE IF NOT EXISTS invoices (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    ma_hoa_don      VARCHAR(20) NOT NULL UNIQUE,
    booking_id      INT NOT NULL,
    tien_san        DECIMAL(12,2) NOT NULL,
    tien_dich_vu    DECIMAL(12,2) NOT NULL DEFAULT 0,
    giam_gia        DECIMAL(12,2) NOT NULL DEFAULT 0,
    tong_cong       DECIMAL(12,2) NOT NULL,
    trang_thai      ENUM('CHUA_THANH_TOAN', 'DA_THANH_TOAN', 'CHO_HOAN_TIEN', 'HOAN_TIEN') NOT NULL DEFAULT 'CHUA_THANH_TOAN',
    ngay_tao        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    INDEX idx_inv_status (trang_thai),
    INDEX idx_inv_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ MEMBERSHIPS (Legacy, có thể không dùng nếu tier theo lifetime spend) ============
CREATE TABLE IF NOT EXISTS memberships (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    khach_hang_id   INT NOT NULL,
    loai_the        ENUM('THUONG', 'BAC', 'VANG', 'KIM_CUONG') NOT NULL,
    ngay_bat_dau    DATE NOT NULL,
    ngay_ket_thuc   DATE NOT NULL,
    phi_the         DECIMAL(12,2) NOT NULL,
    trang_thai      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    ngay_tao        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (khach_hang_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ SHIFTS (Ca trực) ============
CREATE TABLE IF NOT EXISTS shifts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    nhan_vien_id    INT NOT NULL,
    ngay            DATE NOT NULL,
    ca_truc         ENUM('SANG', 'CHIEU') NOT NULL,
    san_phu_trach   VARCHAR(100),
    ghi_chu         TEXT,
    ngay_tao        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (nhan_vien_id) REFERENCES users(id),
    INDEX idx_shifts_ngay (ngay),
    INDEX idx_shifts_nv (nhan_vien_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ FEEDBACKS (Đánh giá) ============
CREATE TABLE IF NOT EXISTS feedbacks (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    booking_id              INT NOT NULL,
    khach_hang_id           INT,
    danh_gia_co_so          INT NOT NULL,
    danh_gia_nhan_vien      INT NOT NULL,
    danh_gia_dich_vu        INT NOT NULL,
    danh_gia_tong           INT NOT NULL,
    nhan_xet                TEXT,
    ngay_tao                DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (khach_hang_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- Hoàn tất schema! Chạy `python seed.py` để có data demo.
-- ============================================================================
