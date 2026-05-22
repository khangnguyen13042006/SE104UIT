"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPost, apiDelete, formatVND, formatDate } from "@/lib/api";
import {
  Loader2, CheckCircle2, DollarSign, Search, X, Calendar,
  Filter, Clock, XCircle, RotateCcw, Ban, Package, Plus, Trash2, Minus, Receipt
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
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  
  // KHANG: State cho Modal Quản lý dịch vụ & Bill
  const [serviceTarget, setServiceTarget] = useState<any>(null);

  async function runAutoClean() {
    try {
      await apiPost('/api/bookings/run-auto-tasks');
    } catch (e) { console.error(e); }
  }

  async function load() {
    setLoading(true);
    try {
      await runAutoClean(); 
      const p = new URLSearchParams();
      if (filter) p.set("trang_thai", filter);
      if (keyword.trim()) p.set("keyword", keyword.trim());

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

  useEffect(() => { load(); }, [filter, keyword]);

  function applySearch(e: React.FormEvent) { e.preventDefault(); setKeyword(keywordInput); }

  async function markComplete(id: number) {
    if (!confirm("Đánh dấu đơn này đã hoàn thành?")) return;
    try { await apiPost(`/api/bookings/${id}/complete`); load(); } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground font-display">Lịch Đặt Sân</h1>
        <p className="text-muted-foreground italic text-sm">Quản lý dịch vụ và hóa đơn cho tất cả các đơn đặt</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-3xl border border-border p-6 space-y-4 shadow-sm">
        <form onSubmit={applySearch} className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="Mã đơn, tên khách..." className="w-full pl-12 pr-4 py-3 rounded-2xl border border-input bg-background outline-none focus:border-primary" />
          </div>
          <button type="submit" className="px-6 py-3 rounded-2xl bg-primary text-white font-semibold">Tìm kiếm</button>
          <button type="button" onClick={load} className="px-4 py-3 rounded-2xl bg-accent text-accent-foreground font-medium flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> Làm mới
          </button>
        </form>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-secondary/50">
              <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <th className="p-4">Đơn đặt</th>
                <th className="p-4">Thời gian</th>
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
                    <td className="p-4">
                      <div className="font-bold text-primary font-mono text-sm">{b.ma_dat_san}</div>
                      <div className="text-xs font-semibold text-foreground opacity-80">{b.ten_khach}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium">{formatDate(b.ngay_dat)}</div>
                      <div className="text-[10px] text-muted-foreground">{b.gio_bat_dau?.slice(0,5)} - {b.gio_ket_thuc?.slice(0,5)}</div>
                    </td>
                    <td className="p-4 text-right font-bold text-foreground">
                      {formatVND(b.invoice?.tong_cong || b.tien_san)}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${st?.cls}`}>{st?.text}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-1.5">
                        {/* KHANG: Nút cái hộp cho tất cả các đơn */}
                        <button 
                          onClick={() => setServiceTarget(b)}
                          className="p-2 hover:bg-primary/10 text-primary rounded-xl transition-all"
                          title="Dịch vụ & Hóa đơn"
                        >
                          <Package className="w-5 h-5" />
                        </button>

                        {b.trang_thai === "DA_XAC_NHAN" && (
                          <button onClick={() => markComplete(b.id)} className="p-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl" title="Hoàn thành">
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                        )}
                        {["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(b.trang_thai) && (
                          <button onClick={() => setCancelTarget(b)} className="p-2 bg-red-50 text-red-600 border border-red-100 rounded-xl" title="Hủy đơn">
                            <XCircle className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL QUẢN LÝ DỊCH VỤ & BILL (Được lấy từ file page (6).tsx) */}
      <AnimatePresence>
        {serviceTarget && (
          <ServicesManagerModal 
            booking={serviceTarget} 
            onClose={() => setServiceTarget(null)} 
            onChanged={() => load()} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// KHANG: Modal này bao gồm cả nút Hộp và hiển thị Bill chi tiết luôn
function ServicesManagerModal({ booking, onClose, onChanged }: any) {
  const [services, setServices] = useState<any[]>([]);
  const [current, setCurrent] = useState<any[]>(booking.services || []);
  const [invoice, setInvoice] = useState<any>(booking.invoice || null);
  const [selectedSvc, setSelectedSvc] = useState<number>(0);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);

  async function loadServices() {
    const r = await apiGet("/api/services?trang_thai=HOAT_DONG");
    setServices(r);
    if (r.length > 0) setSelectedSvc(r[0].id);
  }
  useEffect(() => { loadServices(); }, []);

  async function reload() {
    const updated = await apiGet(`/api/bookings/${booking.id}`);
    setCurrent(updated.services || []);
    setInvoice(updated.invoice || null);
    onChanged();
  }

  async function addSvc() {
    setLoading(true);
    try {
      await apiPost(`/api/bookings/${booking.id}/services`, { dich_vu_id: selectedSvc, so_luong: qty });
      await reload();
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-3xl w-full max-w-lg shadow-2xl border border-border overflow-hidden font-serif">
        <div className="p-5 border-b border-border flex justify-between items-center bg-secondary/20">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2 uppercase tracking-tighter"><Receipt className="w-5 h-5 text-primary"/> Chi tiết hóa đơn</h3>
            <p className="text-[10px] font-mono text-muted-foreground uppercase">{booking.ma_dat_san} · {booking.ten_san}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-all"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Bill Items Section */}
          <div className="space-y-4">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Hạng mục thanh toán</div>
            <div className="flex justify-between items-center bg-secondary/30 p-3 rounded-xl border border-border border-dashed">
               <div><div className="font-bold text-sm italic">Tiền thuê sân</div><div className="text-[10px] opacity-60">Theo lịch đặt gốc</div></div>
               <div className="font-bold">{formatVND(booking.tien_san)}</div>
            </div>
            
            {current.map((bs: any) => (
              <div key={bs.id} className="flex justify-between items-center p-3 rounded-xl bg-secondary/10 border border-border">
                <div><div className="font-semibold text-sm">{bs.ten_dich_vu}</div><div className="text-[10px] opacity-60">x{bs.so_luong} đơn giá {formatVND(bs.don_gia)}</div></div>
                <div className="font-bold text-primary">{formatVND(bs.thanh_tien)}</div>
              </div>
            ))}
          </div>

          {/* Add Service (Chỉ hiện nếu đơn chưa hoàn thành) */}
          {!["HOAN_THANH", "HUY"].includes(booking.trang_thai) && (
            <div className="pt-4 border-t border-border border-dashed">
              <div className="flex gap-2">
                <select value={selectedSvc} onChange={(e) => setSelectedSvc(parseInt(e.target.value))} className="flex-1 p-2.5 rounded-xl border border-input bg-background text-sm outline-none">
                  {services.map((s) => (<option key={s.id} value={s.id} disabled={s.ton_kho <= 0}>{s.ten_dich_vu} - {formatVND(s.don_gia)}</option>))}
                </select>
                <input type="number" value={qty} onChange={e => setQty(parseInt(e.target.value))} className="w-16 p-2.5 rounded-xl border border-input bg-background text-center font-bold" min="1" />
                <button onClick={addSvc} disabled={loading} className="px-4 py-2.5 bg-primary text-white rounded-xl font-bold text-xs uppercase flex items-center gap-1 shadow-md shadow-primary/20"><Plus size={14}/> Thêm</button>
              </div>
            </div>
          )}

          {/* Tổng kết tiền */}
          {invoice && (
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
              <div className="flex justify-between text-xs"><span className="opacity-60 italic">Tiền sân & Dịch vụ:</span><span className="font-medium">{formatVND(parseFloat(invoice.tien_san) + parseFloat(invoice.tien_dich_vu))}</span></div>
              {parseFloat(invoice.giam_gia) > 0 && (<div className="flex justify-between text-xs text-primary"><span className="italic">Ưu đãi thành viên:</span><span>-{formatVND(invoice.giam_gia)}</span></div>)}
              <div className="flex justify-between pt-2 border-t border-primary/20 items-end"><span className="font-bold text-sm uppercase tracking-tighter">Tổng cộng</span><span className="text-2xl font-bold text-primary tracking-tighter">{formatVND(invoice.tong_cong)}</span></div>
            </div>
          )}

          <div className="flex gap-2">
             <button onClick={() => window.print()} className="flex-1 py-3 border border-border rounded-2xl font-bold text-[10px] uppercase hover:bg-secondary transition-all">In hóa đơn (PDF)</button>
             <button onClick={onClose} className="flex-1 py-3 bg-foreground text-background rounded-2xl font-bold text-[10px] uppercase transition-all">Đóng lại</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
