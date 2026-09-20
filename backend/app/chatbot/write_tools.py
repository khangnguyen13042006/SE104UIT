"""Công cụ GHI của chatbot. `prepare` chỉ kiểm tra + dựng Proposal (không đổi dữ liệu); `execute` chạy khi người dùng
bấm xác nhận, gọi đúng hàm của router thường dùng nên giữ nguyên mọi quy tắc nghiệp vụ, email, hoàn tiền..."""
from datetime import timedelta
from decimal import Decimal

from app.core.config import (
    BookingStatus, FieldStatus, FieldType, ServiceStatus, ShiftType, UserRole, UserStatus, WorkStatus,
)
from app.models import Shift
from app.schemas import (
    BookingCancel, BookingReschedule, FieldCreate, FieldUpdate, ServiceCreate, ServiceUpdate, ShiftCreate, UserUpdate,
)
from . import base
from .base import (
    P_bool, P_int, P_num, P_str, Proposal, R_ADMIN, R_AUTHED, R_MANAGER, R_STAFF, ToolError, call_route as call,
    clean_text, hhmm, parse_date, parse_time, vnd, write_tool,
)
from .read_tools import _cancel_outcome


def MSG(t):
    return {"message": t}


def _slot(b):
    return f"{b.ngay_dat} {hhmm(b.gio_bat_dau)}-{hhmm(b.gio_ket_thuc)}"


def _ok_status(b, allowed):
    if b.trang_thai not in allowed:
        raise ToolError(f"Đơn {b.ma_dat_san} đang '{base.STATUS_LABEL[b.trang_thai.value]}' nên không thao tác được.")


def _svc(ctx, ident, only_active=False):
    s = str(ident or "").strip()
    return base.find_service(ctx, s if s.isdigit() else None, None if s.isdigit() else s, only_active=only_active)


def _nv(ctx, ident):
    return base.find_user(ctx, ident, roles=[base.NV])


# ============================================================ ĐƠN ĐẶT SÂN
@write_tool("cancel_booking",
            "Hủy một đơn (khách chỉ hủy được đơn của mình). Hoàn tiền tự động theo chính sách (≥24h: 50%, <24h: 0%). "
            "loi_tu_san=true (chỉ quản lý/admin) khi sân gặp sự cố → hoàn 100%.",
            {"ma_dat_san": P_str("Mã đơn"), "ly_do": P_str("Lý do hủy"), "loi_tu_san": P_bool("Lỗi từ phía sân (chỉ quản lý/admin)")},
            ["ma_dat_san", "ly_do"], roles=R_AUTHED, label="Hủy đơn đặt sân", icon="🚫", danger=True, confirm_label="Hủy đơn")
def cancel_prepare(ctx, a):
    b = base.find_booking(ctx, a.get("ma_dat_san"))
    _ok_status(b, (BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN))
    ly_do = clean_text(a.get("ly_do"), 200)
    if len(ly_do) < 3:
        raise ToolError("Cần lý do hủy (ít nhất 3 ký tự).")
    do_san = bool(a.get("loi_tu_san")) and ctx.is_manager
    _, rate, amount, note = _cancel_outcome(ctx, b, do_san)
    return Proposal(f"Hủy đơn {b.ma_dat_san}",
                    [("Sân", b.san.ten_san), ("Giờ", _slot(b)), ("Lý do", ly_do),
                     ("Hoàn tiền", f"{int(rate * 100)}% = {vnd(amount)}"), ("Ghi chú", note)],
                    {"ma_dat_san": b.ma_dat_san, "ly_do": ly_do, "loi_tu_san": do_san}, danger=True, confirm_label="Hủy đơn")


@cancel_prepare.executor
def cancel_exec(ctx, a):
    from app.routers import bookings as bk
    b = base.find_booking(ctx, a["ma_dat_san"])
    call(bk.cancel_booking, b.id, BookingCancel(ly_do_huy=a["ly_do"], loi_tu_san=a.get("loi_tu_san")), ctx.db, ctx.user)
    return MSG(f"Đã hủy đơn {b.ma_dat_san}. Khoản hoàn (nếu có) được xử lý theo chính sách.")


