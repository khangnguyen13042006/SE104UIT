-- =====================================================
-- San Bong UIT — MySQL Schema
-- Tự động sinh từ SQLAlchemy models
-- =====================================================

CREATE DATABASE IF NOT EXISTS san_bong CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE san_bong;


CREATE TABLE users (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	ho_ten VARCHAR(100) NOT NULL, 
	email VARCHAR(100) NOT NULL, 
	sdt VARCHAR(15) NOT NULL, 
	mat_khau_hash VARCHAR(255) NOT NULL, 
	vai_tro ENUM('ADMIN','QUAN_LY','NHAN_VIEN','KHACH_HANG') NOT NULL, 
	trang_thai ENUM('HOAT_DONG','VO_HIEU_HOA') NOT NULL, 
	ngay_tao DATETIME, 
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE fields (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	ten_san VARCHAR(100) NOT NULL, 
	loai_san ENUM('SAN_5','SAN_7','SAN_11') NOT NULL, 
	suc_chua INTEGER NOT NULL, 
	gia_tieu_chuan NUMERIC(12, 2) NOT NULL, 
	gia_cao_diem NUMERIC(12, 2) NOT NULL, 
	mo_ta TEXT, 
	trang_thai ENUM('HOAT_DONG','BAO_TRI','DONG_CUA') NOT NULL, 
	ngay_tao DATETIME, 
	PRIMARY KEY (id), 
	UNIQUE (ten_san)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE services (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	ten_dich_vu VARCHAR(100) NOT NULL, 
	don_gia NUMERIC(12, 2) NOT NULL, 
	don_vi_tinh VARCHAR(20) NOT NULL, 
	ton_kho INTEGER NOT NULL, 
	la_cho_thue BOOL NOT NULL, 
	trang_thai ENUM('HOAT_DONG','NGUNG_KINH_DOANH') NOT NULL, 
	ngay_tao DATETIME, 
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE bookings (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	ma_dat_san VARCHAR(20) NOT NULL, 
	san_id INTEGER NOT NULL, 
	khach_hang_id INTEGER, 
	ten_khach_vang_lai VARCHAR(100), 
	sdt_khach_vang_lai VARCHAR(15), 
	email_khach_vang_lai VARCHAR(120), 
	reminder_sent BOOL NOT NULL, 
	ngay_dat DATE NOT NULL, 
	gio_bat_dau TIME NOT NULL, 
	gio_ket_thuc TIME NOT NULL, 
	so_gio FLOAT NOT NULL, 
	tien_san NUMERIC(12, 2) NOT NULL, 
	ghi_chu TEXT, 
	hinh_thuc_thanh_toan ENUM('TIEN_MAT','CHUYEN_KHOAN') NOT NULL, 
	trang_thai ENUM('CHO_XAC_NHAN','DA_XAC_NHAN','DANG_SU_DUNG','HOAN_THANH','HUY') NOT NULL, 
	ly_do_huy TEXT, 
	hoan_tien BOOL NOT NULL, 
	nguoi_tao_id INTEGER, 
	ngay_tao DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(san_id) REFERENCES fields (id), 
	FOREIGN KEY(khach_hang_id) REFERENCES users (id), 
	FOREIGN KEY(nguoi_tao_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE booking_services (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	booking_id INTEGER NOT NULL, 
	dich_vu_id INTEGER NOT NULL, 
	so_luong INTEGER NOT NULL, 
	don_gia NUMERIC(12, 2) NOT NULL, 
	thanh_tien NUMERIC(12, 2) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(booking_id) REFERENCES bookings (id), 
	FOREIGN KEY(dich_vu_id) REFERENCES services (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE invoices (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	ma_hoa_don VARCHAR(20) NOT NULL, 
	booking_id INTEGER NOT NULL, 
	tien_san NUMERIC(12, 2) NOT NULL, 
	tien_dich_vu NUMERIC(12, 2) NOT NULL, 
	giam_gia NUMERIC(12, 2) NOT NULL, 
	tong_cong NUMERIC(12, 2) NOT NULL, 
	hinh_thuc_thanh_toan ENUM('TIEN_MAT','CHUYEN_KHOAN') NOT NULL, 
	trang_thai ENUM('CHUA_THANH_TOAN','DA_THANH_TOAN','CHO_HOAN_TIEN','HOAN_TIEN') NOT NULL, 
	ngay_xuat DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(booking_id) REFERENCES bookings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE memberships (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	khach_hang_id INTEGER NOT NULL, 
	loai_the ENUM('THUONG','BAC','VANG','KIM_CUONG') NOT NULL, 
	ngay_bat_dau DATE NOT NULL, 
	ngay_ket_thuc DATE NOT NULL, 
	phi_the NUMERIC(12, 2) NOT NULL, 
	trang_thai VARCHAR(20), 
	ngay_tao DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(khach_hang_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE shifts (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	nhan_vien_id INTEGER NOT NULL, 
	ngay DATE NOT NULL, 
	ca_truc ENUM('SANG','CHIEU') NOT NULL, 
	san_phu_trach VARCHAR(200), 
	ghi_chu TEXT, 
	ngay_tao DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(nhan_vien_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE feedbacks (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	booking_id INTEGER NOT NULL, 
	khach_hang_id INTEGER, 
	danh_gia_tong INTEGER NOT NULL, 
	danh_gia_co_so INTEGER, 
	danh_gia_nhan_vien INTEGER, 
	danh_gia_dich_vu INTEGER, 
	nhan_xet TEXT, 
	ngay_tao DATETIME, 
	PRIMARY KEY (id), 
	UNIQUE (booking_id), 
	FOREIGN KEY(booking_id) REFERENCES bookings (id), 
	FOREIGN KEY(khach_hang_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

