from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Date, Time, Boolean,
    ForeignKey, Text, Enum as SQLEnum, Numeric
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
from app.core.config import (
    UserRole, UserStatus, FieldType, FieldStatus,
    BookingStatus, PaymentMethod, PaymentStatus,
    MembershipType, ServiceStatus, ShiftType, DEFAULT_LUONG_CA
)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    ho_ten = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    sdt = Column(String(15), unique=True, index=True, nullable=False)
    mat_khau_hash = Column(String(255), nullable=False)
    vai_tro = Column(SQLEnum(UserRole), nullable=False, default=UserRole.KHACH_HANG)
    trang_thai = Column(SQLEnum(UserStatus), nullable=False, default=UserStatus.HOAT_DONG)
    ngay_tao = Column(DateTime, default=datetime.utcnow)
    # Chỉ dùng cho NHAN_VIEN: lương hiện hành mỗi ca (VND) và tình trạng làm việc (DANG_LAM/TAM_NGHI/DA_NGHI)
    luong_ca = Column(Integer, nullable=True, default=DEFAULT_LUONG_CA)
    tinh_trang_lam_viec = Column(String(20), nullable=True, default="DANG_LAM")

    bookings = relationship("Booking", back_populates="khach_hang", foreign_keys="Booking.khach_hang_id")
    memberships = relationship("Membership", back_populates="khach_hang")
    shifts = relationship("Shift", back_populates="nhan_vien")
    feedbacks = relationship("Feedback", back_populates="khach_hang")


class EmailOtp(Base):
    __tablename__ = "email_otps"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(120), nullable=False, index=True)
    ma_otp = Column(String(6), nullable=False)
    het_han = Column(DateTime, nullable=False)
    da_su_dung = Column(Boolean, nullable=False, default=False)
    ngay_tao = Column(DateTime, default=datetime.utcnow)


class Field(Base):
    __tablename__ = "fields"
    id = Column(Integer, primary_key=True, index=True)
    ten_san = Column(String(100), unique=True, nullable=False)
    loai_san = Column(SQLEnum(FieldType), nullable=False)
    suc_chua = Column(Integer, nullable=False)
    gia_tieu_chuan = Column(Numeric(12, 2), nullable=False)
    gia_cao_diem = Column(Numeric(12, 2), nullable=False)
    mo_ta = Column(Text)
    trang_thai = Column(SQLEnum(FieldStatus), nullable=False, default=FieldStatus.HOAT_DONG)
    ngay_tao = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("Booking", back_populates="san")