@write_tool("reschedule_booking",
            "Đổi ngày/giờ một đơn sang khung trống khác (khách chỉ đổi đơn của mình). Nếu tổng tiền tăng thì phải trả thêm phần chênh lệch.",
            {"ma_dat_san": P_str("Mã đơn"), "ngay": P_str("Ngày mới YYYY-MM-DD"), "gio_bat_dau": P_str("Giờ mới HH:MM"),
             "thoi_luong": P_num("Số giờ (mặc định giữ nguyên)")},
            ["ma_dat_san", "ngay", "gio_bat_dau"], roles=R_AUTHED, label="Đổi lịch đặt sân", icon="🔁", confirm_label="Đổi lịch")
def resched_prepare(ctx, a):
    from app.routers import bookings as bk
    b = base.find_booking(ctx, a.get("ma_dat_san"))
    start = parse_time(a.get("gio_bat_dau"))
    end = base.duration_end(start, a.get("thoi_luong") or b.so_gio)
    ngay = parse_date(a.get("ngay"))
    q = call(bk._reschedule_quote, ctx.db, b, BookingReschedule(ngay_dat=ngay, gio_bat_dau=start, gio_ket_thuc=end))
    return Proposal(f"Đổi lịch đơn {b.ma_dat_san}",
                    [("Lịch cũ", _slot(b)), ("Lịch mới", f"{ngay} {hhmm(start)}-{hhmm(end)}"),
                     ("Tổng hóa đơn mới", vnd(q["tong_moi"])), ("Phải trả thêm", vnd(q["can_thanh_toan_them"]))],
                    {"ma_dat_san": b.ma_dat_san, "ngay": str(ngay), "gio_bat_dau": hhmm(start), "gio_ket_thuc": hhmm(end)},
                    confirm_label="Đổi lịch")


@resched_prepare.executor
def resched_exec(ctx, a):
    from app.routers import bookings as bk
    b = base.find_booking(ctx, a["ma_dat_san"])
    payload = BookingReschedule(ngay_dat=parse_date(a["ngay"]), gio_bat_dau=parse_time(a["gio_bat_dau"]),
                                gio_ket_thuc=parse_time(a["gio_ket_thuc"]))
    call(bk.reschedule_booking, b.id, payload, ctx.db, ctx.user)
    return MSG(f"Đã đổi lịch đơn {b.ma_dat_san} sang {a['ngay']} {a['gio_bat_dau']}-{a['gio_ket_thuc']}.")


@write_tool("confirm_booking", "Xác nhận đơn đang chờ (nhân viên đã nhận tiền).", {"ma_dat_san": P_str("Mã đơn")},
            ["ma_dat_san"], roles=R_STAFF, label="Xác nhận đơn đặt sân", icon="✅", confirm_label="Xác nhận đơn")
def confirm_prepare(ctx, a):
    b = base.find_booking(ctx, a.get("ma_dat_san"))
    _ok_status(b, (BookingStatus.CHO_XAC_NHAN,))
    total = base.num(b.invoice.tong_cong) if b.invoice else b.tien_san
    return Proposal(f"Xác nhận đơn {b.ma_dat_san}",
                    [("Sân", b.san.ten_san), ("Giờ", _slot(b)), ("Sẽ ghi nhận đã thu", vnd(total))],
                    {"ma_dat_san": b.ma_dat_san}, confirm_label="Xác nhận đơn")


@confirm_prepare.executor
def confirm_exec(ctx, a):
    from app.routers import bookings as bk
    b = base.find_booking(ctx, a["ma_dat_san"])
    call(bk.confirm_booking, b.id, ctx.db, ctx.user)
    return MSG(f"Đã xác nhận đơn {b.ma_dat_san}.")


