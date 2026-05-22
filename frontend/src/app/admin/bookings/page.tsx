"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPost, formatVND, formatDate } from "@/lib/api";
import {
  Loader2, CheckCircle2, Search, X, Calendar,
  Filter, Clock, XCircle, RotateCcw, Package, Receipt, User, Phone, MapPin
} from "lucide-react";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  CHO_XAC_NHAN: { text: "Chờ xác nhận", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  DA_XAC_NHAN: { text: "Đã xác nhận", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  DANG_SU_DUNG: { text: "Đang sử dụng", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  HOAN_THANH: { text: "Hoàn thành", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  HUY: { text: "Đã hủy", cls: "bg-red-100 text-red-700 border-red-200" },
};

export default function BookingsAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [billTarget, setBillTarget] = useState<any>(null); // State dành cho Modal Bill

  async function load() {
    setLoading(true);
    try {
      await apiPost("/api/bookings/run-auto-tasks", {}); // Tự động dọn dẹp
      const data = await apiGet("/api/bookings");
      setList(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = list.filter(b => {
    const matchSearch = b.ten_khach?.toLowerCase().includes(keyword.toLowerCase()) || b.ma_dat_san?.toLowerCase().includes(keyword.toLowerCase());
    const matchStatus = statusFilter === "ALL" || b.trang_thai === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6 font-serif">
      <div className="flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">Quản Lý Lịch Đặt & Hóa Đơn</h1>
          <p className="text-muted-foreground text-sm italic">Quản lý vận hành và in hóa đơn chi tiết</p>
        </div>
        <button onClick={load} className="p-3 bg-secondary rounded-2xl hover:bg-secondary/80 transition-all">
          <RotateCcw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Thanh tìm kiếm */}
      <div className="flex flex-wrap gap-3 bg-card p-4 rounded-3xl border border-border shadow-sm">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Tìm tên khách, mã đơn..." className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-input bg-background outline-none focus:border-primary transition-all" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-input bg-background font-medium text-sm outline-none cursor-pointer">
          <option value="ALL">Tất cả lịch đặt</option>
          <option value="CHO_XAC_NHAN">Chờ xác nhận</option>
          <option value="DA_XAC_NHAN">Đã xác nhận</option>
          <option value="HOAN_THANH">Hoàn thành</option>
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-20 gap-3"><Loader2 className="animate-spin w-8 h-8 text-primary" /><p className="text-sm font-medium animate-pulse">Đang đồng bộ dữ liệu hóa đơn...</p></div>
      ) : (
        <div className="bg-card rounded-3xl border border-border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-secondary/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
              <tr>
                <th className="p-4">Mã Đơn</th>
                <th className="p-4">Khách Hàng</th>
                <th className="p-4">Thời Gian</th>
                <th className="p-4 text-right">Tổng Tiền</th>
                <th className="p-4 text-center">Trạng Thái</th>
                <th className="p-4 text-right">Hành Động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(b => (
                <tr key={b.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="p-4 font-mono font-bold text-primary">{b.ma_dat_san}</td>
                  <td className="p-4 font-medium">{b.ten_khach}</td>
                  <td className="p-4 text-sm">
                    <div className="font-semibold">{formatDate(b.ngay_dat)}</div>
                    <div className="text-xs opacity-60 italic">{b.gio_bat_dau?.slice(0,5)} - {b.gio_ket_thuc?.slice(0,5)}</div>
                  </td>
                  <td className="p-4 text-right font-bold text-foreground">
                    {formatVND(b.invoice?.tong_cong || b.tien_san)}
                  </td>
                  <td className="p-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${STATUS_LABEL[b.trang_thai]?.cls}`}>{STATUS_LABEL[b.trang_thai]?.text}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-1">
                      {/* Nút Xem Bill chính */}
                      <button onClick={() => setBillTarget(b)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg transition-all text-xs font-bold shadow-sm">
                        <Receipt size={14}/> Xem Bill
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Hóa Đơn (Chi tiết Bill) */}
      <AnimatePresence>
        {billTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white text-slate-900 w-full max-w-2xl rounded-sm shadow-2xl overflow-hidden my-auto border-t-8 border-primary">
              
              {/* Header Bill */}
              <div className="p-8 border-b border-dashed border-slate-200 text-center relative">
                <button onClick={() => setBillTarget(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900"><X size={24}/></button>
                <h2 className="text-2xl font-bold uppercase tracking-tighter mb-1">Hóa Đơn Thanh Toán</h2>
                <p className="text-sm opacity-60 font-mono">ID: {billTarget.ma_dat_san}</p>
                <div className="mt-4 flex justify-center items-center gap-6 text-xs font-medium opacity-80 uppercase">
                   <span className="flex items-center gap-1"><Calendar size={12}/> {formatDate(billTarget.ngay_dat)}</span>
                   <span className="flex items-center gap-1"><Clock size={12}/> {billTarget.gio_bat_dau?.slice(0,5)} - {billTarget.gio_ket_thuc?.slice(0,5)}</span>
                </div>
              </div>

              {/* Thông tin khách hàng */}
              <div className="px-8 py-6 grid grid-cols-2 gap-8 bg-slate-50/50">
                <div className="space-y-1">
                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Khách hàng</p>
                   <p className="font-bold flex items-center gap-2"><User size={14}/> {billTarget.ten_khach}</p>
                   <p className="text-xs flex items-center gap-2 italic"><Phone size={12}/> {billTarget.sdt_khach || "N/A"}</p>
                </div>
                <div className="space-y-1 text-right">
                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Sân Bóng</p>
                   <p className="font-bold flex items-center justify-end gap-2">{billTarget.ten_san || "Sân Bóng Đá"} <MapPin size={14}/></p>
                   <p className="text-xs italic">{billTarget.loai_san === "SAN_5" ? "Sân 5 người" : "Sân 7 người"}</p>
                </div>
              </div>

              {/* Bảng chi tiết tiền */}
              <div className="p-8">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-900 text-[10px] uppercase font-black tracking-widest">
                      <th className="py-3 text-left">Mô tả chi tiết</th>
                      <th className="py-3 text-center">SL</th>
                      <th className="py-3 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Mục Tiền Sân */}
                    <tr className="group">
                      <td className="py-4">
                        <div className="font-bold">Tiền thuê sân bóng</div>
                        <div className="text-[10px] opacity-60">Đơn giá cơ bản: {formatVND(billTarget.tien_san / (billTarget.so_gio || 1))}/h</div>
                      </td>
                      <td className="py-4 text-center font-medium">{billTarget.so_gio || 1}h</td>
                      <td className="py-4 text-right font-bold">{formatVND(billTarget.tien_san)}</td>
                    </tr>

                    {/* Danh sách dịch vụ (nếu có) */}
                    {billTarget.services?.map((s: any) => (
                      <tr key={s.id}>
                        <td className="py-4">
                          <div className="font-bold">{s.ten_dich_vu}</div>
                          <div className="text-[10px] opacity-60">Đơn giá: {formatVND(s.don_gia)}</div>
                        </td>
                        <td className="py-4 text-center font-medium">x{s.so_luong}</td>
                        <td className="py-4 text-right font-bold">{formatVND(s.thanh_tien)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Phần tính tổng */}
                <div className="mt-8 space-y-3 pt-6 border-t border-slate-200">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="opacity-60">Tạm tính:</span>
                    <span>{formatVND((billTarget.invoice?.tong_cong || billTarget.tien_san) + (billTarget.invoice?.giam_gia || 0))}</span>
                  </div>
                  {billTarget.invoice?.giam_gia > 0 && (
                    <div className="flex justify-between text-xs font-medium text-primary">
                      <span>Giảm giá membership:</span>
                      <span>-{formatVND(billTarget.invoice.giam_gia)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-end pt-2">
                    <span className="text-sm font-black uppercase tracking-tighter">Tổng cộng thanh toán</span>
                    <span className="text-3xl font-black text-primary tracking-tighter">
                      {formatVND(billTarget.invoice?.tong_cong || billTarget.tien_san)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Bill */}
              <div className="bg-slate-900 text-white p-6 text-center">
                 <p className="text-[10px] uppercase font-bold tracking-[0.3em] mb-1">Cảm ơn quý khách!</p>
                 <p className="text-[8px] opacity-50 italic font-mono">Hóa đơn điện tử khởi tạo từ hệ thống datsan.se104uit.com</p>
              </div>

              <div className="p-4 flex gap-2 bg-slate-50">
                 <button onClick={() => window.print()} className="flex-1 py-3 border border-slate-200 font-bold text-xs uppercase hover:bg-white transition-all">In hóa đơn (Print)</button>
                 <button onClick={() => setBillTarget(null)} className="flex-1 py-3 bg-slate-900 text-white font-bold text-xs uppercase hover:bg-slate-800 transition-all">Đóng</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
