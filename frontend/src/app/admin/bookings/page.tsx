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

  // Gọi Backend dọn dẹp đơn quá hạn 60p và hoàn thành đơn qua giờ
  async function runAutoClean() {
    try {
      await apiPost('/api/bookings/run-auto-tasks');
      console.log("[AUTO-CLEAN] Hệ thống đã dọn dẹp xong.");
    } catch (e) {
      console.error("[AUTO-CLEAN ERROR]", e);
    }
  }

  async function load() {
    setLoading(true);
    try {
      // Tự động dọn dẹp mỗi khi load lại danh sách
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

  async function markComplete(id: number) {
    if (!confirm("Xác nhận lịch chơi này đã kết thúc?")) return;
    try { await apiPost(`/api/bookings/${id}/complete`); load(); } 
    catch (e: any) { alert(e.message); }
  }

  const hasFilters = !!(keyword || filter || tuNgay || denNgay);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Quản Lý Vận Hành</h1>
        <p className="text-muted-foreground">Tự động xử lý đơn quá hạn khi tải trang</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-3xl border border-border p-6 space-y-4 shadow-sm">
        <form onSubmit={applySearch} className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="Tìm mã đơn, khách hàng..." className="w-full pl-12 pr-4 py-3 rounded-2xl border border-input bg-background outline-none focus:border-primary" />
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
              <tr className="text-xs font-bold text-muted-foreground uppercase">
                <th className="p-4 text-left">Mã</th>
                <th className="p-4 text-left">Khách</th>
                <th className="p-4 text-left">Ngày đặt</th>
                <th className="p-4 text-right">Thành tiền</th>
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
                    <td className="p-4 font-medium">{b.ten_khach}</td>
                    <td className="p-4 text-sm">{formatDate(b.ngay_dat)}</td>
                    <td className="p-4 text-right font-bold">{formatVND(b.invoice?.tong_cong || b.tien_san)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${st?.cls}`}>{st?.text}</span>
                    </td>
                    <td className="p-4 flex justify-end gap-2">
                      {b.trang_thai === "DA_XAC_NHAN" && (
                        <button onClick={() => markComplete(b.id)} className="p-2 text-primary hover:bg-primary/10 rounded-lg"><CheckCircle2 className="w-5 h-5"/></button>
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