class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    ma_dat_san = Column(String(20), unique=True, index=True, nullable=False)
    san_id = Column(Integer, ForeignKey("fields.id"), nullable=False)
    khach_hang_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = khách vãng lai
    ten_khach_vang_lai = Column(String(100))  # nếu khách vãng lai
    sdt_khach_vang_lai = Column(String(15))
    email_khach_vang_lai = Column(String(120))  # email khách guest để gửi reminder
    reminder_sent = Column(Boolean, nullable=False, default=False)  # đã gửi reminder chưa
    ngay_dat = Column(Date, nullable=False)
    gio_bat_dau = Column(Time, nullable=False)
    gio_ket_thuc = Column(Time, nullable=False)
    so_gio = Column(Float, nullable=False)
    tien_san = Column(Numeric(12, 2), nullable=False)
    ghi_chu = Column(Text)
    hinh_thuc_thanh_toan = Column(SQLEnum(PaymentMethod), nullable=False)
    trang_thai = Column(SQLEnum(BookingStatus), nullable=False, default=BookingStatus.CHO_XAC_NHAN)
    ly_do_huy = Column(Text)
    hoan_tien = Column(Boolean, nullable=False, default=False)  # Admin/Staff quyết định có hoàn tiền không
    ty_le_hoan_tien = Column(Float, nullable=True)  # 0.5 = hoàn 50% (theo yêu cầu khách/policy), 1.0 = hoàn 100% (lỗi từ sân)
    ngay_huy = Column(DateTime, nullable=True)  # thời điểm booking bị hủy
    stk_hoan_tien = Column(String(30), nullable=True)  # STK khách cung cấp để nhận hoàn tiền
    ten_tk_hoan_tien = Column(String(100), nullable=True)  # Tên chủ tài khoản nhận hoàn tiền
    ngan_hang_hoan_tien = Column(String(100), nullable=True)  # Ngân hàng nhận hoàn tiền
    da_doi_lich = Column(Boolean, nullable=False, default=False)  # đã từng đổi lịch chưa
    ngay_doi_lich_gan_nhat = Column(DateTime, nullable=True)  # thời điểm đổi lịch gần nhất
    nguoi_tao_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # ai tạo booking (NV hay khách)
    khach_bao_chuyen_khoan = Column(DateTime, nullable=True)  # lúc khách bấm "đã chuyển khoản, chờ nhân viên xác nhận"
    han_thanh_toan = Column(DateTime, nullable=True)  # hạn thanh toán (UTC) cho đơn CHO_XAC_NHAN; NULL = dùng ngay_tao + PAYMENT_WINDOW
    ngay_tao = Column(DateTime, default=datetime.utcnow)

    san = relationship("Field", back_populates="bookings")
    khach_hang = relationship("User", back_populates="bookings", foreign_keys=[khach_hang_id])
    booking_services = relationship("BookingService", back_populates="booking", cascade="all, delete-orphan")
    invoice = relationship("Invoice", back_populates="booking", uselist=False, cascade="all, delete-orphan")
    feedback = relationship("Feedback", back_populates="booking", uselist=False, cascade="all, delete-orphan")


class Service(Base):
    __tablename__ = "services"
    id = Column(Integer, primary_key=True, index=True)
    ten_dich_vu = Column(String(100), nullable=False)
    don_gia = Column(Numeric(12, 2), nullable=False)
    don_vi_tinh = Column(String(20), nullable=False)
    ton_kho = Column(Integer, nullable=False, default=0)
    la_cho_thue = Column(Boolean, nullable=False, default=False)  # True nếu là đồ thuê (giày, áo) - restock khi xong
    trang_thai = Column(SQLEnum(ServiceStatus), nullable=False, default=ServiceStatus.HOAT_DONG)
    ngay_tao = Column(DateTime, default=datetime.utcnow)

    booking_services = relationship("BookingService", back_populates="dich_vu")


class BookingService(Base):
    __tablename__ = "booking_services"
    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    dich_vu_id = Column(Integer, ForeignKey("services.id"), nullable=False)
    so_luong = Column(Integer, nullable=False, default=1)
    don_gia = Column(Numeric(12, 2), nullable=False)
    thanh_tien = Column(Numeric(12, 2), nullable=False)

    booking = relationship("Booking", back_populates="booking_services")
    dich_vu = relationship("Service", back_populates="booking_services")


class Membership(Base):
    __tablename__ = "memberships"
    id = Column(Integer, primary_key=True, index=True)
    khach_hang_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    loai_the = Column(SQLEnum(MembershipType), nullable=False)
    ngay_bat_dau = Column(Date, nullable=False)
    ngay_ket_thuc = Column(Date, nullable=False)
    phi_the = Column(Numeric(12, 2), nullable=False)
    trang_thai = Column(String(20), default="ACTIVE")  # ACTIVE / EXPIRED
    ngay_tao = Column(DateTime, default=datetime.utcnow)

    khach_hang = relationship("User", back_populates="memberships")


class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary_key=True, index=True)
    ma_hoa_don = Column(String(20), unique=True, index=True, nullable=False)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    tien_san = Column(Numeric(12, 2), nullable=False)
    tien_dich_vu = Column(Numeric(12, 2), nullable=False, default=0)
    giam_gia = Column(Numeric(12, 2), nullable=False, default=0)
    tong_cong = Column(Numeric(12, 2), nullable=False)
    hinh_thuc_thanh_toan = Column(SQLEnum(PaymentMethod), nullable=False)
    trang_thai = Column(SQLEnum(PaymentStatus), nullable=False, default=PaymentStatus.CHUA_THANH_TOAN)
    so_tien_da_tt = Column(Numeric(12, 2), nullable=True)  # số tiền khách đã thanh toán thực tế; NULL = hóa đơn cũ (suy ra từ trạng thái)
    ngay_xuat = Column(DateTime, default=datetime.utcnow)

    booking = relationship("Booking", back_populates="invoice")