@write_tool("complete_booking", "Đánh dấu đơn đã đá xong (hoàn thành, thu đủ tiền, trả kho đồ thuê).", {"ma_dat_san": P_str("Mã đơn")},
            ["ma_dat_san"], roles=R_STAFF, label="Hoàn thành đơn", icon="🏁", confirm_label="Hoàn thành")
def complete_prepare(ctx, a):
    b = base.find_booking(ctx, a.get("ma_dat_san"))
    _ok_status(b, (BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN, BookingStatus.DANG_SU_DUNG))
    return Proposal(f"Hoàn thành đơn {b.ma_dat_san}", [("Sân", b.san.ten_san), ("Giờ", _slot(b))],
                    {"ma_dat_san": b.ma_dat_san}, confirm_label="Hoàn thành")


@complete_prepare.executor
def complete_exec(ctx, a):
    from app.routers import bookings as bk
    b = base.find_booking(ctx, a["ma_dat_san"])
    call(bk.complete_booking, b.id, ctx.db, ctx.user)
    return MSG(f"Đã hoàn thành đơn {b.ma_dat_san}.")


@write_tool("add_service_to_booking", "Thêm dịch vụ (nước, giày…) vào hóa đơn một đơn đang hoạt động.",
            {"ma_dat_san": P_str("Mã đơn"), "dich_vu": P_str("Tên hoặc ID dịch vụ"), "so_luong": P_int("Số lượng (mặc định 1)")},
            ["ma_dat_san", "dich_vu"], roles=R_STAFF, label="Thêm dịch vụ vào đơn", icon="🛒", confirm_label="Thêm vào bill")
def addsvc_prepare(ctx, a):
    b = base.find_booking(ctx, a.get("ma_dat_san"))
    _ok_status(b, (BookingStatus.CHO_XAC_NHAN, BookingStatus.DA_XAC_NHAN, BookingStatus.DANG_SU_DUNG))
    s = _svc(ctx, a.get("dich_vu"), only_active=True)
    n = int(a.get("so_luong") or 1)
    if n <= 0 or n > s.ton_kho:
        raise ToolError(f"Số lượng không hợp lệ hoặc vượt tồn kho (còn {s.ton_kho}).")
    return Proposal(f"Thêm dịch vụ vào đơn {b.ma_dat_san}",
                    [("Dịch vụ", f"{s.ten_dich_vu} × {n}"), ("Thành tiền", vnd(s.don_gia * n))],
                    {"ma_dat_san": b.ma_dat_san, "dich_vu_id": s.id, "so_luong": n}, confirm_label="Thêm vào bill")


@addsvc_prepare.executor
def addsvc_exec(ctx, a):
    from app.routers import bookings as bk
    b = base.find_booking(ctx, a["ma_dat_san"])
    call(bk.add_booking_service, b.id, {"dich_vu_id": a["dich_vu_id"], "so_luong": a["so_luong"]}, ctx.db, ctx.user)
    return MSG(f"Đã thêm dịch vụ vào đơn {b.ma_dat_san}.")


@write_tool("confirm_refund", "Xác nhận đã chuyển tiền hoàn cho đơn đã hủy (chờ hoàn tiền → đã hoàn).", {"ma_dat_san": P_str("Mã đơn")},
            ["ma_dat_san"], roles=R_STAFF, label="Xác nhận đã hoàn tiền", icon="💸", confirm_label="Đã hoàn tiền")
def refund_prepare(ctx, a):
    from app.routers import bookings as bk
    b = base.find_booking(ctx, a.get("ma_dat_san"))
    _ok_status(b, (BookingStatus.HUY,))
    return Proposal(f"Xác nhận hoàn tiền đơn {b.ma_dat_san}",
                    [("Số tiền hoàn", vnd(bk._refund_amount(b))), ("Ngân hàng", b.ngan_hang_hoan_tien or "(khách chưa gửi STK)"),
                     ("STK", base.mask_account(b.stk_hoan_tien))], {"ma_dat_san": b.ma_dat_san}, confirm_label="Đã hoàn tiền")


