"""Công cụ TRA CỨU (chỉ đọc) của chatbot. Mỗi công cụ khai báo rõ vai trò được dùng."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func

from app.core.config import (
    BookingStatus, FieldStatus, PaymentStatus, ServiceStatus, UserRole, UserStatus,
    MEMBERSHIP_DISCOUNT, MEMBERSHIP_NAME, MEMBERSHIP_THRESHOLD,
)
from app.models import Booking, Feedback, Field, Invoice, Service, Shift, User
from app.schemas import BookingReschedule
from app.utils.helpers import (
    amount_paid, calculate_lifetime_spend, calculate_tier_from_spend, payment_deadline, payment_due,
)
from . import base
from .base import (
    AD, KH, NV, QL, R_ALL, R_AUTHED, R_CUSTOMER, R_MANAGER, R_STAFF, GUEST,
    P_bool, P_int, P_num, P_str, ToolError, clean_text, hhmm, mask_account, parse_date, parse_time,
    read_tool, vnd,
)

STATUS_ENUM = ["CHO_XAC_NHAN", "DA_XAC_NHAN", "DANG_SU_DUNG", "HOAN_THANH", "HUY"]


def _booking_row(b: Booking, ctx, detail: bool = False) -> dict:
    inv = b.invoice
    row = {
        "ma_dat_san": b.ma_dat_san,
        "san": b.san.ten_san if b.san else "",
        "ngay": b.ngay_dat,
        "gio": f"{hhmm(b.gio_bat_dau)}-{hhmm(b.gio_ket_thuc)}",
        "trang_thai": base.STATUS_LABEL.get(b.trang_thai.value, b.trang_thai.value),
        "tong_tien": inv.tong_cong if inv else b.tien_san,
    }
    if ctx.is_staff:
        row["khach"] = b.khach_hang.ho_ten if b.khach_hang else (b.ten_khach_vang_lai or "Khách lẻ")
    if inv:
        paid, due = amount_paid(b), payment_due(b)
        row["da_thanh_toan"] = paid
        if due > 0:
            row["con_phai_thanh_toan"] = due
            if b.trang_thai == BookingStatus.CHO_XAC_NHAN and paid <= 0 and not b.khach_bao_chuyen_khoan:
                left = (payment_deadline(b) - datetime.utcnow()).total_seconds() / 60
                row["han_thanh_toan_con_lai_phut"] = max(0, int(left))
            if b.khach_bao_chuyen_khoan:
                row["khach_da_bao_chuyen_khoan"] = True
    if b.trang_thai == BookingStatus.HUY and b.hoan_tien:
        row["hoan_tien"] = {
            "ty_le_phan_tram": int((b.ty_le_hoan_tien if b.ty_le_hoan_tien is not None else 0.5) * 100),
            "so_tien": base.num(amount_paid(b)) * (b.ty_le_hoan_tien if b.ty_le_hoan_tien is not None else 0.5),
            "da_hoan": bool(inv and inv.trang_thai == PaymentStatus.HOAN_TIEN),
            "da_gui_stk": bool(b.stk_hoan_tien),
        }
    if detail:
        row["so_gio"] = b.so_gio
        row["dich_vu"] = [
            {"ten": bs.dich_vu.ten_dich_vu if bs.dich_vu else "?", "so_luong": bs.so_luong, "thanh_tien": bs.thanh_tien}
            for bs in b.booking_services
        ]
        if inv:
            row["hoa_don"] = {"tien_san": inv.tien_san, "tien_dich_vu": inv.tien_dich_vu, "giam_gia": inv.giam_gia,
                              "tong_cong": inv.tong_cong, "trang_thai_hoa_don": inv.trang_thai.value}
        if b.da_doi_lich:
            row["da_doi_lich"] = True
        if b.ly_do_huy:
            row["ly_do_huy"] = clean_text(b.ly_do_huy, 100)
        if ctx.is_staff:
            if b.khach_hang:
                row["sdt_khach"] = b.khach_hang.sdt
            elif b.sdt_khach_vang_lai:
                row["sdt_khach"] = b.sdt_khach_vang_lai
            lines = [ln for ln in (b.ghi_chu or "").splitlines() if ln.strip()][-3:]
            if lines:
                row["ghi_chu_gan_nhat"] = [clean_text(x, 120) for x in lines]
    return row


# ============================================================ THÔNG TIN CHUNG (mọi vai trò)
@read_tool(
    "search_fields",
    "Tra cứu danh sách sân: loại, sức chứa, giá thường/cao điểm, đánh giá trung bình, mô tả. Dùng khi hỏi về sân, giá, so sánh sân.",
    {"loai_san": P_str("Lọc theo loại sân", ["SAN_5", "SAN_7", "SAN_11"]),
     "trang_thai": P_str("Chỉ dành cho nhân sự: lọc theo trạng thái sân", ["HOAT_DONG", "BAO_TRI", "DONG_CUA"])},
    roles=R_ALL, label="Xem danh sách sân, giá, đánh giá", icon="🏟️")
def search_fields(ctx, a):
    q = ctx.db.query(Field)
    if not ctx.is_staff:
        q = q.filter(Field.trang_thai == FieldStatus.HOAT_DONG)
    elif a.get("trang_thai") in {s.value for s in FieldStatus}:
        q = q.filter(Field.trang_thai == FieldStatus(a["trang_thai"]))
    if a.get("loai_san") in ("SAN_5", "SAN_7", "SAN_11"):
        q = q.filter(Field.loai_san == a["loai_san"])
    rating = {r.san_id: (r.c, float(r.a or 0)) for r in ctx.db.query(
        Booking.san_id, func.count(Feedback.id).label("c"), func.avg(Feedback.danh_gia_tong).label("a")
    ).join(Booking, Feedback.booking_id == Booking.id).group_by(Booking.san_id).all()}
    out = []
    for f in q.order_by(Field.id).all():
        c, avg = rating.get(f.id, (0, 0))
        out.append({
            "id": f.id, "ten": f.ten_san, "loai": f.loai_san.value, "suc_chua": f.suc_chua,
            "gia_thuong_moi_gio": f.gia_tieu_chuan, "gia_cao_diem_moi_gio": f.gia_cao_diem,
            "trang_thai": f.trang_thai.value, "danh_gia_tb": round(avg, 2) if c else None, "so_danh_gia": c,
            "mo_ta": clean_text(f.mo_ta, 120),
        })
    return {"so_san": len(out), "san": out}


@read_tool(
    "check_availability",
    "Kiểm tra sân còn trống trong một ngày (dữ liệu thật). Không truyền giờ → trả các khoảng trống của từng sân. "
    "Truyền gio_bat_dau + thoi_luong → cho biết sân nào trống đúng khung đó kèm giá. Ngày phải quy đổi sang YYYY-MM-DD.",
    {"ngay": P_str("Ngày cần xem, YYYY-MM-DD"),
     "loai_san": P_str("Lọc loại sân", ["SAN_5", "SAN_7", "SAN_11"]),
     "san_id": P_int("Chỉ xem một sân theo ID"),
     "gio_bat_dau": P_str("Giờ bắt đầu HH:MM (tùy chọn)"),
     "thoi_luong": P_num("Số giờ: 0.5, 1, 1.5, 2, 2.5 hoặc 3 (tùy chọn, mặc định 1.5 khi có gio_bat_dau)")},
    ["ngay"], roles=R_ALL, label="Kiểm tra sân trống theo ngày/giờ", icon="📅")
def check_availability(ctx, a):
    ngay = parse_date(a.get("ngay"))
    if ngay < ctx.today:
        raise ToolError("Không thể xem/đặt ngày trong quá khứ.")
    if ngay > ctx.today + timedelta(days=90):
        raise ToolError("Chỉ xem được lịch trong vòng 90 ngày tới.")
    q = ctx.db.query(Field).filter(Field.trang_thai == FieldStatus.HOAT_DONG)
    if a.get("san_id"):
        q = q.filter(Field.id == int(a["san_id"]))
    if a.get("loai_san") in ("SAN_5", "SAN_7", "SAN_11"):
        q = q.filter(Field.loai_san == a["loai_san"])
    fields = q.order_by(Field.id).limit(15).all()
    if not fields:
        raise ToolError("Không có sân phù hợp bộ lọc.")
    rate = base.best_discount_rate(ctx.db, ctx.user.id) if ctx.role == KH else 0.0

    if a.get("gio_bat_dau"):
        start = parse_time(a["gio_bat_dau"])
        end = base.duration_end(start, a.get("thoi_luong") or 1.5)
        past = ngay == ctx.today and start <= ctx.now_vn.time()
        rows = []
        for f in fields:
            free = (not past) and base.slot_is_free(ctx.db, f.id, ngay, start, end)
            row = {"san": f.ten_san, "id": f.id, "loai": f.loai_san.value, "con_trong": free}
            if free:
                p = base.price_breakdown(f, start, end, rate)
                row["tong_tien"] = p["tong"]
                if p["giam_gia"]:
                    row["da_giam"] = p["giam_gia"]
            rows.append(row)
        return {"ngay": ngay, "khung_gio": f"{hhmm(start)}-{hhmm(end)}",
                "ghi_chu": "Giờ đã qua so với hiện tại" if past else None, "ket_qua": rows}
    return {"ngay": ngay, "khung_trong_theo_san": [
        {"san": f.ten_san, "id": f.id, "loai": f.loai_san.value,
         "khoang_trong": base.free_ranges(ctx.db, f.id, ngay, ctx.now_vn) or ["kín lịch"]}
        for f in fields]}


@read_tool(
    "quote_price",
    "Tính giá thuê sân cho một khung giờ (tách giờ thường/cao điểm 17:00-22:00, áp giảm giá thành viên nếu khách đã đăng nhập).",
    {"san_id": P_int("ID sân"), "ten_san": P_str("Tên sân (nếu không biết ID)"),
     "gio_bat_dau": P_str("HH:MM"), "thoi_luong": P_num("Số giờ: 0.5 - 3")},
    ["gio_bat_dau", "thoi_luong"], roles=R_ALL, label="Báo giá thuê sân", icon="💰")
def quote_price(ctx, a):
    f = base.find_field(ctx, a.get("san_id"), a.get("ten_san"))
    start = parse_time(a["gio_bat_dau"])
    end = base.duration_end(start, a["thoi_luong"])
    rate = base.best_discount_rate(ctx.db, ctx.user.id) if ctx.role == KH else 0.0
    p = base.price_breakdown(f, start, end, rate)
    return {"san": f.ten_san, "khung_gio": f"{hhmm(start)}-{hhmm(end)}", **p, "ty_le_giam": int(rate * 100)}


@read_tool(
    "search_services",
    "Tra cứu dịch vụ/tiện ích đi kèm (nước, giày, áo bib, bóng…): giá, đơn vị, còn hàng không.",
    {"tu_khoa": P_str("Từ khóa tên dịch vụ"), "chi_sap_het": P_bool("Chỉ nhân sự: chỉ lấy dịch vụ sắp hết hàng (dưới 5)")},
    roles=R_ALL, label="Xem dịch vụ, giá, tồn kho", icon="📦")
def search_services(ctx, a):
    q = ctx.db.query(Service)
    if not ctx.is_staff:
        q = q.filter(Service.trang_thai == ServiceStatus.HOAT_DONG)
    if a.get("tu_khoa"):
        q = q.filter(Service.ten_dich_vu.ilike(f"%{str(a['tu_khoa']).strip()}%"))
    if ctx.is_staff and a.get("chi_sap_het"):
        q = q.filter(Service.ton_kho < 5)
    out = []
    for s in q.order_by(Service.id).limit(40).all():
        row = {"ten": s.ten_dich_vu, "don_gia": s.don_gia, "don_vi": s.don_vi_tinh,
               "do_thue": bool(s.la_cho_thue)}
        if ctx.is_staff:
            row.update({"id": s.id, "ton_kho": s.ton_kho, "trang_thai": s.trang_thai.value})
        else:
            row["con_hang"] = s.ton_kho > 0
        out.append(row)
    return {"so_dich_vu": len(out), "dich_vu": out}


@read_tool(
    "membership_info",
    "Chính sách hạng thành viên (Bạc/Vàng/Kim Cương: mốc chi tiêu & % giảm giá tiền sân). "
    "Với khách đã đăng nhập còn trả về hạng hiện tại, tổng chi tiêu và số tiền cần thêm để lên hạng.",
    {}, roles=R_ALL, label="Hạng thành viên & ưu đãi", icon="⭐")
def membership_info(ctx, a):
    tiers = [{"hang": MEMBERSHIP_NAME[t], "tu_chi_tieu": 0 if t == "THUONG" else MEMBERSHIP_THRESHOLD[t],
              "giam_tien_san_phan_tram": int(MEMBERSHIP_DISCOUNT[t] * 100)} for t in ("THUONG", "BAC", "VANG", "KIM_CUONG")]
    out = {"cac_hang": tiers, "luu_y": "Hạng tự tính theo tổng chi tiêu các đơn đã hoàn thành; giảm giá chỉ áp cho tiền sân, không áp cho dịch vụ."}
    if ctx.role == KH:
        spend = float(calculate_lifetime_spend(ctx.db, ctx.user.id))
        tier = calculate_tier_from_spend(spend)
        order = ["THUONG", "BAC", "VANG", "KIM_CUONG"]
        nxt = order[order.index(tier) + 1] if tier != "KIM_CUONG" else None
        out["cua_ban"] = {"hang_hien_tai": MEMBERSHIP_NAME[tier], "tong_chi_tieu": spend,
                          "giam_phan_tram": int(MEMBERSHIP_DISCOUNT[tier] * 100),
                          "hang_ke_tiep": MEMBERSHIP_NAME[nxt] if nxt else None,
                          "can_them": max(0, MEMBERSHIP_THRESHOLD[nxt] - spend) if nxt else 0}
    return out


# ============================================================ KHÁCH HÀNG
@read_tool(
    "my_bookings",
    "Xem các đơn đặt sân CỦA CHÍNH KHÁCH đang chat: trạng thái, số tiền còn phải thanh toán, hạn thanh toán, tiền hoàn.",
    {"trang_thai": P_str("Lọc theo trạng thái", STATUS_ENUM),
     "tu_ngay": P_str("Từ ngày YYYY-MM-DD"), "den_ngay": P_str("Đến ngày YYYY-MM-DD"),
     "chi_sap_toi": P_bool("Chỉ lấy đơn từ hôm nay trở đi và chưa hủy"),
     "so_luong": P_int("Số đơn tối đa (mặc định 10, tối đa 30)")},
    roles=R_CUSTOMER, label="Xem các đơn đặt sân của bạn", icon="📋")
def my_bookings(ctx, a):
    q = ctx.db.query(Booking).filter(Booking.khach_hang_id == ctx.user.id)
    if a.get("trang_thai") in STATUS_ENUM:
        q = q.filter(Booking.trang_thai == BookingStatus(a["trang_thai"]))
    if a.get("chi_sap_toi"):
        q = q.filter(Booking.ngay_dat >= ctx.today, Booking.trang_thai != BookingStatus.HUY)
    if a.get("tu_ngay"):
        q = q.filter(Booking.ngay_dat >= parse_date(a["tu_ngay"]))
    if a.get("den_ngay"):
        q = q.filter(Booking.ngay_dat <= parse_date(a["den_ngay"]))
    total = q.count()
    limit = min(max(int(a.get("so_luong") or 10), 1), 30)
    order = (Booking.ngay_dat.asc(), Booking.gio_bat_dau.asc()) if a.get("chi_sap_toi") else (Booking.ngay_dat.desc(), Booking.gio_bat_dau.desc())
    rows = q.order_by(*order).limit(limit).all()
    return {"tong_so_don": total, "don": [_booking_row(b, ctx) for b in rows]}


@read_tool(
    "booking_detail",
    "Chi tiết một đơn theo mã (BKxxxxxxxx): dịch vụ, hóa đơn, thanh toán, hoàn tiền. Khách chỉ xem được đơn của mình.",
    {"ma_dat_san": P_str("Mã đơn dạng BK12345678")}, ["ma_dat_san"],
    roles=R_AUTHED, label="Xem chi tiết một đơn", icon="🧾")
def booking_detail(ctx, a):
    return _booking_row(base.find_booking(ctx, a.get("ma_dat_san")), ctx, detail=True)


def _cancel_outcome(ctx, b: Booking, do_san: bool):
    now = ctx.now_vn
    hours = (datetime.combine(b.ngay_dat, b.gio_bat_dau) - now).total_seconds() / 3600
    paid = amount_paid(b)
    if paid <= 0:
        return hours, 0.0, Decimal(0), "Đơn chưa thanh toán nên không có khoản hoàn."
    if do_san:
        rate, note = 1.0, "Lỗi từ phía sân: hoàn 100% bất kể thời điểm hủy."
    elif hours >= 24:
        rate, note = 0.5, "Hủy trước giờ đá từ 24 giờ trở lên: hoàn 50%."
    else:
        rate, note = 0.0, "Hủy trong vòng 24 giờ trước giờ đá: không hoàn tiền."
    return hours, rate, (paid * Decimal(str(rate))).quantize(Decimal("1")), note


@read_tool(
    "cancel_preview",
    "Xem trước kết quả nếu hủy một đơn: còn bao nhiêu giờ, được hoàn bao nhiêu %, bao nhiêu tiền. Chỉ tính toán, KHÔNG hủy.",
    {"ma_dat_san": P_str("Mã đơn")}, ["ma_dat_san"], roles=R_AUTHED, label="Xem trước mức hoàn tiền khi hủy", icon="🔮")
def cancel_preview(ctx, a):
    b = base.find_booking(ctx, a.get("ma_dat_san"))
    if b.trang_thai not in (BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN):
        raise ToolError(f"Đơn {b.ma_dat_san} đang ở trạng thái '{base.STATUS_LABEL[b.trang_thai.value]}' nên không thể hủy.")
    hours, rate, amount, note = _cancel_outcome(ctx, b, False)
    out = {"ma_dat_san": b.ma_dat_san, "con_lai_gio": round(hours, 1),
           "da_thanh_toan": amount_paid(b), "neu_khach_huy": {"ty_le_hoan": int(rate * 100), "so_tien_hoan": amount, "ghi_chu": note}}
    if ctx.is_manager:
        _, r2, a2, n2 = _cancel_outcome(ctx, b, True)
        out["neu_san_huy"] = {"ty_le_hoan": int(r2 * 100), "so_tien_hoan": a2, "ghi_chu": n2}
    return out


@read_tool(
    "reschedule_preview",
    "Xem trước hóa đơn đổi lịch một đơn sang khung giờ mới: tiền sân mới, đã thanh toán, số tiền phải trả thêm. KHÔNG thực hiện đổi.",
    {"ma_dat_san": P_str("Mã đơn"), "ngay": P_str("Ngày mới YYYY-MM-DD"),
     "gio_bat_dau": P_str("Giờ bắt đầu mới HH:MM"), "thoi_luong": P_num("Số giờ mới (mặc định giữ nguyên thời lượng cũ)")},
    ["ma_dat_san", "ngay", "gio_bat_dau"], roles=R_AUTHED, label="Xem trước hóa đơn khi đổi lịch", icon="🔮")
def reschedule_preview(ctx, a):
    b = base.find_booking(ctx, a.get("ma_dat_san"))
    start = parse_time(a["gio_bat_dau"])
    end = base.duration_end(start, a.get("thoi_luong") or b.so_gio)
    payload = BookingReschedule(ngay_dat=parse_date(a["ngay"]), gio_bat_dau=start, gio_ket_thuc=end)
    from app.routers import bookings as bk_router
    q = base.call_route(bk_router._reschedule_quote, ctx.db, b, payload)
    return {"ma_dat_san": b.ma_dat_san, "lich_moi": f"{a['ngay']} {hhmm(start)}-{hhmm(end)}",
            "tien_san_moi": q["tien_san_moi"], "tong_hoa_don_moi": q["tong_moi"], "da_thanh_toan": q["da_thanh_toan"],
            "can_thanh_toan_them": q["can_thanh_toan_them"],
            "ghi_chu": "Đơn sẽ về trạng thái Chờ xác nhận cho tới khi thanh toán phần chênh lệch." if q["can_thanh_toan_them"] > 0
            else "Không phải trả thêm, đổi lịch được ngay."}


# ============================================================ NHÂN SỰ (nhân viên / quản lý / admin)
@read_tool(
    "search_bookings",
    "Tìm/lọc đơn đặt sân của toàn hệ thống theo trạng thái, ngày, sân, từ khóa (mã đơn/tên khách/SĐT). "
    "chi_cho_xu_ly=true để lấy đơn đang chờ xác nhận hoặc khách đã báo chuyển khoản.",
    {"trang_thai": P_str("Trạng thái", STATUS_ENUM), "tu_ngay": P_str("Từ ngày YYYY-MM-DD"),
     "den_ngay": P_str("Đến ngày YYYY-MM-DD"), "san": P_str("Tên hoặc ID sân"),
     "tu_khoa": P_str("Mã đơn, tên khách hoặc số điện thoại"),
     "chi_cho_xu_ly": P_bool("Chỉ đơn chờ xác nhận / khách đã báo chuyển khoản"),
     "so_luong": P_int("Số đơn tối đa (mặc định 15, tối đa 40)")},
    roles=R_STAFF, label="Tìm & lọc đơn đặt sân", icon="🔍")
def search_bookings(ctx, a):
    q = ctx.db.query(Booking)
    if a.get("chi_cho_xu_ly"):
        q = q.filter(Booking.trang_thai == BookingStatus.CHO_XAC_NHAN)
    elif a.get("trang_thai") in STATUS_ENUM:
        q = q.filter(Booking.trang_thai == BookingStatus(a["trang_thai"]))
    if a.get("tu_ngay"):
        q = q.filter(Booking.ngay_dat >= parse_date(a["tu_ngay"]))
    if a.get("den_ngay"):
        q = q.filter(Booking.ngay_dat <= parse_date(a["den_ngay"]))
    if a.get("san"):
        f = base.find_field(ctx, a["san"] if str(a["san"]).isdigit() else None, a["san"] if not str(a["san"]).isdigit() else None)
        q = q.filter(Booking.san_id == f.id)
    if a.get("tu_khoa"):
        kw = f"%{str(a['tu_khoa']).strip()}%"
        from sqlalchemy import or_
        uid = ctx.db.query(User.id).filter(or_(User.ho_ten.ilike(kw), User.sdt.ilike(kw), User.email.ilike(kw))).scalar_subquery()
        q = q.filter(or_(Booking.ma_dat_san.ilike(kw), Booking.ten_khach_vang_lai.ilike(kw),
                         Booking.sdt_khach_vang_lai.ilike(kw), Booking.khach_hang_id.in_(uid)))
    total = q.count()
    limit = min(max(int(a.get("so_luong") or 15), 1), 40)
    rows = q.order_by(Booking.ngay_dat.desc(), Booking.gio_bat_dau.desc()).limit(limit).all()
    return {"tong_so_khop": total, "hien_thi": len(rows), "don": [_booking_row(b, ctx) for b in rows]}


@read_tool(
    "dashboard_today",
    "Tổng quan một ngày (mặc định hôm nay): doanh thu, số lượt đặt, số đơn hủy, tỷ lệ lấp đầy và lịch từng sân có đặt (giờ, khách, tình trạng).",
    {"ngay": P_str("Ngày YYYY-MM-DD (mặc định hôm nay)")}, roles=R_STAFF, label="Tổng quan doanh thu & lịch sân hôm nay", icon="📊")
def dashboard_today(ctx, a):
    from app.routers import reports
    ngay = parse_date(a["ngay"]) if a.get("ngay") else None
    d = base.call_route(reports.today_dashboard, ngay, ctx.db, ctx.user)
    label = {"huy": "đã hủy", "sap_toi": "sắp tới", "dang_da": "đang đá", "xong": "đã xong"}
    return {
        "ngay": d["ngay"], "doanh_thu": d["tong_doanh_thu"], "luot_dat": d["tong_luot_dat"], "luot_huy": d["so_luot_huy"],
        "so_khach": d["so_khach"], "ty_le_lap_day_phan_tram": d["ty_le_lap_day"],
        "lich_san": [{"san": s["ten_san"], "khung_gio": [
            f"{hhmm(x['gio_bat_dau'])}-{hhmm(x['gio_ket_thuc'])} {clean_text(x['ten_khach'], 25)} [{label[x['tinh_trang']]}]"
            + (f" +{len(x['dich_vu'])} dịch vụ" if x["dich_vu"] else "") + f" ({x['ma_dat_san']})" for x in s["slots"]]}
            for s in d["san"]],
    }


@read_tool(
    "pending_work",
    "Tổng hợp việc đang chờ xử lý: đơn chờ xác nhận, khách báo đã chuyển khoản, đơn hủy chờ hoàn tiền, dịch vụ sắp hết, "
    "ngày mai đã phân ca chưa, đánh giá thấp. Dùng khi hỏi 'có gì cần làm', 'tình hình hôm nay'.",
    {}, roles=R_STAFF, label="Việc đang chờ xử lý", icon="🔔")
def pending_work(ctx, a):
    db = ctx.db
    pend = db.query(Booking).filter(Booking.trang_thai == BookingStatus.CHO_XAC_NHAN).order_by(Booking.ngay_tao).all()
    claimed = [b for b in pend if b.khach_bao_chuyen_khoan]
    refunds = db.query(Booking).join(Invoice, Invoice.booking_id == Booking.id).filter(
        Booking.trang_thai == BookingStatus.HUY, Invoice.trang_thai == PaymentStatus.CHO_HOAN_TIEN).all()
    low = db.query(Service).filter(Service.trang_thai == ServiceStatus.HOAT_DONG, Service.ton_kho < 5).order_by(Service.ton_kho).all()
    tomorrow = ctx.today + timedelta(days=1)
    out = {
        "cho_xac_nhan": {"tong": len(pend), "khach_da_bao_chuyen_khoan": len(claimed),
                         "don": [_booking_row(b, ctx) for b in (claimed + [x for x in pend if x not in claimed])[:8]]},
        "cho_hoan_tien": {"tong": len(refunds), "chua_co_stk": sum(1 for b in refunds if not b.stk_hoan_tien),
                          "don": [b.ma_dat_san for b in refunds[:8]]},
        "dich_vu_sap_het": [f"{s.ten_dich_vu}: còn {s.ton_kho}" for s in low[:10]],
        "phan_ca_ngay_mai": {"ngay": tomorrow, "so_ca_da_phan": db.query(Shift).filter(Shift.ngay == tomorrow).count()},
    }
    if ctx.is_manager:
        out["danh_gia_thap_gan_day"] = db.query(Feedback).filter(Feedback.danh_gia_tong <= 2).count()
    return out


@read_tool(
    "list_shifts",
    "Xem lịch phân ca. Nhân viên chỉ xem được ca của chính mình; quản lý/admin xem được của mọi nhân viên.",
    {"tu_ngay": P_str("Từ ngày YYYY-MM-DD"), "den_ngay": P_str("Đến ngày YYYY-MM-DD"),
     "nhan_vien": P_str("Tên/ID/email nhân viên (chỉ quản lý/admin)")},
    roles=R_STAFF, label="Xem lịch phân ca", icon="🗓️")
def list_shifts_tool(ctx, a):
    from app.routers import shifts
    nv_id = None
    if ctx.role == NV:
        nv_id = ctx.user.id  # nhân viên bị giới hạn ở ca của mình, kể cả khi hỏi người khác
    elif a.get("nhan_vien"):
        nv_id = base.find_user(ctx, a["nhan_vien"], roles=[NV]).id
    tu = parse_date(a["tu_ngay"]) if a.get("tu_ngay") else ctx.today
    den = parse_date(a["den_ngay"]) if a.get("den_ngay") else tu + timedelta(days=7)
    rows = base.call_route(shifts.list_shifts, tu, den, nv_id, ctx.db, ctx.user)
    return {"tu": tu, "den": den, "so_ca": len(rows),
            "ca": [{"ngay": r["ngay"], "ca": "Sáng 6-14h" if r["ca_truc"].value == "SANG" else "Chiều 14-22h",
                    "nhan_vien": r["ten_nhan_vien"], "san_phu_trach": r["san_phu_trach"] or ""} for r in rows]}


# ============================================================ QUẢN LÝ / ADMIN
@read_tool(
    "staff_overview",
    "Tổng quan nhân viên và lương theo tháng: tình trạng làm việc, lương/ca, số ca đã làm, tổng lương, đã chuyển lương chưa.",
    {"thang": P_str("Tháng YYYY-MM (mặc định tháng hiện tại)")}, roles=R_MANAGER, label="Xem nhân viên, lương theo tháng", icon="👥")
def staff_overview(ctx, a):
    from app.routers import staff
    thang = a.get("thang")
    if thang and not (len(str(thang)) == 7 and str(thang)[4] == "-"):
        raise ToolError("Tháng cần định dạng YYYY-MM.")
    d = base.call_route(staff.salary_summary, thang or None, ctx.db, ctx.user)
    tt = {"DANG_LAM": "đang làm", "TAM_NGHI": "tạm nghỉ", "DA_NGHI": "đã nghỉ"}
    return {"thang": d["thang"], "nhan_vien": [
        {"id": n["id"], "ten": n["ho_ten"], "tinh_trang": tt.get(n["tinh_trang_lam_viec"], n["tinh_trang_lam_viec"]),
         "luong_moi_ca": n["luong_ca"], "so_ca_thang": n["so_ca_thang"], "tong_luong": n["tong_luong"],
         "da_chuyen_luong": n["da_chuyen"]} for n in d["nhan_vien"]],
        "tong_luong_thang": sum(n["tong_luong"] for n in d["nhan_vien"])}


@read_tool(
    "search_users",
    "Tra cứu tài khoản (khách hàng, nhân viên, quản lý…) theo tên/email/SĐT/vai trò/trạng thái. Không bao giờ trả mật khẩu.",
    {"tu_khoa": P_str("Tên, email hoặc SĐT"), "vai_tro": P_str("Vai trò", ["KHACH_HANG", "NHAN_VIEN", "QUAN_LY", "ADMIN"]),
     "trang_thai": P_str("Trạng thái tài khoản", ["HOAT_DONG", "VO_HIEU_HOA"])},
    roles=R_MANAGER, label="Tra cứu tài khoản", icon="👤")
def search_users(ctx, a):
    q = ctx.db.query(User)
    if a.get("vai_tro") in {r.value for r in UserRole}:
        q = q.filter(User.vai_tro == UserRole(a["vai_tro"]))
    if a.get("trang_thai") in {s.value for s in UserStatus}:
        q = q.filter(User.trang_thai == UserStatus(a["trang_thai"]))
    if a.get("tu_khoa"):
        kw = f"%{str(a['tu_khoa']).strip()}%"
        q = q.filter((User.ho_ten.ilike(kw)) | (User.email.ilike(kw)) | (User.sdt.ilike(kw)))
    total = q.count()
    rows = q.order_by(User.id.desc()).limit(20).all()
    return {"tong_so_khop": total, "hien_thi": len(rows), "tai_khoan": [
        {"id": u.id, "ho_ten": u.ho_ten, "email": u.email, "sdt": u.sdt, "vai_tro": u.vai_tro.value,
         "trang_thai": u.trang_thai.value, "ngay_tao": u.ngay_tao} for u in rows]}


@read_tool(
    "revenue_report",
    "Báo cáo kinh doanh trong một khoảng ngày. loai: tong_quan (doanh thu, lượt đặt, khách, sân/giờ nổi bật), "
    "doanh_thu (chi tiết theo ngày/tuần/tháng), xep_hang_san (sân nào đặt nhiều, lấp đầy), gio_cao_diem (giờ đắt khách).",
    {"loai": P_str("Loại báo cáo", ["tong_quan", "doanh_thu", "xep_hang_san", "gio_cao_diem"]),
     "tu_ngay": P_str("Từ ngày YYYY-MM-DD"), "den_ngay": P_str("Đến ngày YYYY-MM-DD"),
     "nhom_theo": P_str("Nhóm doanh thu theo", ["NGAY", "TUAN", "THANG"])},
    ["loai", "tu_ngay", "den_ngay"], roles=R_MANAGER, label="Báo cáo doanh thu, xếp hạng sân, giờ cao điểm", icon="📈")
def revenue_report(ctx, a):
    from app.routers import reports
    tu, den = parse_date(a["tu_ngay"], "từ ngày"), parse_date(a["den_ngay"], "đến ngày")
    if tu > den:
        raise ToolError("Ngày bắt đầu không được sau ngày kết thúc.")
    if (den - tu).days > 731:
        raise ToolError("Chỉ báo cáo tối đa 2 năm mỗi lần.")
    loai = a.get("loai")
    if loai == "doanh_thu":
        nhom = a.get("nhom_theo") if a.get("nhom_theo") in ("NGAY", "TUAN", "THANG") else "NGAY"
        return base.call_route(reports.revenue_report, tu, den, nhom, ctx.db, ctx.user)
    if loai == "xep_hang_san":
        return {"xep_hang": base.call_route(reports.field_ranking, tu, den, ctx.db, ctx.user)}
    if loai == "gio_cao_diem":
        return {"top_3": base.call_route(reports.peak_hours, tu, den, ctx.db, ctx.user)["top_3"]}
    return base.call_route(reports.summary_report, tu, den, ctx.db, ctx.user)


@read_tool(
    "list_feedbacks",
    "Xem đánh giá của khách (sao, nhận xét) và thống kê điểm trung bình; lọc theo số sao hoặc sân.",
    {"so_sao_toi_da": P_int("Chỉ lấy đánh giá có số sao ≤ giá trị này"), "so_sao_toi_thieu": P_int("Chỉ lấy ≥ giá trị này"),
     "san": P_str("Tên hoặc ID sân")},
    roles=R_MANAGER, label="Xem đánh giá của khách", icon="⭐")
def list_feedbacks_tool(ctx, a):
    from app.routers import feedbacks
    san_id = base.find_field(ctx, a["san"] if str(a["san"]).isdigit() else None, a["san"] if not str(a["san"]).isdigit() else None).id if a.get("san") else None
    rows = base.call_route(feedbacks.list_feedbacks, san_id, a.get("so_sao_toi_thieu"), a.get("so_sao_toi_da"), ctx.db)
    stats = base.call_route(feedbacks.feedback_stats, ctx.db, ctx.user)
    return {"thong_ke": stats, "so_danh_gia_khop": len(rows), "danh_gia": [
        {"sao": r["danh_gia_tong"], "san": r["ten_san"], "khach": r["ten_khach"], "nhan_xet": clean_text(r["nhan_xet"], 120),
         "ngay": r["ngay_tao"]} for r in rows[:15]]}


@read_tool(
    "list_refunds",
    "Danh sách đơn đã hủy đang chờ hoàn tiền: số tiền phải hoàn, khách đã gửi số tài khoản chưa (số tài khoản được che, chỉ hiện 4 số cuối).",
    {"chi_thieu_stk": P_bool("Chỉ lấy đơn khách chưa gửi số tài khoản")}, roles=R_MANAGER, label="Đơn chờ hoàn tiền", icon="💸")
def list_refunds(ctx, a):
    rows = ctx.db.query(Booking).join(Invoice, Invoice.booking_id == Booking.id).filter(
        Booking.trang_thai == BookingStatus.HUY, Invoice.trang_thai == PaymentStatus.CHO_HOAN_TIEN).order_by(Booking.ngay_huy.desc()).all()
    out = []
    for b in rows:
        if a.get("chi_thieu_stk") and b.stk_hoan_tien:
            continue
        rate = b.ty_le_hoan_tien if b.ty_le_hoan_tien is not None else 0.5
        out.append({"ma_dat_san": b.ma_dat_san, "khach": b.khach_hang.ho_ten if b.khach_hang else (b.ten_khach_vang_lai or "Khách lẻ"),
                    "ty_le": int(rate * 100), "so_tien_hoan": base.num(amount_paid(b)) * rate,
                    "da_gui_stk": bool(b.stk_hoan_tien), "ngan_hang": b.ngan_hang_hoan_tien,
                    "so_tai_khoan": mask_account(b.stk_hoan_tien), "chu_tk": b.ten_tk_hoan_tien})
    return {"tong": len(out), "don": out[:20]}


@read_tool(
    "view_chat_audit",
    "Xem nhật ký hoạt động của chatbot: các câu bị chặn, thao tác được đề xuất/thực hiện, ai làm, khi nào.",
    {"chi_bi_chan": P_bool("Chỉ xem các câu bị chặn"), "so_luong": P_int("Số dòng (mặc định 15, tối đa 50)")},
    roles=frozenset({AD}), label="Xem nhật ký hoạt động chatbot", icon="🛡️")
def view_chat_audit(ctx, a):
    from app.models import ChatAuditLog
    q = ctx.db.query(ChatAuditLog)
    if a.get("chi_bi_chan"):
        q = q.filter(ChatAuditLog.loai == "BLOCKED")
    rows = q.order_by(ChatAuditLog.id.desc()).limit(min(int(a.get("so_luong") or 15), 50)).all()
    return {"nhat_ky": [{"thoi_gian": r.ngay_tao, "loai": r.loai, "vai_tro": r.vai_tro, "user_id": r.user_id,
                         "cong_cu": r.cong_cu, "chi_tiet": clean_text(r.chi_tiet, 160), "ket_qua": clean_text(r.ket_qua, 100)} for r in rows]}
