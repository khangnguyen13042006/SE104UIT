from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import date, time, datetime
from decimal import Decimal
from app.core.config import (
    UserRole, UserStatus, FieldType, FieldStatus,
    BookingStatus, PaymentMethod, PaymentStatus,
    MembershipType, ServiceStatus, ShiftType
)


# ============ AUTH ============
class UserRegister(BaseModel):
    ho_ten: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    sdt: str = Field(..., pattern=r"^0\d{9}$")
    mat_khau: str = Field(..., min_length=8)
    vai_tro: Optional[UserRole] = UserRole.KHACH_HANG

    @field_validator("mat_khau")
    @classmethod
    def password_strength(cls, v):
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Mật khẩu phải gồm cả chữ và số")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    mat_khau: str


class SendOtpRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    ho_ten: str
    email: str
    sdt: str
    vai_tro: UserRole
    trang_thai: UserStatus
    ngay_tao: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    ho_ten: Optional[str] = None
    sdt: Optional[str] = None
    vai_tro: Optional[UserRole] = None
    trang_thai: Optional[UserStatus] = None


# ============ FIELD ============
class FieldCreate(BaseModel):
    ten_san: str
    loai_san: FieldType
    suc_chua: int = Field(..., gt=0)
    gia_tieu_chuan: Decimal = Field(..., gt=0)
    gia_cao_diem: Decimal = Field(..., gt=0)
    mo_ta: Optional[str] = None
    trang_thai: FieldStatus = FieldStatus.HOAT_DONG

    @field_validator("gia_cao_diem")
    @classmethod
    def check_price(cls, v, info):
        if "gia_tieu_chuan" in info.data and v < info.data["gia_tieu_chuan"]:
            raise ValueError("Giá cao điểm phải >= giá tiêu chuẩn")
        return v


class FieldUpdate(BaseModel):
    ten_san: Optional[str] = None
    loai_san: Optional[FieldType] = None
    suc_chua: Optional[int] = None
    gia_tieu_chuan: Optional[Decimal] = None
    gia_cao_diem: Optional[Decimal] = None
    mo_ta: Optional[str] = None
    trang_thai: Optional[FieldStatus] = None


class FieldOut(BaseModel):
    id: int
    ten_san: str
    loai_san: FieldType
    suc_chua: int
    gia_tieu_chuan: Decimal
    gia_cao_diem: Decimal
    mo_ta: Optional[str]
    trang_thai: FieldStatus

    class Config:
        from_attributes = True


# ============ BOOKING ============
class BookingServiceItem(BaseModel):
    dich_vu_id: int
    so_luong: int = Field(..., gt=0)


class BookingCreate(BaseModel):
    san_id: int
    ngay_dat: date
    gio_bat_dau: time
    gio_ket_thuc: time
    ghi_chu: Optional[str] = None
    hinh_thuc_thanh_toan: PaymentMethod
    services: List[BookingServiceItem] = []
    # cho khách vãng lai (do nhân viên tạo)
    ten_khach_vang_lai: Optional[str] = None
    sdt_khach_vang_lai: Optional[str] = None


class BookingCancel(BaseModel):
    ly_do_huy: str = Field(..., min_length=3)
    hoan_tien: Optional[bool] = None  # CHỈ admin/staff được set. Khách hàng để None → server tự tính theo policy 24h.
    loi_tu_san: Optional[bool] = None  # CHỈ admin/quản lý: true = lỗi/sự cố từ sân → hoàn 100% (ghi đè hoan_tien)


class RefundInfoSubmit(BaseModel):
    stk_hoan_tien: str = Field(..., min_length=3)
    ten_tk_hoan_tien: str = Field(..., min_length=2)
    ngan_hang_hoan_tien: str = Field(..., min_length=2)


class RescheduleQuote(BaseModel):
    """Bảng tính đổi lịch (dùng cho cả xem trước và kết quả)."""
    tien_san_moi: Decimal
    tien_dich_vu: Decimal
    giam_gia_moi: Decimal
    tong_cu: Decimal
    tong_moi: Decimal
    da_thanh_toan: Decimal
    chenh_lech: Decimal  # tổng mới - đã thanh toán (âm/0 = không phải trả thêm)
    can_thanh_toan_them: Decimal  # phần phải trả thêm (>= 0)
    can_thanh_toan_ngay: bool  # true → chuyển khách sang trang thanh toán ngay sau khi đổi lịch


class BookingReschedule(BaseModel):
    ngay_dat: date
    gio_bat_dau: time
    gio_ket_thuc: time


class AvailabilityQuery(BaseModel):
    ngay: date
    loai_san: Optional[FieldType] = None


class BookingServiceOut(BaseModel):
    id: int
    dich_vu_id: int
    so_luong: int
    don_gia: Decimal
    thanh_tien: Decimal
    ten_dich_vu: Optional[str] = None

    class Config:
        from_attributes = True





class InvoiceSummary(BaseModel):
    id: int
    tien_san: Decimal
    tien_dich_vu: Decimal
    giam_gia: Decimal
    tong_cong: Decimal
    trang_thai: PaymentStatus
    so_tien_da_tt: Decimal = Decimal(0)  # đã thanh toán
    so_tien_can_tt: Decimal = Decimal(0)  # còn phải thanh toán (đơn chờ thanh toán / chênh lệch sau đổi lịch)

    class Config:
        from_attributes = True