@refund_prepare.executor
def refund_exec(ctx, a):
    from app.routers import bookings as bk
    b = base.find_booking(ctx, a["ma_dat_san"])
    call(bk.confirm_refund, b.id, ctx.db, ctx.user)
    return MSG(f"Đã ghi nhận hoàn tiền đơn {b.ma_dat_san}.")


# ============================================================ DỊCH VỤ
@write_tool("create_service", "Tạo dịch vụ mới.",
            {"ten": P_str("Tên dịch vụ"), "don_gia": P_num("Đơn giá (đ)"), "don_vi": P_str("Đơn vị tính (mặc định Cái)"),
             "ton_kho": P_int("Tồn kho ban đầu"), "do_thue": P_bool("Là đồ cho thuê (trả lại kho khi đơn xong)")},
            ["ten", "don_gia"], roles=R_MANAGER, label="Tạo dịch vụ mới", icon="📦", confirm_label="Tạo dịch vụ")
def csvc_prepare(ctx, a):
    ten = clean_text(a.get("ten"), 100)
    gia = base.num(a.get("don_gia"))
    if not ten or gia < 0:
        raise ToolError("Cần tên dịch vụ và đơn giá ≥ 0.")
    args = {"ten": ten, "don_gia": gia, "don_vi": clean_text(a.get("don_vi") or "Cái", 20),
            "ton_kho": max(0, int(a.get("ton_kho") or 0)), "do_thue": bool(a.get("do_thue"))}
    return Proposal(f"Tạo dịch vụ '{ten}'",
                    [("Đơn giá", f"{vnd(gia)}/{args['don_vi']}"), ("Tồn kho", args["ton_kho"]),
                     ("Đồ cho thuê", "có" if args["do_thue"] else "không")], args, confirm_label="Tạo dịch vụ")


@csvc_prepare.executor
def csvc_exec(ctx, a):
    from app.routers import services
    call(services.create_service,
         ServiceCreate(ten_dich_vu=a["ten"], don_gia=Decimal(str(a["don_gia"])), don_vi_tinh=a["don_vi"],
                       ton_kho=a["ton_kho"], la_cho_thue=a["do_thue"]), ctx.db, ctx.user)
    return MSG(f"Đã tạo dịch vụ '{a['ten']}'.")


@write_tool("update_service", "Sửa dịch vụ: đổi giá, tồn kho, tên, đơn vị hoặc tạm ngưng/kích hoạt.",
            {"dich_vu": P_str("Tên hoặc ID dịch vụ"), "ten_moi": P_str("Tên mới"), "don_gia": P_num("Giá mới"),
             "ton_kho": P_int("Tồn kho mới (số tuyệt đối)"), "don_vi": P_str("Đơn vị mới"),
             "trang_thai": P_str("Trạng thái", [s.value for s in ServiceStatus])},
            ["dich_vu"], roles=R_MANAGER, label="Sửa dịch vụ (giá, tồn kho, trạng thái)", icon="✏️", confirm_label="Cập nhật")
def usvc_prepare(ctx, a):
    s = _svc(ctx, a.get("dich_vu"))
    ch, lines = {}, []
    if a.get("ten_moi"):
        ch["ten_dich_vu"] = clean_text(a["ten_moi"], 100)
        lines.append(("Tên", f"{s.ten_dich_vu} → {ch['ten_dich_vu']}"))
    if a.get("don_gia") is not None:
        g = base.num(a["don_gia"])
        if g < 0:
            raise ToolError("Giá không được âm.")
        ch["don_gia"] = g
        lines.append(("Giá", f"{vnd(s.don_gia)} → {vnd(g)}"))
    if a.get("ton_kho") is not None:
        t = int(a["ton_kho"])
        if t < 0:
            raise ToolError("Tồn kho không được âm.")
        ch["ton_kho"] = t
        lines.append(("Tồn kho", f"{s.ton_kho} → {t}"))
    if a.get("don_vi"):
        ch["don_vi_tinh"] = clean_text(a["don_vi"], 20)
        lines.append(("Đơn vị", ch["don_vi_tinh"]))
    if a.get("trang_thai") in {x.value for x in ServiceStatus}:
        ch["trang_thai"] = a["trang_thai"]
        lines.append(("Trạng thái", a["trang_thai"]))
    if not ch:
        raise ToolError("Chưa có thay đổi nào (giá, tồn kho, tên, đơn vị hoặc trạng thái).")
    return Proposal(f"Sửa dịch vụ '{s.ten_dich_vu}'", lines, {"id": s.id, "changes": ch}, confirm_label="Cập nhật")


