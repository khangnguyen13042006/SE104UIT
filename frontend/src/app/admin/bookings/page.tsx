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
  const [invoices, setInvoices] = useState<Record<number, any>>({});  // booking_id → invoice
  const [filter, setFilter] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [keywordInput, setKeywordInput] = useState<string>("");
  const [tuNgay, setTuNgay] = useState<string>("");
  const [denNgay, setDenNgay] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [serviceTarget, setServiceTarget] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
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

  async function confirmRefund(id: number) {
    if (!confirm("Xác nhận đã hoàn tiền cho booking này?\nHành động không thể hoàn tác.")) return;
    try {
      await apiPost(`/api/bookings/${id}/confirm-refund`);
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function markComplete(id: number) {
    if (!confirm("Đánh dấu booking này đã hoàn thành?\nĐồ thuê sẽ tự restock vào kho.")) return;
    try { await apiPost(`/api/bookings/${id}/complete`); load(); }
    catch (e: any) { alert(e.message); }
  }

  async function payInvoice(bookingId: number) {
    try {
      const inv = invoices[bookingId];
      if (!inv) { alert("Không tìm thấy hóa đơn"); return; }
      if (inv.trang_thai === "DA_THANH_TOAN") { alert("Hóa đơn đã thanh toán"); return; }
      if (!confirm(`Xác nhận thu ${formatVND(inv.tong_cong)}?`)) return;
      await apiPost(`/api/invoices/${inv.id}/pay`);
      load();
    } catch (e: any) { alert(e.message); }
  }

  const hasFilters = !!(keyword || filter || tuNgay || denNgay);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
          <span className="text-sm font-medium text-primary uppercase tracking-wider">Vận hành</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Lịch Đặt Sân</h1>
        <p className="text-muted-foreground mt-1">Tìm kiếm, lọc và xác nhận các booking</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-3xl border border-border p-6 space-y-4">
        <form onSubmit={applySearch} className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="Tìm theo mã (BK...), tên khách, SĐT..."
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-input bg-background text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all" />
          </div>
          <button type="submit" className="px-6 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors">Tìm kiếm</button>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="px-4 py-3 rounded-2xl border border-border hover:bg-secondary text-foreground font-medium flex items-center gap-2 transition-colors">
              <X className="w-4 h-4" /> Xóa lọc
            </button>
          )}
        </form>

        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-4 py-2 rounded-xl border border-input bg-background focus:border-primary outline-none">
              <option value="">Tất cả trạng thái</option>
              <option value="CHO_XAC_NHAN">Chờ xác nhận</option>
              <option value="DA_XAC_NHAN">Đã xác nhận</option>
              <option value="DANG_SU_DUNG">Đang sử dụng</option>
              <option value="HOAN_THANH">Hoàn thành</option>
              <option value="HUY">Đã hủy</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} className="px-3 py-2 rounded-xl border border-input bg-background focus:border-primary outline-none" />
            <span className="text-muted-foreground">→</span>
            <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)} className="px-3 py-2 rounded-xl border border-input bg-background focus:border-primary outline-none" />
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            Tìm thấy <strong className="text-foreground">{list.length}</strong> kết quả
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-3xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-4">Mã</th>
                  <th className="text-left p-4">Sân</th>
                  <th className="text-left p-4">Khách</th>
                  <th className="text-left p-4">Thời gian</th>
                  <th className="text-right p-4">Tiền</th>
                  <th className="text-center p-4">Trạng thái</th>
                  <th className="text-center p-4">Hoàn tiền</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((b, i) => {
                  const st = STATUS_LABEL[b.trang_thai];
                  return (
                    <motion.tr key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="hover:bg-secondary/30 transition-colors">
                      <td className="p-4"><span className="font-mono text-sm font-bold text-primary">{b.ma_dat_san}</span></td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">⚽</span>
                          <span className="font-semibold text-foreground">{b.ten_san}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-foreground">{b.ten_khach || "—"}</div>
                        <div className="text-sm text-muted-foreground">{b.sdt_khach}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-foreground">{formatDate(b.ngay_dat)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{b.gio_bat_dau?.slice(0, 5)} - {b.gio_ket_thuc?.slice(0, 5)}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="font-semibold text-foreground">{formatVND(b.invoice?.tong_cong || b.tien_san)}</div>
                        {b.invoice && parseFloat(b.invoice.tien_dich_vu) > 0 && (
                          <div className="text-xs text-muted-foreground">+ DV {formatVND(b.invoice.tien_dich_vu)}</div>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${st?.cls}`}>{st?.text}</span>
                      </td>
                      <td className="p-4 text-center">
                        {(() => {
                          const inv = invoices[b.id];
                          if (b.trang_thai !== "HUY") return <span className="text-xs text-muted-foreground">—</span>;
                          if (inv?.trang_thai === "CHO_HOAN_TIEN") {
                            return (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-accent/20 text-accent border border-accent/30">
                                <Clock className="w-3 h-3" /> Chờ hoàn tiền
                              </span>
                            );
                          }
                          if (inv?.trang_thai === "HOAN_TIEN") {
                            return (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-chart-3/20 text-chart-3 border border-chart-3/30">
                                <RotateCcw className="w-3 h-3" /> Đã hoàn
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                              <Ban className="w-3 h-3" /> Không hoàn
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          {["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(b.trang_thai) && (
                            <>
                              <button onClick={() => setServiceTarget(b)} className="p-2 rounded-xl hover:bg-accent/10 text-accent transition-colors" title="Quản lý dịch vụ">
                                <Package className="w-5 h-5" />
                              </button>
                              <button onClick={() => payInvoice(b.id)} className="p-2 rounded-xl hover:bg-chart-3/10 text-chart-3 transition-colors" title="Thu tiền">
                                <DollarSign className="w-5 h-5" />
                              </button>
                              <button onClick={() => setCancelTarget(b)} className="p-2 rounded-xl hover:bg-destructive/10 text-destructive transition-colors" title="Hủy booking">
                                <XCircle className="w-5 h-5" />
                              </button>
                            </>
                          )}
                          {b.trang_thai === "DA_XAC_NHAN" && (
                            <button onClick={() => markComplete(b.id)} className="p-2 rounded-xl hover:bg-primary/10 text-primary transition-colors" title="Hoàn thành">
                              <CheckCircle2 className="w-5 h-5" />
                            </button>
                          )}
                          {invoices[b.id]?.trang_thai === "CHO_HOAN_TIEN" && (
                            <button onClick={() => confirmRefund(b.id)}
                              className="px-3 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap"
                              title="Xác nhận đã hoàn tiền">
                              <RotateCcw className="w-3.5 h-3.5" /> Xác nhận hoàn
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-16 text-center">
                      <Calendar className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground">{hasFilters ? "Không có booking khớp bộ lọc" : "Chưa có booking"}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {cancelTarget && (
        <CancelBookingModal booking={cancelTarget} onClose={() => setCancelTarget(null)} onSuccess={() => { setCancelTarget(null); load(); }} />
      )}

      {serviceTarget && (
        <ServicesManagerModal booking={serviceTarget} onClose={() => setServiceTarget(null)} onChanged={() => load()} />
      )}
    </div>
  );
}

function CancelBookingModal({ booking, onClose, onSuccess }: any) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const hoursUntil = (new Date(`${booking.ngay_dat}T${booking.gio_bat_dau}`).getTime() - Date.now()) / 3600000;
  const policyDefault = hoursUntil >= 24;

  async function submit() {
    if (reason.length < 3) { setErr("Vui lòng nhập lý do (≥3 ký tự)"); return; }
    setLoading(true);
    try {
      const body: any = { ly_do_huy: reason };
      if (refund !== null) body.hoan_tien = refund;
      await apiPost(`/api/bookings/${booking.id}/cancel`, body);
      onSuccess();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-3xl w-full max-w-md shadow-2xl border border-border">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-2xl font-display font-bold text-foreground">Hủy booking</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-sm">
            <div className="text-foreground"><strong className="font-mono text-primary">{booking.ma_dat_san}</strong> · {booking.ten_san}</div>
            <div className="text-muted-foreground mt-1">{booking.ten_khach} · {booking.sdt_khach}</div>
            <div className="text-muted-foreground">Còn <strong className="text-foreground">{hoursUntil.toFixed(1)}h</strong> trước giờ chơi</div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Lý do hủy <span className="text-destructive">*</span></label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              className="w-full px-4 py-3 rounded-2xl border border-input bg-background text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none resize-none transition-all"
              placeholder="Ví dụ: Khách yêu cầu hủy, lịch trùng, sân bảo trì..." />
          </div>

          <div className="p-4 rounded-2xl bg-accent/10 border border-accent/20">
            <div className="text-xs font-bold text-accent mb-2 uppercase tracking-wider">⚖️ Hoàn tiền (Admin/Staff)</div>
            <div className="text-xs text-muted-foreground mb-3">
              Mặc định theo policy 24h: <strong className="text-foreground">{policyDefault ? "Hoàn 50%" : "Không hoàn"}</strong>. Có thể override:
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setRefund(null)}
                className={`px-2 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${refund === null ? "bg-accent text-accent-foreground border-accent" : "bg-background border-input hover:border-accent/40"}`}>
                Auto (24h)
              </button>
              <button onClick={() => setRefund(true)}
                className={`px-2 py-2 rounded-xl text-xs font-semibold border-2 transition-all flex items-center justify-center gap-1 ${refund === true ? "bg-chart-3 text-white border-chart-3" : "bg-background border-input hover:border-chart-3/40"}`}>
                <RotateCcw className="w-3 h-3" /> Hoàn tiền
              </button>
              <button onClick={() => setRefund(false)}
                className={`px-2 py-2 rounded-xl text-xs font-semibold border-2 transition-all flex items-center justify-center gap-1 ${refund === false ? "bg-muted-foreground text-background border-muted-foreground" : "bg-background border-input hover:border-muted-foreground/40"}`}>
                <Ban className="w-3 h-3" /> Không hoàn
              </button>
            </div>
          </div>

          {err && <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</div>}

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-border hover:bg-secondary font-semibold text-sm transition-colors">Quay lại</button>
            <button onClick={submit} disabled={loading} className="flex-1 py-3 rounded-2xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold disabled:opacity-50 text-sm transition-colors">
              {loading ? "Đang hủy..." : "Xác nhận hủy"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ServicesManagerModal({ booking, onClose, onChanged }: any) {
  const [services, setServices] = useState<any[]>([]);  // all services (for stock)
  const [current, setCurrent] = useState<any[]>(booking.services || []);
  const [invoice, setInvoice] = useState<any>(booking.invoice || null);
  const [selectedSvc, setSelectedSvc] = useState<number>(0);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function loadServices() {
    const r = await apiGet("/api/services?trang_thai=HOAT_DONG");
    setServices(r);
    if (!selectedSvc && r.length > 0) setSelectedSvc(r[0].id);
  }
  useEffect(() => { loadServices(); }, []);

  async function reload() {
    const updated = await apiGet(`/api/bookings/${booking.id}`);
    setCurrent(updated.services || []);
    setInvoice(updated.invoice || null);
    await loadServices(); // refresh stock counts
    onChanged(); // tell parent to refresh table
  }

  async function addSvc() {
    if (!selectedSvc) return;
    setLoading(true); setErr("");
    try {
      await apiPost(`/api/bookings/${booking.id}/services`, { dich_vu_id: selectedSvc, so_luong: qty });
      setQty(1);
      await reload();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function removeSvc(bsId: number) {
    if (!confirm("Xóa dịch vụ này khỏi booking?")) return;
    setLoading(true); setErr("");
    try {
      await apiDelete(`/api/bookings/${booking.id}/services/${bsId}`);
      await reload();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const totalSvc = current.reduce((s, x) => s + parseFloat(x.thanh_tien), 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-card rounded-3xl w-full max-w-lg my-8 shadow-2xl border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-2xl font-display font-bold">Quản lý dịch vụ</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{booking.ma_dat_san} · {booking.ten_san}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Existing services */}
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Dịch vụ hiện có ({current.length})</div>
            {current.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground bg-secondary/30 rounded-2xl border border-dashed border-border">
                Chưa có dịch vụ nào
              </div>
            ) : (
              <div className="space-y-2">
                {current.map((bs: any) => (
                  <div key={bs.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground">{bs.ten_dich_vu}</div>
                      <div className="text-xs text-muted-foreground">
                        ×{bs.so_luong} · {formatVND(bs.don_gia)} = <strong className="text-primary">{formatVND(bs.thanh_tien)}</strong>
                      </div>
                    </div>
                    <button onClick={() => removeSvc(bs.id)} disabled={loading}
                      className="p-2 rounded-xl hover:bg-destructive/10 text-destructive transition-colors disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2 border-t border-border">
                  <span className="text-muted-foreground">Tổng dịch vụ:</span>
                  <strong className="text-primary">{formatVND(totalSvc)}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Add new service */}
          <div className="pt-4 border-t border-border">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Thêm dịch vụ</div>
            <div className="flex gap-2">
              <select value={selectedSvc} onChange={(e) => setSelectedSvc(parseInt(e.target.value))}
                className="flex-1 px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary outline-none text-sm">
                {services.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.ton_kho <= 0}>
                    {s.ten_dich_vu} ({formatVND(s.don_gia)}) — Còn {s.ton_kho}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1 bg-secondary rounded-xl">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-2.5 hover:bg-background rounded-l-xl">
                  <Minus className="w-3 h-3" />
                </button>
                <span className="px-2 font-bold w-8 text-center text-sm">{qty}</span>
                <button onClick={() => setQty(qty + 1)} className="p-2.5 hover:bg-background rounded-r-xl">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <button onClick={addSvc} disabled={loading || !selectedSvc}
                className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" /> Thêm
              </button>
            </div>
          </div>

          {err && <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</div>}

          {/* Live Total Summary — sync với invoice mỗi lần add/remove */}
          {invoice && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20 space-y-2">
              <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Tổng hóa đơn (cập nhật theo thời gian thực)</div>
              <PriceRow label="Tiền sân" value={invoice.tien_san} />
              <PriceRow label="Dịch vụ" value={invoice.tien_dich_vu} />
              {parseFloat(invoice.giam_gia) > 0 && (
                <PriceRow label="Giảm giá thẻ" value={`-${formatVND(invoice.giam_gia)}`} color="text-primary" isRaw />
              )}
              <motion.div key={invoice.tong_cong} initial={{ scale: 1.05 }} animate={{ scale: 1 }}
                className="flex justify-between pt-2 border-t border-primary/20">
                <span className="font-bold text-foreground">Tổng cộng:</span>
                <span className="text-xl font-display font-bold text-primary">{formatVND(invoice.tong_cong)}</span>
              </motion.div>
            </motion.div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border hover:bg-secondary font-semibold text-sm">Đóng</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PriceRow({ label, value, color, isRaw }: any) {
  return (
    <motion.div key={String(value)} initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-semibold ${color || "text-foreground"}`}>
        {isRaw ? value : formatVND(value)}
      </span>
    </motion.div>
  );
}
