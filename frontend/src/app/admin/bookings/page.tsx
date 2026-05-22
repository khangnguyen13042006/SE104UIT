"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPost, apiDelete, formatVND, formatDate } from "@/lib/api";
import {
  Loader2, CheckCircle2, DollarSign, Search, X, Calendar,
  Filter, Clock, XCircle, RotateCcw, Ban, Package, Plus, Trash2, Minus, Eye
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
  const [serviceTarget, setServiceTarget] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [lyDoHuy, setLyDoHuy] = useState("");

  async function load() {
    setLoading(true);
    try {
      await apiPost('/api/bookings/run-auto-tasks', {}); // Tự động dọn dẹp khi load
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

  async function handleCancel() {
    if (!lyDoHuy.trim()) return alert("Vui lòng nhập lý do");
    try {
      await apiPost(`/api/bookings/${cancelTarget.id}/cancel`, { ly_do_huy: lyDoHuy });
      setCancelTarget(null); setLyDoHuy(""); load();
    } catch (e: any) { alert(e.message); }
  }

  async function markComplete(id: number) {
    if (!confirm("Xác nhận hoàn thành?")) return;
    try { await apiPost(`/api/bookings/${id}/complete`, {}); load(); } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold">Quản Lý Lịch Đặt</h1>
          <p className="text-muted-foreground text-sm">Xem chi tiết đơn và dịch vụ đi kèm</p>
        </div>
        <button onClick={load} className="p-3 bg-secondary rounded-2xl hover:bg-secondary/80 transition-all">
          <RotateCcw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-3 bg-card p-4 rounded-3xl border border-border">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Tìm tên khách, mã đơn..." className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-input bg-background outline-none focus:border-primary" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-input bg-background font-medium text-sm outline-none cursor-pointer">
          <option value="ALL">Tất cả trạng thái</option>
          <option value="CHO_XAC_NHAN">Chờ xác nhận</option>
          <option value="DA_XAC_NHAN">Đã xác nhận</option>
          <option value="HOAN_THANH">Hoàn thành</option>
          <option value="HUY">Đã hủy</option>
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-20 gap-3"><Loader2 className="animate-spin w-8 h-8 text-primary" /><p className="text-sm font-medium">Đang đồng bộ dữ liệu...</p></div>
      ) : (
        <div className="bg-card rounded-3xl border border-border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-secondary/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              <tr>
                <th className="p-4">Đơn đặt</th>
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
                    <div className="font-medium">{formatDate(b.ngay_dat)}</div>
                    <div className="text-xs text-muted-foreground">{b.gio_bat_dau?.slice(0,5)} - {b.gio_ket_thuc?.slice(0,5)}</div>
                  </td>
                  <td className="p-4 text-right font-bold text-foreground">
                    {formatVND(b.invoice?.tong_cong || b.tien_san)}
                    {b.services?.length > 0 && <div className="text-[9px] text-muted-foreground italic">Gồm dịch vụ</div>}
                  </td>
                  <td className="p-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_LABEL[b.trang_thai]?.cls}`}>{STATUS_LABEL[b.trang_thai]?.text}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setServiceTarget(b)} className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-all" title="Xem dịch vụ"><Package size={18}/></button>
                      {b.trang_thai === "DA_XAC_NHAN" && <button onClick={() => markComplete(b.id)} className="p-2 hover:bg-emerald-100 text-emerald-600 rounded-lg"><CheckCircle2 size={18}/></button>}
                      {["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(b.trang_thai) && <button onClick={() => setCancelTarget(b)} className="p-2 hover:bg-red-100 text-red-600 rounded-lg"><XCircle size={18}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Xem Dịch Vụ */}
      <AnimatePresence>
        {serviceTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-card w-full max-w-md rounded-3xl border border-border p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Chi tiết dịch vụ</h3>
                <button onClick={() => setServiceTarget(null)}><X size={20}/></button>
              </div>
              <div className="space-y-3">
                {serviceTarget.services?.length > 0 ? serviceTarget.services.map((s: any) => (
                  <div key={s.id} className="flex justify-between p-4 bg-secondary/30 rounded-2xl border border-border">
                    <div><div className="font-bold text-sm">{s.ten_dich_vu}</div><div className="text-[10px] opacity-60">Số lượng: {s.so_luong}</div></div>
                    <div className="font-bold text-primary">{formatVND(s.thanh_tien)}</div>
                  </div>
                )) : <div className="py-10 text-center text-muted-foreground italic">Không kèm dịch vụ</div>}
              </div>
              <button onClick={() => setServiceTarget(null)} className="w-full mt-6 py-3 bg-secondary font-bold rounded-2xl hover:bg-secondary/80">Đóng</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Hủy */}
      <AnimatePresence>
        {cancelTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="bg-card w-full max-w-sm rounded-3xl p-6 border border-border">
              <h3 className="text-xl font-bold mb-4 italic">Lý do hủy đơn</h3>
              <textarea value={lyDoHuy} onChange={e => setLyDoHuy(e.target.value)} placeholder="Nhập lý do..." className="w-full p-4 rounded-2xl bg-secondary/50 border border-border outline-none min-h-[100px] mb-4 text-sm" />
              <div className="flex gap-2">
                <button onClick={() => setCancelTarget(null)} className="flex-1 py-3 font-bold text-sm">Quay lại</button>
                <button onClick={handleCancel} className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-bold text-sm">Xác nhận hủy</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