@usvc_prepare.executor
def usvc_exec(ctx, a):
    from app.routers import services
    call(services.update_service, a["id"], ServiceUpdate(**a["changes"]), ctx.db, ctx.user)
    return MSG("Đã cập nhật dịch vụ.")


# ============================================================ SÂN
@write_tool("create_field", "Tạo sân mới.",
            {"ten": P_str("Tên sân"), "loai_san": P_str("Loại", ["SAN_5", "SAN_7", "SAN_11"]), "suc_chua": P_int("Sức chứa"),
             "gia_thuong": P_num("Giá giờ thường"), "gia_cao_diem": P_num("Giá giờ cao điểm"), "mo_ta": P_str("Mô tả")},
            ["ten", "loai_san", "suc_chua", "gia_thuong", "gia_cao_diem"], roles=R_MANAGER, label="Tạo sân mới", icon="🏟️",
            confirm_label="Tạo sân")
def cfield_prepare(ctx, a):
    if a.get("loai_san") not in {t.value for t in FieldType}:
        raise ToolError("Loại sân phải là SAN_5, SAN_7 hoặc SAN_11.")
    ten, sc = clean_text(a.get("ten"), 100), int(a.get("suc_chua") or 0)
    g1, g2 = base.num(a.get("gia_thuong")), base.num(a.get("gia_cao_diem"))
    if not ten or sc <= 0 or g1 <= 0 or g2 < g1:
        raise ToolError("Cần tên, sức chứa > 0, giá > 0 và giá cao điểm ≥ giá thường.")
    return Proposal(f"Tạo sân '{ten}'",
                    [("Loại", a["loai_san"]), ("Sức chứa", sc), ("Giá thường", vnd(g1)), ("Giá cao điểm", vnd(g2))],
                    {"ten": ten, "loai_san": a["loai_san"], "suc_chua": sc, "g1": g1, "g2": g2,
                     "mo_ta": clean_text(a.get("mo_ta"), 300) or None}, confirm_label="Tạo sân")


@cfield_prepare.executor
def cfield_exec(ctx, a):
    from app.routers import fields
    call(fields.create_field,
         FieldCreate(ten_san=a["ten"], loai_san=a["loai_san"], suc_chua=a["suc_chua"], gia_tieu_chuan=Decimal(str(a["g1"])),
                     gia_cao_diem=Decimal(str(a["g2"])), mo_ta=a["mo_ta"]), ctx.db, ctx.user)
    return MSG(f"Đã tạo sân '{a['ten']}'.")


@write_tool("update_field", "Sửa sân: giá thường/cao điểm, trạng thái (hoạt động/bảo trì/đóng cửa), tên, mô tả.",
            {"san": P_str("Tên hoặc ID sân"), "gia_thuong": P_num("Giá giờ thường mới"), "gia_cao_diem": P_num("Giá cao điểm mới"),
             "trang_thai": P_str("Trạng thái", ["HOAT_DONG", "BAO_TRI", "DONG_CUA"]), "ten_moi": P_str("Tên mới"),
             "mo_ta": P_str("Mô tả mới")},
            ["san"], roles=R_MANAGER, label="Sửa sân (giá, trạng thái)", icon="🛠️", confirm_label="Cập nhật sân")
