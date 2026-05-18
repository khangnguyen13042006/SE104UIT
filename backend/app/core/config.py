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
    CHO_HOAN_TIEN = "CHO_HOAN_TIEN"  # Booking đã hủy, đang chờ staff xác nhận hoàn tiền
    HOAN_TIEN = "HOAN_TIEN"  # Đã hoàn tiền xong


class MembershipType(str, Enum):
    THUONG = "THUONG"      # mặc định khi chưa đủ doanh thu
    BAC = "BAC"            # > 1.000.000 VND
    VANG = "VANG"          # > 3.000.000 VND
    KIM_CUONG = "KIM_CUONG"  # > 7.000.000 VND


class ServiceStatus(str, Enum):
    HOAT_DONG = "HOAT_DONG"
    NGUNG_KINH_DOANH = "NGUNG_KINH_DOANH"


class ShiftType(str, Enum):
    SANG = "SANG"
    CHIEU = "CHIEU"


# Membership tier theo TỔNG DOANH THU TÍCH LŨY (lifetime spend)
# Mốc: > 1.000.000 → Bạc, > 3.000.000 → Vàng, > 7.000.000 → Kim cương
MEMBERSHIP_THRESHOLD = {
    "BAC": 1_000_000,
    "VANG": 3_000_000,
    "KIM_CUONG": 7_000_000,
}

# Discount %
MEMBERSHIP_DISCOUNT = {
    "THUONG": 0.0,
    "BAC": 0.05,
    "VANG": 0.10,
    "KIM_CUONG": 0.15,
}

# Tên hiển thị
MEMBERSHIP_NAME = {
    "THUONG": "Thường",
    "BAC": "Bạc",
    "VANG": "Vàng",
    "KIM_CUONG": "Kim Cương",
}

# Phí gia hạn cũ (giữ để backward compat với router memberships có sẵn)
MEMBERSHIP_FEE = {
    "BAC": 200000,
    "VANG": 400000,
    "KIM_CUONG": 700000,
}
