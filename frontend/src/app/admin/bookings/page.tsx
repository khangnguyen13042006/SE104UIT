"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPost, apiDelete, formatVND, formatDate } from "@/lib/api";
import {
  Loader2, CheckCircle2, DollarSign, Search, X, Calendar,
  Filter, Clock, XCircle, RotateCcw, Ban, Package, Plus, Trash2, Minus
} from "lucide-react";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  CHO_XAC_NHAN: { text: "Chờ xác nhận", cls: "bg-accent/20 text-accent border-accent/30" },
  DA_XAC_NHAN: { text: "Đã xác nhận", cls: "bg-chart-3/20 text-chart-3 border-chart-3/30" },
  DANG_SU_DUNG: { text: "Đang sử dụng", cls: "bg-chart-4/20 text-chart-4 border-chart-4/30" },
  HOAN_THANH: { text: "Hoàn thành", cls: "bg-primary/20 text-primary border-primary/30" },
  HUY: { text: "Đã hủy", cls: "bg-destructive/20 text-destructive border-destructive/30" },
};

export default function BookingsAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Record<number, any>>({});
  const [filter, setFilter] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [keywordInput, setKeywordInput] = useState<string>("");
  const [tuNgay, setTuNgay] = useState<string>("");
  const [denNgay, setDenNgay] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [serviceTarget, setServiceTarget] = useState<any>(null);

  // KHANG: Hàm dọn dẹp hệ thống tự động gọi API dọn dẹp ở Backend
  async function runAutoClean() {
    try {
      // Gọi API để Backend quét hủy đơn quá 60p và hoàn thành đơn qua giờ
      await apiPost('/api/bookings/run-auto-tasks');
      console.log("[AUTO-CLEAN] Hệ thống đã được dọn dẹp tự động.");
    } catch (e) {
      console.error("[AUTO-CLEAN ERROR]", e);
    }
  }

  async function load() {
    setLoading(true);
    try {
      // Mỗi lần load trang sẽ kích hoạt dọn dẹp tự động 1 lần
      await runAutoClean(); 

      const p = new URLSearchParams();
      if (filter) p.set("trang_thai", filter);
      if (keyword.trim()) p.set("keyword", keyword.trim());
      if (tuNgay) p.set("tu_ngay", tuNgay);
      if (denNgay) p.set("den_ngay", denNgay);

      const [bookings, invs] = await Promise.all([
        apiGet(`/api/bookings?${p}`),
        apiGet(`/api/invoices`).catch(() => []),
      ]);
      setList(bookings);
      const invMap: Record<number, any> = {};
      for (const inv of invs) invMap[inv.booking_id] = inv;
      setInvoices(invMap);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [filter, keyword, tuNgay, denNgay]);

  function applySearch(e: React.FormEvent) { e.preventDefault(); setKeyword(keywordInput); }
  function resetFilters() { setKeywordInput(""); setKeyword(""); setFilter(""); setTuNgay(""); setDenNgay(""); }

  // Các hàm xử lý nghiệp vụ khác (confirm, complete, pay...)
  async function confirmRefund(id: number) {
    if (!confirm("Xác nhận đã hoàn tiền cho booking này?")) return;
    try { await apiPost(`/api/bookings/${id}/confirm-refund`); load(); } catch (e: any) { alert(e.message); }
  }

  async function markComplete(id: number) {
    if (!confirm("Đánh dấu đơn này đã hoàn thành?")) return;
    try { await apiPost(`/api/bookings/${id}/complete`); load(); } catch (e: any) { alert(e.message); }
  }

  const hasFilters = !!(keyword || filter || tuNgay || denNgay);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Lịch Đặt Sân</h1>
        <p className="text-muted-foreground">Tự động hủy đơn quá hạn và cập nhật trạng thái hoàn thành</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-3xl border border-border p-6 space-y-4">
        <form onSubmit={applySearch} className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="Mã BK, tên khách, SĐT..." className="w-full pl-12 pr-4 py-3 rounded-2xl border border-input bg-background outline-none focus:border-primary" />
          </div>
          <button type="submit" className="px-6 py-3 rounded-2xl bg-primary text-white font-semibold">Tìm kiếm</button>
          <button type="button" onClick={load} className="px-4 py-3 rounded-2xl bg-accent text-accent-foreground font-medium flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> Làm mới & Dọn dẹp
          </button>
        </form>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-3xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr className="text-xs font-semibold text-muted-foreground uppercase">
                <th className="p-4 text-left">Mã</th>
                <th className="p-4 text-left">Khách</th>
                <th className="p-4 text-left">Thời gian</th>
                <th className="p-4 text-right">Tổng tiền</th>
                <th className="p-4 text-center">Trạng thái</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((b) => {
                const st = STATUS_LABEL[b.trang_thai];
                return (
                  <tr key={b.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="p-4 font-mono font-bold text-primary">{b.ma_dat_san}</td>
                    <td className="p-4">
                      <div className="font-medium">{b.ten_khach}</div>
                      <div className="text-xs text-muted-foreground">{b.sdt_khach}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium">{formatDate(b.ngay_dat)}</div>
                      <div className="text-xs text-muted-foreground">{b.gio_bat_dau?.slice(0,5)} - {b.gio_ket_thuc?.slice(0,5)}</div>
                    </td>
                    <td className="p-4 text-right font-bold">{formatVND(b.invoice?.tong_cong || b.tien_san)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${st?.cls}`}>{st?.text}</span>
                    </td>
                    <td className="p-4 flex justify-end gap-2">
                      {b.trang_thai === "DA_XAC_NHAN" && (
                        <button onClick={() => markComplete(b.id)} className="p-2 bg-primary/10 text-primary rounded-lg" title="Hoàn thành đơn">
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                      )}
                      {(b.trang_thai === "CHO_XAC_NHAN" || b.trang_thai === "DA_XAC_NHAN") && (
                        <button onClick={() => setCancelTarget(b)} className="p-2 bg-destructive/10 text-destructive rounded-lg" title="Hủy đơn">
                          <XCircle className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