def ufield_prepare(ctx, a):
    s = str(a.get("san") or "").strip()
    f = base.find_field(ctx, s if s.isdigit() else None, None if s.isdigit() else s, only_active=False)
    ch, lines = {}, []
    for key, col, lbl in (("gia_thuong", "gia_tieu_chuan", "Giá thường"), ("gia_cao_diem", "gia_cao_diem", "Giá cao điểm")):
        if a.get(key) is not None:
            v = base.num(a[key])
            if v <= 0:
                raise ToolError("Giá phải > 0.")
            ch[col] = v
            lines.append((lbl, f"{vnd(getattr(f, col))} → {vnd(v)}"))
    if a.get("trang_thai") in {x.value for x in FieldStatus}:
        ch["trang_thai"] = a["trang_thai"]
        lines.append(("Trạng thái", f"{f.trang_thai.value} → {a['trang_thai']}"))
    if a.get("ten_moi"):
        ch["ten_san"] = clean_text(a["ten_moi"], 100)
        lines.append(("Tên", ch["ten_san"]))
    if a.get("mo_ta"):
        ch["mo_ta"] = clean_text(a["mo_ta"], 300)
        lines.append(("Mô tả", ch["mo_ta"]))
    if not ch:
        raise ToolError("Chưa có thay đổi nào cho sân.")
    if ch.get("gia_cao_diem", base.num(f.gia_cao_diem)) < ch.get("gia_tieu_chuan", base.num(f.gia_tieu_chuan)):
        raise ToolError("Giá cao điểm phải ≥ giá thường.")
    return Proposal(f"Sửa sân '{f.ten_san}'", lines, {"id": f.id, "changes": ch}, confirm_label="Cập nhật sân")


@ufield_prepare.executor
def ufield_exec(ctx, a):
    from app.routers import fields
    call(fields.update_field, a["id"], FieldUpdate(**a["changes"]), ctx.db, ctx.user)
    return MSG("Đã cập nhật sân.")


# ============================================================ NHÂN VIÊN / CA / LƯƠNG
@write_tool("create_shift", "Phân ca trực cho nhân viên (ngày phải từ ngày mai trở đi).",
            {"nhan_vien": P_str("Tên/ID/email nhân viên"), "ngay": P_str("Ngày YYYY-MM-DD"), "ca": P_str("Ca", ["SANG", "CHIEU"]),
             "san_phu_trach": P_str("ID các sân phụ trách, cách nhau bằng dấu phẩy (tùy chọn)")},
            ["nhan_vien", "ngay", "ca"], roles=R_MANAGER, label="Phân ca nhân viên", icon="🗓️", confirm_label="Phân ca")
def cshift_prepare(ctx, a):
    nv, ngay = _nv(ctx, a.get("nhan_vien")), parse_date(a.get("ngay"))
    if a.get("ca") not in {c.value for c in ShiftType}:
        raise ToolError("Ca phải là SANG (6-14h) hoặc CHIEU (14-22h).")
    if ngay < ctx.today + timedelta(days=1):
        raise ToolError("Phân ca phải lập tối thiểu từ ngày mai.")
    fids = [int(x) for x in str(a.get("san_phu_trach") or "").replace(" ", "").split(",") if x.isdigit()]
    return Proposal(f"Phân ca cho {nv.ho_ten}",
                    [("Ngày", str(ngay)), ("Ca", "Sáng 6-14h" if a["ca"] == "SANG" else "Chiều 14-22h"),
                     ("Sân phụ trách", ", ".join(map(str, fids)) or "không")],
                    {"nv_id": nv.id, "ngay": str(ngay), "ca": a["ca"], "san": fids}, confirm_label="Phân ca")


@cshift_prepare.executor
def cshift_exec(ctx, a):
    from app.routers import shifts
    call(shifts.create_shift,
         ShiftCreate(nhan_vien_id=a["nv_id"], ngay=parse_date(a["ngay"]), ca_truc=a["ca"], san_phu_trach=a["san"]),
         ctx.db, ctx.user)
    return MSG(f"Đã phân ca {a['ca']} ngày {a['ngay']}.")


