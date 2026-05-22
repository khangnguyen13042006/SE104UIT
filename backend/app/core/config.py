from enum import Enum

# JWT
SECRET_KEY = "san-bong-secret-key-doi-thanh-cua-ban-trong-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

class UserRole(str, Enum):
    ADMIN = "ADMIN"
    QUAN_LY = "QUAN_LY"
    NHAN_VIEN = "NHAN_VIEN"
    KHACH_HANG = "KHACH_HANG"

class UserStatus(str, Enum):
    HOAT_DONG = "HOAT_DONG"
    VO_HIEU_HOA = "VO_HIEU_HOA"

class FieldType(str, Enum):
    SAN_5 = "SAN_5"
    SAN_7 = "SAN_7"
    SAN_11 = "SAN_11"

class FieldStatus(str, Enum):
    HOAT_DONG = "HOAT_DONG"
    BAO_TRI = "BAO_TRI"
    DONG_CUA = "DONG_CUA"

class BookingStatus(str, Enum):
    CHO_XAC_NHAN = "CHO_XAC_NHAN"
    DA_XAC_NHAN = "DA_XAC_NHAN"
    DANG_SU_DUNG = "DANG_SU_DUNG"
    HOAN_THANH = "HOAN_THANH"
    HUY = "HUY"

class PaymentMethod(str, Enum):
    TIEN_MAT = "TIEN_MAT"
    CHUYEN_KHOAN = "CHUYEN_KHOAN"

class PaymentStatus(str, Enum):
    CHUA_THANH_TOAN = "CHUA_THANH_TOAN"
    DA_THANH_TOAN = "DA_THANH_TOAN"
    CHO_HOAN_TIEN = "CHO_HOAN_TIEN"
    HOAN_TIEN = "HOAN_TIEN"
    HUY = "HUY"  # <--- KHANG ĐÃ THÊM DÒNG NÀY ĐỂ FIX LỖI 500

class MembershipType(str, Enum):
    THUONG = "THUONG"
    BAC = "BAC"
    VANG = "VANG"
    KIM_CUONG = "KIM_CUONG"

class ServiceStatus(str, Enum):
    HOAT_DONG = "HOAT_DONG"
    NGUNG_KINH_DOANH = "NGUNG_KINH_DOANH"

class ShiftType(str, Enum):
    SANG = "SANG"
    CHIEU = "CHIEU"

# Giữ nguyên các cấu hình Threshold và Discount bên dưới của Khang...
MEMBERSHIP_THRESHOLD = {"BAC": 1_000_000, "VANG": 3_000_000, "KIM_CUONG": 7_000_000}
MEMBERSHIP_DISCOUNT = {"THUONG": 0.0, "BAC": 0.05, "VANG": 0.10, "KIM_CUONG": 0.15}
MEMBERSHIP_NAME = {"THUONG": "Thường", "BAC": "Bạc", "VANG": "Vàng", "KIM_CUONG": "Kim Cương"}
MEMBERSHIP_FEE = {"BAC": 200000, "VANG": 400000, "KIM_CUONG": 700000}
