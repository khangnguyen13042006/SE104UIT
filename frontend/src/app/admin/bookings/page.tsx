"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPost, formatVND, formatDate } from "@/lib/api";
import {
  Loader2, CheckCircle2, DollarSign, Search, X, Calendar,
  Filter, Clock, XCircle, RotateCcw, Receipt, User, Phone, MapPin, Package
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
  const [billTarget, setBillTarget] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [lyDoHuy, setLyDoHuy] = useState("");

  async function load() {
    setLoading(true);
    try {
      // Tự động dọn dẹp đơn cũ mỗi khi truy cập
      await apiPost("/api/bookings/run-auto-tasks", {});
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

  // --- Các hàm xử lý nghiệp vụ ---
  async function confirmBooking(id: number) {
    if (!confirm("Xác nhận đơn đặt sân này?")) return;
    try {
      await apiPost(`/api/bookings/${id}/confirm`, {}); // Giả định bạn có endpoint này hoặc dùng chung update
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function markComplete(id: number) {
    if (!confirm("Khách đã đá xong? Hệ thống sẽ tự hoàn đồ thuê vào kho.")) return;
    try { await apiPost(`/api/bookings/${id}/complete`, {}); load(); } catch (e: any) { alert(e.message); }
  }

  async function handleCancel() {
    if (!lyDoHuy.trim()) return alert("Vui lòng nhập lý do");
    try {
      await apiPost(`/api/bookings/${cancelTarget.id}/cancel`, { ly_do_huy: lyDoHuy });
      setCancelTarget(null); setLyDoHuy(""); load();
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="space-y-6 font-serif">
      <div className="flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">Quản Lý Vận Hành</h1>
          <p className="text-muted-foreground text-sm italic">Xác nhận, hoàn thành và in hóa đơn</p>
        </div>
        <button onClick={load} className="p-3 bg-secondary rounded-2xl hover:bg-secondary/80 transition-all">
          <RotateCcw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Bộ lọc */}
      <div className="flex flex-wrap gap-3 bg-card p-4 rounded-3xl border border-border shadow-sm">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Tìm khách, mã đơn..." className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-input bg-background outline-none focus:border-primary" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-input bg-background font-medium text-sm outline-none cursor-pointer">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="CHO_XAC_NHAN">Chờ xác nhận</option>
          <option value="DA_XAC_NHAN">Đã xác nhận</option>
          <option value="HOAN_THANH">Hoàn thành</option>
        </select>
      </div>

      {/* Bảng danh sách */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
      ) : (
        <div className="bg-card rounded-3xl border border-border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-secondary/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              <tr>
                <th className="p-4">Thông tin đơn</th>
                <th className="p-4">Thời gian</th>
                <th className="p-4 text-right">Tổng tiền</th>
                <th className="p-4 text-center">Trạng thái</th>
                <th className="p-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(b => (
                <tr key={b.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-primary font-mono">{b.ma_dat_san}</div>
                    <div className="text-xs font-semibold">{b.ten_khach}</div>
                  </td>
                  <td className="p-4 text-sm">
                    <div className="font-semibold">{formatDate(b.ngay_dat)}</div>
                    <div className="text-xs opacity-60">{b.gio_bat_dau?.slice(0,5)} - {b.gio_ket_thuc?.slice(0,5)}</div>
                  </td>
                  <td className="p-4 text-right font-bold">
                    {formatVND(b.invoice?.tong_cong || b.tien_san)}
                  </td>
                  <td className="p-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${STATUS_LABEL[b.trang_thai]?.cls}`}>{STATUS_LABEL[b.trang_thai]?.text}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-1.5">
                      {/* NÚT XÁC NHẬN (Dành cho đơn Chờ) */}
                      {b.trang_thai === "CHO_XAC_NHAN" && (
                        <button onClick={() => confirmBooking(b.id)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all" title="Xác nhận đơn">
                          <CheckCircle2 size={18}/>
                        </button>
                      )}

                      {/* NÚT HOÀN THÀNH (Dành cho đơn đã xác nhận) */}
                      {b.trang_thai === "DA_XAC_NHAN" && (
                        <button onClick={() => markComplete(b.id)} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all" title="Hoàn thành">
                          <DollarSign size={18}/>
                        </button>
                      )}

                      {/* NÚT XEM BILL (Hiện cho tất cả) */}
                      <button onClick={() => setBillTarget(b)} className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all" title="Xem hóa đơn">
                        <Receipt size={18}/>
                      </button>

                      {/* NÚT HỦY ĐƠN */}
                      {["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(b.trang_thai) && (
                        <button onClick={() => setCancelTarget(b)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all" title="Hủy đơn">
                          <XCircle size={18}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Bill (Giữ nguyên giao diện đẹp của bạn) */}
      <AnimatePresence>
        {billTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white text-slate-900 w-full max-w-xl rounded-sm shadow-2xl overflow-hidden border-t-8 border-primary">
              <div className="p-8 border-b border-dashed border-slate-200 text-center relative">
                <button onClick={() => setBillTarget(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900"><X size={20}/></button>
                <h2 className="text-xl font-bold uppercase mb-1">Hóa Đơn Sân Bóng</h2>
                <p className="text-xs font-mono opacity-60">{billTarget.ma_dat_san}</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 text-xs gap-4">
                  <div><p className="font-bold opacity-40 uppercase">Khách hàng</p><p className="font-bold">{billTarget.ten_khach}</p></div>
                  <div className="text-right"><p className="font-bold opacity-40 uppercase">Thời gian</p><p className="font-bold">{formatDate(billTarget.ngay_dat)}</p></div>
                </div>
                <table className="w-full text-xs">
                  <thead className="border-b-2 border-slate-900 uppercase font-bold">
                    <tr><th className="py-2 text-left">Mục</th><th className="py-2 text-right">Tiền</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr><td className="py-3 font-medium">Tiền thuê sân ({billTarget.so_gio}h)</td><td className="py-3 text-right font-bold">{formatVND(billTarget.tien_san)}</td></tr>
                    {billTarget.services?.map((s: any) => (
                      <tr key={s.id}><td className="py-3">{s.ten_dich_vu} x{s.so_luong}</td><td className="py-3 text-right font-bold">{formatVND(s.thanh_tien)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="pt-4 border-t border-slate-200 flex justify-between items-end">
                  <span className="font-bold uppercase">Tổng cộng</span>
                  <span className="text-2xl font-black text-primary">{formatVND(billTarget.invoice?.tong_cong || billTarget.tien_san)}</span>
                </div>
                <button onClick={() => window.print()} className="w-full py-3 bg-slate-900 text-white font-bold text-[10px] uppercase rounded-sm">In Hóa Đơn</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Hủy Đơn */}
      <AnimatePresence>
        {cancelTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="bg-card w-full max-w-sm rounded-3xl border border-border p-6">
              <h3 className="text-xl font-bold mb-4">Lý do hủy đơn</h3>
              <textarea value={lyDoHuy} onChange={e => setLyDoHuy(e.target.value)} placeholder="Nhập lý do..." className="w-full p-4 rounded-2xl bg-secondary/50 border border-border outline-none min-h-[100px] mb-4" />
              <div className="flex gap-2">
                <button onClick={() => setCancelTarget(null)} className="flex-1 py-3 font-bold">Đóng</button>
                <button onClick={handleCancel} className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-bold">Xác nhận hủy</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
