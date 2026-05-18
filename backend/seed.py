"""Tạo dữ liệu mẫu để demo nhanh."""
from datetime import date, time, timedelta
from decimal import Decimal
from app.core.database import Base, engine, SessionLocal
from app.core.security import hash_password
from app.core.config import (
    UserRole, UserStatus, FieldType, FieldStatus,
    BookingStatus, PaymentMethod, PaymentStatus, ServiceStatus,
    MembershipType, ShiftType
)
from app.models import (
    User, Field, Service, Booking, BookingService, Invoice,
    Membership, Shift, Feedback
)
from app.utils.helpers import generate_code, calculate_field_price, calculate_hours


def seed():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # ============ USERS ============
        users = [
            User(ho_ten="Admin Hệ Thống", email="admin@sanbong.vn", sdt="0900000001",
                 mat_khau_hash=hash_password("admin123"), vai_tro=UserRole.ADMIN),
            User(ho_ten="Quản Lý Nam", email="quanly@sanbong.vn", sdt="0900000002",
                 mat_khau_hash=hash_password("quanly123"), vai_tro=UserRole.QUAN_LY),
            User(ho_ten="Nhân Viên A", email="nva@sanbong.vn", sdt="0900000003",
                 mat_khau_hash=hash_password("nhanvien123"), vai_tro=UserRole.NHAN_VIEN),
            User(ho_ten="Nhân Viên B", email="nvb@sanbong.vn", sdt="0900000004",
                 mat_khau_hash=hash_password("nhanvien123"), vai_tro=UserRole.NHAN_VIEN),
            User(ho_ten="Nguyễn Văn Khách", email="khach@gmail.com", sdt="0911111111",
                 mat_khau_hash=hash_password("khach1234"), vai_tro=UserRole.KHACH_HANG),
            User(ho_ten="Trần Thị Quen", email="quen@gmail.com", sdt="0922222222",
                 mat_khau_hash=hash_password("khach1234"), vai_tro=UserRole.KHACH_HANG),
        ]
        db.add_all(users)
        db.commit()
        for u in users:
            db.refresh(u)

        # ============ FIELDS ============
        fields = [
            Field(ten_san="Sân 1 - Mini A", loai_san=FieldType.SAN_5, suc_chua=10,
                  gia_tieu_chuan=Decimal("150000"), gia_cao_diem=Decimal("250000"),
                  mo_ta="Cỏ nhân tạo, đèn LED, phòng thay đồ"),
            Field(ten_san="Sân 2 - Mini B", loai_san=FieldType.SAN_5, suc_chua=10,
                  gia_tieu_chuan=Decimal("150000"), gia_cao_diem=Decimal("250000"),
                  mo_ta="Cỏ nhân tạo, đèn LED"),
            Field(ten_san="Sân 3 - VIP", loai_san=FieldType.SAN_7, suc_chua=14,
                  gia_tieu_chuan=Decimal("250000"), gia_cao_diem=Decimal("400000"),
                  mo_ta="Cỏ nhân tạo cao cấp, có camera, khu vực khán giả"),
            Field(ten_san="Sân 4 - Tiêu chuẩn", loai_san=FieldType.SAN_7, suc_chua=14,
                  gia_tieu_chuan=Decimal("220000"), gia_cao_diem=Decimal("350000"),
                  mo_ta="Cỏ nhân tạo, đèn LED"),
            Field(ten_san="Sân 5 - Lớn", loai_san=FieldType.SAN_11, suc_chua=22,
                  gia_tieu_chuan=Decimal("500000"), gia_cao_diem=Decimal("800000"),
                  mo_ta="Sân 11 người, cỏ nhân tạo, có khán đài"),
            Field(ten_san="Sân 6 - Bảo trì", loai_san=FieldType.SAN_5, suc_chua=10,
                  gia_tieu_chuan=Decimal("150000"), gia_cao_diem=Decimal("250000"),
                  mo_ta="Đang bảo trì", trang_thai=FieldStatus.BAO_TRI),
        ]
        db.add_all(fields)
        db.commit()
        for f in fields:
            db.refresh(f)

        # ============ SERVICES (la_cho_thue=True: đồ thuê, tự restock khi xong) ============
        services = [
            Service(ten_dich_vu="Thuê giày size 39", don_gia=Decimal("30000"),
                    don_vi_tinh="Đôi", ton_kho=10, la_cho_thue=True),
            Service(ten_dich_vu="Thuê giày size 40", don_gia=Decimal("30000"),
                    don_vi_tinh="Đôi", ton_kho=15, la_cho_thue=True),
            Service(ten_dich_vu="Thuê giày size 41", don_gia=Decimal("30000"),
                    don_vi_tinh="Đôi", ton_kho=15, la_cho_thue=True),
            Service(ten_dich_vu="Thuê giày size 42", don_gia=Decimal("30000"),
                    don_vi_tinh="Đôi", ton_kho=12, la_cho_thue=True),
            Service(ten_dich_vu="Nước khoáng 500ml", don_gia=Decimal("15000"),
                    don_vi_tinh="Chai", ton_kho=100, la_cho_thue=False),
            Service(ten_dich_vu="Nước tăng lực", don_gia=Decimal("25000"),
                    don_vi_tinh="Chai", ton_kho=50, la_cho_thue=False),
            Service(ten_dich_vu="Thuê áo tập (giặt mới)", don_gia=Decimal("20000"),
                    don_vi_tinh="Bộ", ton_kho=30, la_cho_thue=True),
            Service(ten_dich_vu="Băng đeo cổ chân", don_gia=Decimal("10000"),
                    don_vi_tinh="Cái", ton_kho=20, la_cho_thue=False),
        ]
        db.add_all(services)
        db.commit()
        for s in services:
            db.refresh(s)

        # ============ MEMBERSHIPS (legacy - không cần thiết với tier theo spend) ============
        # Tier tự tính từ lifetime spend, không cần seed membership.
        today = date.today()

        # ============ BOOKINGS mẫu (vài tuần trước + hôm nay + tương lai) ============
        sample_bookings = [
            # Quá khứ - HOAN_THANH (tích lũy spend cho user[5]=quen để đạt tier VÀNG)
            (fields[0], users[4], today - timedelta(days=7), time(18, 0), time(19, 30)),
            (fields[2], users[5], today - timedelta(days=30), time(19, 0), time(21, 0)),  # 1.4M peak
            (fields[1], users[4], today - timedelta(days=3), time(17, 0), time(18, 30)),
            (fields[3], users[5], today - timedelta(days=25), time(20, 0), time(22, 0)),  # 1.4M peak
            (fields[0], users[4], today - timedelta(days=1), time(19, 0), time(20, 30)),
            (fields[4], users[5], today - timedelta(days=20), time(19, 0), time(21, 0)),  # 1.6M peak
            # Hôm nay
            (fields[1], users[5], today, time(18, 0), time(19, 30)),
            (fields[2], users[4], today, time(19, 30), time(21, 0)),
            # Tương lai - DA_XAC_NHAN
            (fields[0], users[4], today + timedelta(days=1), time(19, 0), time(20, 30)),
            (fields[3], users[5], today + timedelta(days=2), time(18, 0), time(19, 30)),
            (fields[2], users[4], today + timedelta(days=3), time(20, 0), time(21, 30)),
        ]

        for i, (field, user, ngay, gbd, gkt) in enumerate(sample_bookings):
            so_gio = calculate_hours(gbd, gkt)
            tien_san = calculate_field_price(field, gbd, gkt)
            is_past = ngay < today
            is_today_done = (ngay == today and gkt < time.fromisoformat("17:00"))
            status = BookingStatus.HOAN_THANH if is_past else BookingStatus.DA_XAC_NHAN

            booking = Booking(
                ma_dat_san=generate_code("BK"),
                san_id=field.id,
                khach_hang_id=user.id,
                ngay_dat=ngay,
                gio_bat_dau=gbd,
                gio_ket_thuc=gkt,
                so_gio=so_gio,
                tien_san=tien_san,
                hinh_thuc_thanh_toan=PaymentMethod.CHUYEN_KHOAN if i % 2 == 0 else PaymentMethod.TIEN_MAT,
                trang_thai=status,
                nguoi_tao_id=user.id,
            )
            db.add(booking)
            db.flush()

            # Thêm 1-2 dịch vụ
            tien_dv = Decimal(0)
            for svc_idx in [(i % len(services))]:
                svc = services[svc_idx]
                qty = 2
                bs = BookingService(
                    booking_id=booking.id,
                    dich_vu_id=svc.id,
                    so_luong=qty,
                    don_gia=svc.don_gia,
                    thanh_tien=svc.don_gia * qty,
                )
                db.add(bs)
                tien_dv += svc.don_gia * qty
                svc.ton_kho -= qty

            # Giảm giá nếu là khách VIP (user 5)
            giam_gia = Decimal(0)
            if user.id == users[5].id:
                giam_gia = (tien_san * Decimal("0.10")).quantize(Decimal("1"))

            tong = tien_san + tien_dv - giam_gia

            inv = Invoice(
                ma_hoa_don=generate_code("HD"),
                booking_id=booking.id,
                tien_san=tien_san,
                tien_dich_vu=tien_dv,
                giam_gia=giam_gia,
                tong_cong=tong,
                hinh_thuc_thanh_toan=booking.hinh_thuc_thanh_toan,
                trang_thai=PaymentStatus.DA_THANH_TOAN if status == BookingStatus.HOAN_THANH else PaymentStatus.CHUA_THANH_TOAN,
            )
            db.add(inv)

        db.commit()

        # ============ FEEDBACKS cho booking hoàn thành ============
        past_bookings = db.query(Booking).filter(Booking.trang_thai == BookingStatus.HOAN_THANH).all()
        sample_feedbacks = [
            (5, 5, 5, 5, "Sân rất đẹp, nhân viên nhiệt tình!"),
            (4, 4, 5, 4, "Sân tốt, nhưng nước hơi đắt."),
            (5, 5, 4, 5, "Sẽ quay lại lần sau!"),
            (3, 3, 4, 2, "Đèn hơi tối, dịch vụ ổn."),
            (2, 2, 3, 2, "Cỏ có chỗ bong tróc, cần sửa lại."),
        ]
        for b, fb in zip(past_bookings, sample_feedbacks):
            tong, co_so, nv, dv, nx = fb
            f = Feedback(
                booking_id=b.id,
                khach_hang_id=b.khach_hang_id,
                danh_gia_tong=tong,
                danh_gia_co_so=co_so,
                danh_gia_nhan_vien=nv,
                danh_gia_dich_vu=dv,
                nhan_xet=nx,
            )
            db.add(f)

        # ============ SHIFTS ============
        for d_offset in range(2, 7):
            ngay = today + timedelta(days=d_offset)
            db.add(Shift(nhan_vien_id=users[2].id, ngay=ngay, ca_truc=ShiftType.SANG,
                         san_phu_trach="1,2", ghi_chu=""))
            db.add(Shift(nhan_vien_id=users[3].id, ngay=ngay, ca_truc=ShiftType.CHIEU,
                         san_phu_trach="3,4,5", ghi_chu=""))

        db.commit()
        print("✅ Seed dữ liệu thành công!")
        print("\n📋 Tài khoản demo:")
        print("  Admin     : admin@sanbong.vn / admin123")
        print("  Quản lý   : quanly@sanbong.vn / quanly123")
        print("  Nhân viên : nva@sanbong.vn / nhanvien123")
        print("  Khách     : khach@gmail.com / khach1234")
        print("  Khách VIP : quen@gmail.com / khach1234")
        print("\n💡 Tier thành viên tự tính theo tổng tiền đã chi (lifetime spend):")
        print("  • Bạc: > 1.000.000đ (giảm 5%)")
        print("  • Vàng: > 3.000.000đ (giảm 10%)")
        print("  • Kim Cương: > 7.000.000đ (giảm 15%)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