class Shift(Base):
    __tablename__ = "shifts"
    id = Column(Integer, primary_key=True, index=True)
    nhan_vien_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ngay = Column(Date, nullable=False)
    ca_truc = Column(SQLEnum(ShiftType), nullable=False)
    san_phu_trach = Column(String(200))  # JSON list của field IDs dạng "1,2,3"
    ghi_chu = Column(Text)
    luong_ca = Column(Integer, nullable=True)  # snapshot lương của ca; NULL = ca cũ, tính theo DEFAULT_LUONG_CA
    ngay_tao = Column(DateTime, default=datetime.utcnow)

    nhan_vien = relationship("User", back_populates="shifts")


class SalaryPayment(Base):
    """Xác nhận đã chuyển lương cho 1 nhân viên trong 1 tháng (thang = 'YYYY-MM')."""
    __tablename__ = "salary_payments"
    id = Column(Integer, primary_key=True, index=True)
    nhan_vien_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    thang = Column(String(7), nullable=False)
    da_chuyen = Column(Boolean, nullable=False, default=False)
    so_tien = Column(Integer, nullable=True)  # tổng lương tại thời điểm xác nhận
    ngay_chuyen = Column(DateTime, nullable=True)


class Feedback(Base):
    __tablename__ = "feedbacks"
    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), unique=True, nullable=False)
    khach_hang_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    danh_gia_tong = Column(Integer, nullable=False)  # 1-5
    danh_gia_co_so = Column(Integer)
    danh_gia_nhan_vien = Column(Integer)
    danh_gia_dich_vu = Column(Integer)
    nhan_xet = Column(Text)
    ngay_tao = Column(DateTime, default=datetime.utcnow)

    booking = relationship("Booking", back_populates="feedback")
    khach_hang = relationship("User", back_populates="feedbacks")


class SalaryRateChange(Base):
    """Lịch sử thay đổi mức lương/ca của nhân viên. Mức mới áp dụng cho các ca từ ngay_ap_dung trở đi."""
    __tablename__ = "salary_rate_changes"
    id = Column(Integer, primary_key=True, index=True)
    nhan_vien_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    luong_cu = Column(Integer, nullable=False)
    luong_moi = Column(Integer, nullable=False)
    ngay_ap_dung = Column(Date, nullable=False)
    ngay_thay_doi = Column(DateTime, default=datetime.utcnow)


class ChatAuditLog(Base):
    """Nhật ký chatbot: câu bị chặn, thao tác được đề xuất / thực hiện (phục vụ truy vết & bảo mật)."""
    __tablename__ = "chat_audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    ngay_tao = Column(DateTime, default=datetime.utcnow, index=True)
    loai = Column(String(20), nullable=False)      # BLOCKED | PROPOSED | EXECUTED | FAILED
    user_id = Column(Integer, nullable=True)
    vai_tro = Column(String(20), nullable=True)
    cong_cu = Column(String(60), nullable=True)
    chi_tiet = Column(Text, nullable=True)
    ket_qua = Column(Text, nullable=True)


class SecurityEvent(Base):
    """Sự kiện bảo mật (đăng nhập sai, khóa tạm, lạm dụng OTP, vượt giới hạn) — hiển thị ở chuông thông báo của quản lý."""
    __tablename__ = "security_events"
    id = Column(Integer, primary_key=True, index=True)
    ngay_tao = Column(DateTime, default=datetime.utcnow, index=True)
    loai = Column(String(20), nullable=False)      # LOGIN_FAIL | LOCKED | OTP_ABUSE | RATE_LIMIT
    email = Column(String(120), nullable=True)
    ip = Column(String(64), nullable=True)
    chi_tiet = Column(String(200), nullable=True)