@write_tool("delete_shift", "Xóa một ca trực đã phân.",
            {"nhan_vien": P_str("Tên/ID/email nhân viên"), "ngay": P_str("Ngày YYYY-MM-DD"), "ca": P_str("Ca", ["SANG", "CHIEU"])},
            ["nhan_vien", "ngay", "ca"], roles=R_MANAGER, label="Xóa ca trực", icon="🗑️", danger=True, confirm_label="Xóa ca")
def dshift_prepare(ctx, a):
    nv, ngay = _nv(ctx, a.get("nhan_vien")), parse_date(a.get("ngay"))
    s = ctx.db.query(Shift).filter(Shift.nhan_vien_id == nv.id, Shift.ngay == ngay, Shift.ca_truc == a.get("ca")).first()
    if not s:
        raise ToolError(f"{nv.ho_ten} không có ca {a.get('ca')} ngày {ngay}.")
    return Proposal(f"Xóa ca của {nv.ho_ten}", [("Ngày", str(ngay)), ("Ca", a["ca"])], {"shift_id": s.id},
                    danger=True, confirm_label="Xóa ca")


@dshift_prepare.executor
def dshift_exec(ctx, a):
    from app.routers import shifts
    call(shifts.delete_shift, a["shift_id"], ctx.db, ctx.user)
    return MSG("Đã xóa ca trực.")


@write_tool("update_staff", "Sửa nhân viên: lương mỗi ca (áp dụng từ ngày mai) hoặc tình trạng làm việc (đang làm/tạm nghỉ/đã nghỉ).",
            {"nhan_vien": P_str("Tên/ID/email nhân viên"), "luong_ca": P_int("Lương mỗi ca (đ)"),
             "tinh_trang": P_str("Tình trạng", ["DANG_LAM", "TAM_NGHI", "DA_NGHI"])},
            ["nhan_vien"], roles=R_MANAGER, label="Sửa lương/tình trạng nhân viên", icon="👥", confirm_label="Cập nhật")
def ustaff_prepare(ctx, a):
    nv, ch, lines = _nv(ctx, a.get("nhan_vien")), {}, []
    if a.get("luong_ca") is not None:
        luong = int(a["luong_ca"])
        if luong < 0:
            raise ToolError("Lương không được âm.")
        ch["luong_ca"] = luong
        lines.append(("Lương/ca", vnd(luong)))
    if a.get("tinh_trang") in {w.value for w in WorkStatus}:
        ch["tinh_trang_lam_viec"] = a["tinh_trang"]
        lines.append(("Tình trạng", a["tinh_trang"]))
    if not ch:
        raise ToolError("Chưa có thay đổi (luong_ca hoặc tinh_trang).")
    return Proposal(f"Sửa nhân viên {nv.ho_ten}", lines, {"id": nv.id, "changes": ch}, confirm_label="Cập nhật")


@ustaff_prepare.executor
def ustaff_exec(ctx, a):
    from app.routers import staff
    call(staff.update_staff, a["id"], staff.StaffUpdate(**a["changes"]), ctx.db, ctx.user)
    return MSG("Đã cập nhật nhân viên.")


@write_tool("confirm_salary", "Xác nhận (hoặc bỏ xác nhận) đã chuyển lương tháng cho nhân viên.",
            {"nhan_vien": P_str("Tên/ID/email nhân viên"), "thang": P_str("Tháng YYYY-MM"),
             "da_chuyen": P_bool("true = đã chuyển, false = bỏ xác nhận")},
            ["nhan_vien", "thang"], roles=R_MANAGER, label="Xác nhận chuyển lương", icon="💵", confirm_label="Xác nhận")
def salary_prepare(ctx, a):
    nv, thang = _nv(ctx, a.get("nhan_vien")), str(a.get("thang") or "")
    if not (len(thang) == 7 and thang[4] == "-"):
        raise ToolError("Tháng cần định dạng YYYY-MM.")
    da = a.get("da_chuyen") is not False
    return Proposal(f"{'Xác nhận' if da else 'Bỏ xác nhận'} lương {nv.ho_ten}", [("Tháng", thang)],
                    {"id": nv.id, "thang": thang, "da": da}, confirm_label="Xác nhận")