class BookingOut(BaseModel):
    id: int
    ma_dat_san: str
    san_id: int
    ten_san: Optional[str] = None
    khach_hang_id: Optional[int]
    ten_khach: Optional[str] = None
    sdt_khach: Optional[str] = None
    ngay_dat: date
    gio_bat_dau: time
    gio_ket_thuc: time
    so_gio: float
    tien_san: Decimal
    ghi_chu: Optional[str]
    hinh_thuc_thanh_toan: PaymentMethod
    trang_thai: BookingStatus
    ly_do_huy: Optional[str]
    hoan_tien: bool = False
    ty_le_hoan_tien: Optional[float] = None
    so_tien_hoan: Optional[Decimal] = None  # số tiền phải hoàn (chỉ có khi đơn đã hủy)
    ngay_huy: Optional[datetime] = None
    stk_hoan_tien: Optional[str] = None
    ten_tk_hoan_tien: Optional[str] = None
    ngan_hang_hoan_tien: Optional[str] = None
    da_doi_lich: bool = False
    ngay_doi_lich_gan_nhat: Optional[datetime] = None
    ngay_tao: datetime
    han_thanh_toan: Optional[datetime] = None  # hạn thanh toán (UTC) — chỉ có khi đơn đang chờ thanh toán
    services: List[BookingServiceOut] = []
    invoice: Optional[InvoiceSummary] = None

    class Config:
        from_attributes = True


# ============ SERVICE ============
class ServiceCreate(BaseModel):
    ten_dich_vu: str
    don_gia: Decimal = Field(..., ge=0)
    don_vi_tinh: str
    ton_kho: int = Field(..., ge=0)
    la_cho_thue: bool = False
    trang_thai: ServiceStatus = ServiceStatus.HOAT_DONG


class ServiceUpdate(BaseModel):
    ten_dich_vu: Optional[str] = None
    don_gia: Optional[Decimal] = None
    don_vi_tinh: Optional[str] = None
    ton_kho: Optional[int] = None
    la_cho_thue: Optional[bool] = None
    trang_thai: Optional[ServiceStatus] = None


class ServiceOut(BaseModel):
    id: int
    ten_dich_vu: str
    don_gia: Decimal
    don_vi_tinh: str
    ton_kho: int
    la_cho_thue: bool
    trang_thai: ServiceStatus

    class Config:
        from_attributes = True


# ============ MEMBERSHIP ============
class MembershipCreate(BaseModel):
    loai_the: MembershipType
    thoi_han_thang: int = Field(..., ge=1, le=12)


class MembershipOut(BaseModel):
    id: int
    khach_hang_id: int
    loai_the: MembershipType
    ngay_bat_dau: date
    ngay_ket_thuc: date
    phi_the: Decimal
    trang_thai: str

    class Config:
        from_attributes = True


# ============ INVOICE ============
class InvoiceOut(BaseModel):
    id: int
    ma_hoa_don: str
    booking_id: int
    tien_san: Decimal
    tien_dich_vu: Decimal
    giam_gia: Decimal
    tong_cong: Decimal
    hinh_thuc_thanh_toan: PaymentMethod
    trang_thai: PaymentStatus
    ngay_xuat: datetime

    class Config:
        from_attributes = True


class InvoicePayment(BaseModel):
    trang_thai: PaymentStatus


# ============ SHIFT ============
class ShiftCreate(BaseModel):
    nhan_vien_id: int
    ngay: date
    ca_truc: ShiftType
    san_phu_trach: Optional[List[int]] = []
    ghi_chu: Optional[str] = None
    force: Optional[bool] = False  # Bỏ qua warning trùng ca trong ngày


class ShiftOut(BaseModel):
    id: int
    nhan_vien_id: int
    ten_nhan_vien: Optional[str] = None
    ngay: date
    ca_truc: ShiftType
    san_phu_trach: Optional[str]
    ghi_chu: Optional[str]

    class Config:
        from_attributes = True


# ============ FEEDBACK ============
class FeedbackCreate(BaseModel):
    booking_id: int
    danh_gia_tong: int = Field(..., ge=1, le=5)
    danh_gia_co_so: Optional[int] = Field(None, ge=1, le=5)
    danh_gia_nhan_vien: Optional[int] = Field(None, ge=1, le=5)
    danh_gia_dich_vu: Optional[int] = Field(None, ge=1, le=5)
    nhan_xet: Optional[str] = Field(None, max_length=500)


class FeedbackOut(BaseModel):
    id: int
    booking_id: int
    ma_dat_san: Optional[str] = None
    ten_san: Optional[str] = None
    ten_khach: Optional[str] = None
    danh_gia_tong: int
    danh_gia_co_so: Optional[int]
    danh_gia_nhan_vien: Optional[int]
    danh_gia_dich_vu: Optional[int]
    nhan_xet: Optional[str]
    ngay_tao: datetime

    class Config:
        from_attributes = True


# ============ REPORTS ============
class ReportQuery(BaseModel):
    ngay_bat_dau: date
    ngay_ket_thuc: date
    nhom_theo: Optional[str] = "NGAY"  # NGAY / TUAN / THANG


class RevenueReportItem(BaseModel):
    label: str
    tien_san: float
    tien_dich_vu: float
    tong: float


class RevenueReport(BaseModel):
    tong_doanh_thu: float
    doanh_thu_tien_san: float
    doanh_thu_dich_vu: float
    doanh_thu_tb_ngay: float
    chi_tiet: List[RevenueReportItem]


class FieldRankingItem(BaseModel):
    san_id: int
    ten_san: str
    tong_luot_dat: int
    ty_le_lap_day: float
    doanh_thu: float
    xep_hang: int


class PeakHourItem(BaseModel):
    khung_gio: str
    tong_luot_dat: int
    ty_le_lap_day: float


class SummaryReport(BaseModel):
    tong_luot_dat: int
    tong_doanh_thu: float
    doanh_thu_tb_ngay: float
    san_dat_nhieu_nhat: Optional[str]
    khung_gio_cao_diem: Optional[str]
    tong_khach_hang: int
    tong_dich_vu: int
    ty_le_lap_day: float


Token.model_rebuild()
