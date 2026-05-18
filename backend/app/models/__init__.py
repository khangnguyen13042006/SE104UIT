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
    MembershipType, ServiceStatus, ShiftType
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

    bookings = relationship("Booking", back_populates="khach_hang", foreign_keys="Booking.khach_hang_id")
    memberships = relationship("Membership", back_populates="khach_hang")
    shifts = relationship("Shift", back_populates="nhan_vien")
    feedbacks = relationship("Feedback", back_populates="khach_hang")


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
    nguoi_tao_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # ai tạo booking (NV hay khách)
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
    ngay_tao = Column(DateTime, default=datetime.utcnow)

    nhan_vien = relationship("User", back_populates="shifts")


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