@salary_prepare.executor
def salary_exec(ctx, a):
    from app.routers import staff
    call(staff.confirm_salary, staff.SalaryConfirm(nhan_vien_id=a["id"], thang=a["thang"], da_chuyen=a["da"]), ctx.db, ctx.user)
    return MSG("Đã cập nhật trạng thái chuyển lương.")


# ============================================================ TÀI KHOẢN (chỉ admin)
@write_tool("update_user", "Sửa tài khoản: đổi vai trò, khóa/mở khóa (VO_HIEU_HOA/HOAT_DONG), sửa tên. Không sửa được tài khoản của chính mình.",
            {"tai_khoan": P_str("ID/email/SĐT/tên"), "vai_tro": P_str("Vai trò mới", ["KHACH_HANG", "NHAN_VIEN", "QUAN_LY", "ADMIN"]),
             "trang_thai": P_str("Trạng thái", ["HOAT_DONG", "VO_HIEU_HOA"]), "ho_ten": P_str("Họ tên mới")},
            ["tai_khoan"], roles=R_ADMIN, label="Sửa/khóa tài khoản, đổi vai trò", icon="👤", danger=True,
            confirm_label="Cập nhật tài khoản")
def uuser_prepare(ctx, a):
    u = base.find_user(ctx, a.get("tai_khoan"))
    if u.id == ctx.user.id:
        raise ToolError("Không thể sửa tài khoản của chính mình qua chatbot.")
    ch, lines = {}, []
    if a.get("vai_tro") in {r.value for r in UserRole}:
        ch["vai_tro"] = a["vai_tro"]
        lines.append(("Vai trò", f"{u.vai_tro.value} → {a['vai_tro']}"))
    if a.get("trang_thai") in {s.value for s in UserStatus}:
        ch["trang_thai"] = a["trang_thai"]
        lines.append(("Trạng thái", a["trang_thai"]))
    if a.get("ho_ten"):
        ch["ho_ten"] = clean_text(a["ho_ten"], 100)
        lines.append(("Họ tên", ch["ho_ten"]))
    if not ch:
        raise ToolError("Chưa có thay đổi nào cho tài khoản.")
    return Proposal(f"Sửa tài khoản {u.ho_ten} ({u.email})", lines, {"id": u.id, "changes": ch}, danger=True,
                    confirm_label="Cập nhật tài khoản")


@uuser_prepare.executor
def uuser_exec(ctx, a):
    from app.routers import users
    if a["id"] == ctx.user.id:
        raise ToolError("Không thể sửa tài khoản của chính mình qua chatbot.")
    call(users.update_user, a["id"], UserUpdate(**a["changes"]), ctx.db, ctx.user)
    return MSG("Đã cập nhật tài khoản.")


@write_tool("delete_staff", "XÓA vĩnh viễn một nhân viên (kèm ca trực, lịch sử lương). Không hoàn tác được.",
            {"nhan_vien": P_str("Tên/ID/email nhân viên")}, ["nhan_vien"], roles=R_ADMIN, label="Xóa nhân viên", icon="⚠️",
            danger=True, confirm_label="Xóa vĩnh viễn")
def dstaff_prepare(ctx, a):
    nv = _nv(ctx, a.get("nhan_vien"))
    return Proposal(f"XÓA nhân viên {nv.ho_ten}", [("Email", nv.email), ("Hậu quả", "xóa toàn bộ ca trực và lịch sử lương, không hoàn tác")],
                    {"id": nv.id}, danger=True, confirm_label="Xóa vĩnh viễn")


@dstaff_prepare.executor
def dstaff_exec(ctx, a):
    from app.routers import staff
    call(staff.delete_staff, a["id"], ctx.db, ctx.user)
    return MSG("Đã xóa nhân viên.")
