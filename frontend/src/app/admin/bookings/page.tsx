"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPost, formatVND, formatDate } from "@/lib/api";
import {
  Loader2, CheckCircle2, DollarSign, Search, X, Clock, XCircle, RotateCcw, Receipt, Sparkles, Undo2
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
  const [isRefund, setIsRefund] = useState(false);

  async function load() {
    setLoading(true);
    try {
      await apiPost("/api/bookings/run-auto-tasks", {});
      const data = await apiGet("/api/bookings");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Load bookings failed", e);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = list.filter(b => {
    const matchSearch = 
      b.ten_khach?.toLowerCase().includes(keyword.toLowerCase()) || 
      b.ma_dat_san?.toLowerCase().includes(keyword.toLowerCase()) ||
      b.sdt_khach?.includes(keyword);
    const matchStatus = statusFilter === "ALL" || b.trang_thai === statusFilter;
    return matchSearch && matchStatus;
  });

  async function confirmBooking(id: number) {
    if (!confirm("Xác nhận đã nhận tiền cọc và duyệt đơn này?")) return;
    try {
      await apiPost(`/api/bookings/${id}/confirm`, {});
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function markComplete(id: number) {
    if (!confirm("Khách đã đá xong. Xác nhận hoàn tất và thu tiền?")) return;
    try {
      await apiPost(`/api/bookings/${id}/complete`, {});
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function handleCancel() {
    if (!lyDoHuy.trim()) return alert("Vui lòng nhập lý do hủy để lưu lịch sử");
    try {
      await apiPost(`/api/bookings/${cancelTarget.id}/cancel`, { 
        ly_do_huy: lyDoHuy,
        hoan_tien: isRefund 
      });
      setCancelTarget(null); 
      setLyDoHuy(""); 
      setIsRefund(false);
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function handleConfirmRefund(id: number) {
    if (!confirm("Xác nhận bạn đã chuyển khoản hoàn trả 50% tiền cọc cho khách?")) return;
    try {
      await apiPost(`/api/bookings/${id}/confirm-refund`, {});
      load();
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">Hệ Thống Vận Hành KICKOFF</h1>
          <p className="text-muted-foreground text-sm italic">Quản lý đặt sân, dòng tiền và hóa đơn dịch vụ</p>
        </div>
        <button onClick={load} className="p-3 bg-secondary rounded-2xl hover:bg-secondary/80 transition-all shadow-sm">
          <RotateCcw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-3 bg-card p-4 rounded-3xl border border-border shadow-sm">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            value={keyword} 
            onChange={e => setKeyword(e.target.value)} 
            placeholder="Tìm theo tên khách, mã đơn hoặc SĐT..." 
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-input bg-background outline-none focus:border-primary transition-all shadow-inner" 
          />
        </div>
        <select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value)} 
          className="px-4 py-2.5 rounded-xl border border-input bg-background font-bold text-sm outline-none cursor-pointer hover:bg-secondary transition-colors"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="CHO_XAC_NHAN">Chờ xác nhận</option>
          <option value="DA_XAC_NHAN">Đã xác nhận</option>
          <option value="DANG_SU_DUNG">Đang sử dụng</option>
          <option value="HOAN_THANH">Hoàn thành</option>
          <option value="HUY">Đã hủy</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>
      ) : (
        <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary/50 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                <tr>
                  <th className="p-5">Mã đơn / Khách</th>
                  <th className="p-5">Thông tin sân</th>
                  <th className="p-5">Thời gian đá</th>
                  <th className="p-5">Thời điểm đặt</th> 
                  <th className="p-5 text-right">Tổng thanh toán</th>
                  <th className="p-5 text-center">Trạng thái</th>
                  <th className="p-5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-secondary/20 transition-colors group">
                    <td className="p-5">
                      <div className="font-black text-primary font-mono">{b.ma_dat_san}</div>
                      <div className="text-xs font-bold text-foreground/80">{b.ten_khach || "Khách lẻ"}</div>
                    </td>
                    <td className="p-5">
                        <div className="text-sm font-bold text-foreground">{b.ten_san}</div>
                        <div className="text-[10px] text-muted-foreground">{b.loai_san === "SAN_5" ? "Sân 5 người" : "Sân 7 người"}</div>
                    </td>
                    <td className="p-5">
                      <div className="text-sm font-bold">{formatDate(b.ngay_dat)}</div>
                      <div className="text-[11px] font-mono opacity-60 flex items-center gap-1 mt-0.5 text-blue-600">
                        <Clock size={12}/> {b.gio_bat_dau?.slice(0,5)} - {b.gio_ket_thuc?.slice(0,5)}
                      </div>
                    </td>
                    <td className="p-5">
                      <div className="text-[10px] font-bold text-muted-foreground leading-tight">
                        {b.ngay_tao ? (
                          (() => {
                            const d = new Date(b.ngay_tao);
                            d.setHours(d.getHours() + 7); 
                            return d.toLocaleString('vi-VN', {
                              hour: '2-digit', minute: '2-digit',
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour12: false
                            });
                          })()
                        ) : "N/A"}
                      </div>
                    </td>
                    <td className="p-5 text-right">
                      <div className="font-black text-foreground">
                        {formatVND(b.invoice?.tong_cong || b.tien_san)}
                      </div>
                      {b.invoice?.giam_gia > 0 && (
                        <div className="text-[9px] text-primary font-bold italic flex items-center justify-end gap-1">
                           <Sparkles size={10}/> Đã giảm {formatVND(b.invoice.giam_gia)}
                        </div>
                      )}
                    </td>
                    <td className="p-5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-tighter ${STATUS_LABEL[b.trang_thai]?.cls}`}>
                          {STATUS_LABEL[b.trang_thai]?.text}
                        </span>
                        
                        {/* TAG Hiển thị trạng thái hoàn tiền (KHÔNG phụ thuộc vào CHO_HOAN_TIEN cứng của backend) */}
                        {b.trang_thai === "HUY" && (
                          <>
                            {b.hoan_tien === false && (
                              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 mt-1 whitespace-nowrap">
                                ❌ Không hoàn tiền
                              </span>
                            )}
                            {b.hoan_tien === true && b.invoice?.trang_thai !== "HOAN_TIEN" && (
                              <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200 mt-1 whitespace-nowrap">
                                ⏳ Chưa hoàn tiền (50%)
                              </span>
                            )}
                            {b.hoan_tien === true && b.invoice?.trang_thai === "HOAN_TIEN" && (
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 mt-1 whitespace-nowrap">
                                ✅ Đã hoàn tiền (50%)
                              </span>
                            )}
                            
                            {b.ly_do_huy && (
                              <span className="text-[9px] text-red-400 italic max-w-[100px] truncate block mt-1" title={b.ly_do_huy}>
                                Lý do: {b.ly_do_huy}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-5">
                      <div className="flex justify-end gap-2">
                        {b.trang_thai === "CHO_XAC_NHAN" && (
                          <button onClick={() => confirmBooking(b.id)} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Xác nhận">
                            <CheckCircle2 size={18}/>
                          </button>
                        )}
                        {b.trang_thai === "DA_XAC_NHAN" && (
                          <button onClick={() => markComplete(b.id)} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Thu tiền">
                            <DollarSign size={18}/>
                          </button>
                        )}
                        <button onClick={() => setBillTarget(b)} className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm" title="Xem Hóa đơn">
                          <Receipt size={18}/>
                        </button>
                        
                        {/* Nút XÁC NHẬN ĐÃ HOÀN TIỀN (Chỉ hiện khi hủy & có check hoàn tiền & chưa hoàn) */}
                        {b.trang_thai === "HUY" && b.hoan_tien === true && b.invoice?.trang_thai !== "HOAN_TIEN" && (
                          <button onClick={() => handleConfirmRefund(b.id)} className="p-2 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm" title="Xác nhận đã hoàn tiền cho khách">
                            <Undo2 size={18}/>
                          </button>
                        )}

                        {["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(b.trang_thai) && (
                          <button onClick={() => setCancelTarget(b)} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Hủy đơn">
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
        </div>
      )}

      {/* Modal Hóa Đơn */}
      <AnimatePresence>
        {billTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white text-slate-900 w-full max-w-lg rounded-sm shadow-2xl overflow-hidden border-t-[12px] border-primary">
              <div className="p-8 border-b border-dashed border-slate-200 text-center relative">
                <button onClick={() => setBillTarget(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900"><X size={24}/></button>
                <div className="font-bold text-primary mb-2">SÂN BÓNG ĐÁ KICKOFF</div>
                <h2 className="text-2xl font-black uppercase tracking-tight mb-1">HÓA ĐƠN DỊCH VỤ</h2>
                <div className="text-[10px] font-mono text-slate-400">Số đơn: {billTarget.ma_dat_san}</div>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 gap-8">
                  <div><div>Khách hàng</div><div className="text-slate-900 text-sm">{billTarget.ten_khach || "Khách lẻ vãng lai"}</div></div>
                  <div className="text-right"><div>Ngày thi đấu</div><div className="text-slate-900 text-sm">{formatDate(billTarget.ngay_dat)}</div></div>
                </div>

                <table className="w-full text-sm">
                  <thead className="border-b-2 border-slate-900 font-black uppercase text-[10px]">
                    <tr><th className="py-2 text-left">Nội dung</th><th className="py-2 text-right">Thành tiền</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                        <td className="py-4 font-medium italic">
                            Tiền thuê sân ({billTarget.ten_san})
                            <div className="text-[10px] text-slate-400 font-normal">Thời gian: {billTarget.gio_bat_dau?.slice(0,5)} - {billTarget.gio_ket_thuc?.slice(0,5)}</div>
                        </td>
                        <td className="py-4 text-right font-black">{formatVND(billTarget.tien_san)}</td>
                    </tr>
                    
                    {billTarget.services?.map((s: any) => (
                      <tr key={s.id}>
                        <td className="py-3 text-slate-500">{s.ten_dich_vu} x{s.so_luong}</td>
                        <td className="py-3 text-right font-bold">{formatVND(s.thanh_tien)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="pt-6 border-t-2 border-slate-900 flex justify-between items-center">
                  <span className="font-black uppercase text-sm">Tổng cộng</span>
                  <span className="text-3xl font-black text-primary">
                    {formatVND(billTarget.invoice?.tong_cong || billTarget.tien_san)}
                  </span>
                </div>
                <div className="flex gap-2 no-print">
                    <button onClick={() => setBillTarget(null)} className="w-full py-4 bg-slate-900 text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-primary transition-colors">Đóng Hóa Đơn</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal Hủy Đơn */}
        {cancelTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-card w-full max-w-md rounded-3xl border border-border p-8 shadow-2xl">
              <h3 className="text-2xl font-black mb-2 uppercase italic text-red-600">Hủy đơn đặt sân</h3>
              <p className="text-muted-foreground text-sm mb-6">Mọi dịch vụ và tồn kho sẽ được hoàn trả tự động sau khi hủy.</p>
              
              <textarea 
                value={lyDoHuy} 
                onChange={e => setLyDoHuy(e.target.value)} 
                placeholder="Ví dụ: Khách báo bận đột xuất, lỗi trùng lịch..." 
                className="w-full p-4 rounded-2xl bg-secondary/50 border border-border outline-none min-h-[100px] mb-4 focus:border-red-500 transition-all font-medium shadow-inner" 
              />

              <div className="flex gap-6 mb-6 px-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={isRefund === true} 
                    onChange={() => setIsRefund(true)} 
                    className="w-4 h-4 accent-red-600" 
                  />
                  <span className="text-sm font-bold text-foreground">Có hoàn tiền (50%)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={isRefund === false} 
                    onChange={() => setIsRefund(false)} 
                    className="w-4 h-4 accent-red-600" 
                  />
                  <span className="text-sm font-bold text-foreground">Không hoàn tiền</span>
                </label>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setCancelTarget(null); setLyDoHuy(""); setIsRefund(false); }} className="flex-1 py-4 font-bold hover:bg-secondary rounded-2xl transition-all">Quay lại</button>
                <button onClick={handleCancel} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-red-600/20 active:scale-95 transition-all">Xác nhận hủy</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
