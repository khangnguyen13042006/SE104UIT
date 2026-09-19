"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RescheduleModal from "@/components/RescheduleModal";
import { cachedGet, primeFromCache } from "@/lib/useApi";
import { apiGet, apiPost, apiDelete, formatVND, formatDate, getUser } from "@/lib/api";
import {
  Loader2, CheckCircle2, DollarSign, Search, X, Clock, XCircle,
  RotateCcw, Receipt, Sparkles, Undo2, ShoppingCart, Trash2, Plus, CalendarClock
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
  const [allServices, setAllServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [user, setUser] = useState<any>(null); // Thêm state lưu User
  
  // States cho Modal
  const [billTarget, setBillTarget] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [serviceTarget, setServiceTarget] = useState<any>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<any>(null);
  const [bankInfoTarget, setBankInfoTarget] = useState<any>(null);

  // Hủy đơn: "policy" = theo chính sách tự động (trước 24h hoàn 50%, sau đó không hoàn), "venue_fault" = lỗi từ sân (100%)
  const [lyDoHuy, setLyDoHuy] = useState("");
  const [refundChoice, setRefundChoice] = useState<"policy" | "venue_fault">("policy");

  // States form Dịch vụ
  const [selSvcId, setSelSvcId] = useState("");
  const [selQty, setSelQty] = useState(1);

  // Phân quyền hiển thị
  const isManager = user && ["ADMIN", "QUAN_LY"].includes(user.vai_tro);

  async function load() {
    // Hiện ngay dữ liệu đã cache (nếu có) rồi vẫn tải lại ngầm — chuyển trang không phải chờ
    const primed = primeFromCache(["/api/bookings", "/api/services"], (bData: any, sData: any) => {
      setUser(getUser());
      setList(Array.isArray(bData) ? bData : []);
      setAllServices(Array.isArray(sData) ? sData : (sData?.data || []));
    });
    setLoading(!primed);
    try {
      // 1. Lấy thông tin user hiện tại
      const currentUser = getUser();
      setUser(currentUser);

      // 2+3. Chạy song song auto-task (chỉ Admin/Quản lý) với việc tải danh sách, thay vì chờ tuần tự —
      // giảm 1 vòng round-trip mạng mỗi lần tải trang, trang phản hồi nhanh hơn rõ rệt.
      const runAutoTasks =
        currentUser && ["ADMIN", "QUAN_LY"].includes(currentUser.vai_tro)
          ? apiPost("/api/bookings/run-auto-tasks", {}).catch((taskErr) => console.warn("Auto task failed (bỏ qua):", taskErr))
          : Promise.resolve();

      const [, bData, sData] = await Promise.all([
        runAutoTasks,
        cachedGet("/api/bookings"),
        cachedGet("/api/services"),
      ]);
      setList(Array.isArray(bData) ? bData : []);
      setAllServices(Array.isArray(sData) ? sData : (sData?.data || []));
      
    } catch (e) {
      console.error("Load bookings failed", e);
    } finally { 
      setLoading(false); 
    }
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

  // Mức hoàn tiền: tự động theo mốc 24h; chỉ "lỗi từ sân" (Admin/Quản lý) mới hoàn 100%. Tiền hoàn tính trên số đã thanh toán.
  const cancelStart = cancelTarget ? new Date(`${cancelTarget.ngay_dat}T${cancelTarget.gio_bat_dau}`) : null;
  const cancelHoursUntil = cancelStart ? (cancelStart.getTime() - Date.now()) / 3600000 : 0;
  const cancelPaid = cancelTarget ? parseFloat(cancelTarget.invoice?.so_tien_da_tt || 0) : 0;
  const cancelRate = cancelPaid <= 0 ? 0 : isManager && refundChoice === "venue_fault" ? 1 : cancelHoursUntil >= 24 ? 0.5 : 0;
  const cancelWillRefund = cancelRate > 0;
  const cancelCutoffText = cancelStart
    ? new Date(cancelStart.getTime() - 24 * 3600000).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : "";

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
      // Mức hoàn do backend tự tính theo policy (trước 24h hoàn 50%, sau đó không hoàn). Chỉ Admin/Quản lý
      // được đánh dấu "lỗi từ sân" (hoàn 100%). STK hoàn tiền khách tự cung cấp sau tại "Lịch đặt của tôi".
      const payload: any = { ly_do_huy: lyDoHuy };
      if (isManager && refundChoice === "venue_fault") payload.loi_tu_san = true;

      await apiPost(`/api/bookings/${cancelTarget.id}/cancel`, payload);
      setCancelTarget(null);
      setLyDoHuy("");
      setRefundChoice("policy");
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function handleConfirmRefund(b: any) {
    const pct = Math.round((b.ty_le_hoan_tien ?? 0) * 100);
    if (!confirm(`Xác nhận bạn đã chuyển khoản hoàn ${formatVND(b.so_tien_hoan)} (${pct}%) cho khách? Hệ thống sẽ gửi email thông báo đã hoàn tiền.`)) return;
    try {
      const updated = await apiPost(`/api/bookings/${b.id}/confirm-refund`, {});
      setBankInfoTarget(updated);
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function handleAddService() {
    if (!selSvcId || selQty <= 0) return alert("Vui lòng chọn dịch vụ và số lượng lớn hơn 0");
    try {
      const updatedBooking = await apiPost(`/api/bookings/${serviceTarget.id}/services`, {
        dich_vu_id: parseInt(selSvcId),
        so_luong: selQty
      });
      setServiceTarget(updatedBooking);
      setList(prev => prev.map(b => b.id === updatedBooking.id ? updatedBooking : b));
      setSelQty(1);
    } catch (e: any) { alert(e.message); }
  }

  async function handleRemoveService(bs_id: number) {
    if (!confirm("Chắc chắn muốn xóa dịch vụ này khỏi đơn?")) return;
    try {
      const updatedBooking = await apiDelete(`/api/bookings/${serviceTarget.id}/services/${bs_id}`);
      setServiceTarget(updatedBooking);
      setList(prev => prev.map(b => b.id === updatedBooking.id ? updatedBooking : b));
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
                  <th className="p-5 text-right min-w-[220px]">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-secondary/20 transition-colors group">
                    <td className="p-5">
                      <div className="font-black text-primary font-mono">{b.ma_dat_san}</div>
                      <div className="text-xs font-bold text-foreground/80">{b.ten_khach || "Khách lẻ"}</div>
                      {b.trang_thai === "HUY" && b.hoan_tien === true && (
                        <button
                          onClick={() => setBankInfoTarget(b)}
                          className="mt-1 text-[10px] font-bold text-orange-600 hover:underline flex items-center gap-1"
                        >
                          <Receipt size={11} /> Xem STK hoàn tiền
                        </button>
                      )}
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
                        
                        {b.trang_thai === "CHO_XAC_NHAN" && b.khach_bao_chuyen_khoan && (
                          <span className="text-[9px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200 mt-1 whitespace-nowrap">
                            💬 Khách báo đã chuyển khoản — cần xác nhận
                          </span>
                        )}
                        {b.trang_thai === "CHO_XAC_NHAN" && parseFloat(b.invoice?.so_tien_da_tt || 0) > 0 && (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200 mt-1 whitespace-nowrap">
                            ⏳ Chờ thanh toán chênh lệch {formatVND(b.invoice.so_tien_can_tt)}
                          </span>
                        )}
                        {b.trang_thai === "CHO_XAC_NHAN" && b.han_thanh_toan && (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200 mt-1 whitespace-nowrap">
                            ⏳ Hạn thanh toán {new Date(b.han_thanh_toan + "Z").toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {b.trang_thai === "HUY" && (
                          <>
                            {b.hoan_tien === false && (
                              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 mt-1 whitespace-nowrap">
                                ❌ Không hoàn tiền
                              </span>
                            )}
                            {b.hoan_tien === true && b.invoice?.trang_thai !== "HOAN_TIEN" && (
                              <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200 mt-1 whitespace-nowrap">
                                ⏳ Chưa hoàn tiền ({Math.round((b.ty_le_hoan_tien ?? 0) * 100)}%)
                              </span>
                            )}
                            {b.hoan_tien === true && b.invoice?.trang_thai === "HOAN_TIEN" && (
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 mt-1 whitespace-nowrap">
                                ✅ Đã hoàn tiền ({Math.round((b.ty_le_hoan_tien ?? 0) * 100)}%)
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

                        {["CHO_XAC_NHAN", "DA_XAC_NHAN", "DANG_SU_DUNG"].includes(b.trang_thai) && (
                          <button onClick={() => setServiceTarget(b)} className="p-2 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-600 hover:text-white transition-all shadow-sm" title="Quản lý dịch vụ">
                            <ShoppingCart size={18}/>
                          </button>
                        )}

                        {["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(b.trang_thai) && (
                          <button onClick={() => setRescheduleTarget(b)} className="p-2 bg-cyan-50 text-cyan-600 rounded-xl hover:bg-cyan-600 hover:text-white transition-all shadow-sm" title="Đổi lịch">
                            <CalendarClock size={18}/>
                          </button>
                        )}

                        <button onClick={() => setBillTarget(b)} className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm" title="Xem Hóa đơn">
                          <Receipt size={18}/>
                        </button>
                        
                        {/* CHỈ HIỂN THỊ NÚT NÀY CHO ADMIN/QUẢN LÝ */}
                        {isManager && b.trang_thai === "HUY" && b.hoan_tien === true && b.invoice?.trang_thai !== "HOAN_TIEN" && (
                          <button onClick={() => setBankInfoTarget(b)} className="p-2 bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm" title="Xem STK & xác nhận đã hoàn tiền">
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

      {/* ==== MODAL: QUẢN LÝ DỊCH VỤ ==== */}
      <AnimatePresence>
        {serviceTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card w-full max-w-2xl rounded-3xl border border-border p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-primary">Dịch Vụ Kèm Theo</h3>
                  <div className="text-sm font-bold text-muted-foreground">Đơn đặt sân: {serviceTarget.ma_dat_san} - Khách: {serviceTarget.ten_khach || "Khách lẻ"}</div>
                </div>
                <button onClick={() => { setServiceTarget(null); setSelSvcId(""); setSelQty(1); }} className="text-muted-foreground hover:text-foreground bg-secondary/50 p-2 rounded-xl"><X size={24}/></button>
              </div>
              
              <div className="mb-6 bg-secondary/30 rounded-2xl p-4 border border-border shadow-inner">
                <h4 className="font-bold text-xs mb-3 uppercase text-muted-foreground tracking-widest">Thêm dịch vụ (Bán nước, cho thuê giày...)</h4>
                <div className="flex gap-3">
                  <select 
                    value={selSvcId} 
                    onChange={e => setSelSvcId(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border border-input bg-background font-medium outline-none focus:border-primary transition-all shadow-sm"
                  >
                    <option value="">-- Chọn dịch vụ --</option>
                    {allServices.filter(s => s.trang_thai === "HOAT_DONG").map(s => (
                       <option key={s.id} value={s.id}>
                         {s.ten_dich_vu} - {formatVND(s.don_gia)} (Tồn kho: {s.ton_kho})
                       </option>
                    ))}
                  </select>
                  <input 
                    type="number" 
                    min="1" 
                    value={selQty} 
                    onChange={e => setSelQty(Number(e.target.value))}
                    className="w-24 px-4 py-3 rounded-xl border border-input bg-background font-bold outline-none text-center focus:border-primary transition-all shadow-sm"
                  />
                  <button 
                    onClick={handleAddService}
                    className="px-6 bg-primary text-primary-foreground font-black uppercase rounded-xl hover:opacity-90 transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Plus size={18}/> Thêm
                  </button>
                </div>
              </div>

              <h4 className="font-bold text-xs mb-3 uppercase text-muted-foreground tracking-widest">Danh sách dịch vụ đã đặt</h4>
              {serviceTarget.services?.length === 0 ? (
                <div className="text-center p-6 bg-secondary/20 rounded-2xl text-muted-foreground italic text-sm border border-border border-dashed">Khách chưa đặt dịch vụ nào</div>
              ) : (
                <div className="overflow-hidden border border-border rounded-2xl shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-secondary/50 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-4">Tên dịch vụ</th>
                        <th className="p-4 text-center">Số lượng</th>
                        <th className="p-4 text-right">Thành tiền</th>
                        <th className="p-4 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background">
                      {serviceTarget.services.map((s: any) => (
                         <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                           <td className="p-4 font-bold">{s.ten_dich_vu}</td>
                           <td className="p-4 text-center font-black">{s.so_luong}</td>
                           <td className="p-4 text-right font-black text-primary">{formatVND(s.thanh_tien)}</td>
                           <td className="p-4 text-center">
                             <button onClick={() => handleRemoveService(s.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Xóa dịch vụ">
                               <Trash2 size={16}/>
                             </button>
                           </td>
                         </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-6 flex justify-between items-center border-t border-border pt-4">
                <span className="font-bold text-sm uppercase text-muted-foreground tracking-widest">Cập nhật lúc</span>
                <span className="font-black text-lg text-primary">{new Date().toLocaleTimeString('vi-VN')}</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==== MODAL: HÓA ĐƠN ==== */}
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
                    {billTarget.invoice?.giam_gia > 0 && (
                      <tr>
                        <td className="py-3 text-primary italic">Giảm giá thành viên</td>
                        <td className="py-3 text-right font-bold text-primary">-{formatVND(billTarget.invoice.giam_gia)}</td>
                      </tr>
                    )}
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
      </AnimatePresence>

      {/* ==== MODAL: HỦY ĐƠN ==== */}
      <AnimatePresence>
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

              {/* 2 LỰA CHỌN: do khách hủy (tự động theo mốc 24h) / do sân hủy (hoàn 100%) */}
              <div className="space-y-2 mb-4">
                <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border ${refundChoice === "policy" ? "border-red-300 bg-red-50/50" : "border-border hover:bg-secondary/50"}`}>
                  <input type="radio" checked={refundChoice === "policy"} onChange={() => setRefundChoice("policy")}
                    className="w-4 h-4 mt-0.5 accent-red-600" />
                  <div>
                    <div className="text-sm font-bold text-foreground">Do khách hủy</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Hủy <strong>trước {cancelCutoffText}</strong> (cách giờ đá ≥ 24h) hoàn 50%; sau mốc này không hoàn.
                      Còn {Math.max(0, cancelHoursUntil).toFixed(1)}h tới giờ đá →{" "}
                      <strong className={cancelHoursUntil >= 24 ? "text-emerald-600" : "text-red-600"}>
                        {cancelHoursUntil >= 24 ? "hoàn 50%" : "không hoàn tiền"}
                      </strong>.
                    </div>
                  </div>
                </label>
                {isManager && (
                  <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border ${refundChoice === "venue_fault" ? "border-orange-400 bg-orange-100" : "border-orange-200 bg-orange-50 hover:bg-orange-100"}`}>
                    <input type="radio" checked={refundChoice === "venue_fault"} onChange={() => setRefundChoice("venue_fault")}
                      className="w-4 h-4 mt-0.5 accent-orange-600" />
                    <div>
                      <div className="text-sm font-bold text-orange-700">Do sân hủy (hoàn 100%)</div>
                      <div className="text-xs text-orange-700/80 mt-0.5">Sự cố/hỏng hóc/bảo trì từ phía sân — hoàn toàn bộ, bất kể thời điểm hủy.</div>
                    </div>
                  </label>
                )}
              </div>

              <div className="mb-6 p-3 rounded-xl bg-secondary/50 text-xs">
                {cancelPaid <= 0 ? (
                  <span className="text-muted-foreground">Đơn đang <strong>chờ xác nhận (chưa thanh toán)</strong> nên không phát sinh khoản hoàn tiền.</span>
                ) : cancelWillRefund ? (
                  <span className="text-muted-foreground">
                    Đã thanh toán {formatVND(cancelPaid)} → hoàn <strong className="text-foreground">{Math.round(cancelRate * 100)}% = {formatVND(cancelPaid * cancelRate)}</strong>.
                    Sau khi hủy, hệ thống <strong>gửi email và hiện yêu cầu tại "Lịch đặt của tôi"</strong> để khách nhập
                    thông tin nhận hoàn tiền (Số tài khoản, Tên chủ tài khoản, Ngân hàng).
                  </span>
                ) : (
                  <span className="text-muted-foreground">Đã thanh toán {formatVND(cancelPaid)} nhưng đã qua mốc hoàn tiền → <strong className="text-red-600">không hoàn</strong>.</span>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setCancelTarget(null); setLyDoHuy(""); setRefundChoice("policy"); }} className="flex-1 py-4 font-bold hover:bg-secondary rounded-2xl transition-all">Quay lại</button>
                <button onClick={handleCancel} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-red-600/20 active:scale-95 transition-all">Xác nhận hủy</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {rescheduleTarget && (
        <RescheduleModal
          booking={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={(updated, quote) => {
            setRescheduleTarget(null);
            setList((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
            if (parseFloat(quote?.can_thanh_toan_them || 0) > 0) {
              alert(`Đã đổi lịch và cập nhật hóa đơn. Đã gửi email yêu cầu khách thanh toán chênh lệch ${formatVND(quote.can_thanh_toan_them)}.`);
            }
          }}
        />
      )}

      {/* ==== MODAL: XEM STK HOÀN TIỀN ==== */}
      <AnimatePresence>
        {bankInfoTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card w-full max-w-sm rounded-3xl border border-border p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black uppercase text-orange-600">STK nhận hoàn tiền</h3>
                <button onClick={() => setBankInfoTarget(null)} className="p-1.5 hover:bg-secondary rounded-lg"><X size={18}/></button>
              </div>
              <p className="text-xs text-muted-foreground mb-1">Đơn {bankInfoTarget.ma_dat_san} — {bankInfoTarget.ten_khach || "Khách lẻ"}</p>
              <div className="mb-4 p-3 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-orange-600">Mức hoàn: {Math.round((bankInfoTarget.ty_le_hoan_tien ?? 0) * 100)}%</div>
                  <div className="text-lg font-black text-orange-700">{formatVND(bankInfoTarget.so_tien_hoan ?? 0)}</div>
                </div>
                {bankInfoTarget.invoice?.trang_thai === "HOAN_TIEN" ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full">✅ Đã hoàn tiền</span>
                ) : (
                  <span className="text-[10px] font-bold text-orange-700 bg-orange-100 border border-orange-200 px-2.5 py-1 rounded-full">⏳ Chưa hoàn tiền</span>
                )}
              </div>
              {bankInfoTarget.stk_hoan_tien || bankInfoTarget.ten_tk_hoan_tien || bankInfoTarget.ngan_hang_hoan_tien ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Số tài khoản</span>
                    <span className="font-bold">{bankInfoTarget.stk_hoan_tien || "—"}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Tên chủ TK</span>
                    <span className="font-bold">{bankInfoTarget.ten_tk_hoan_tien || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ngân hàng</span>
                    <span className="font-bold">{bankInfoTarget.ngan_hang_hoan_tien || "—"}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Khách chưa cung cấp — hệ thống đã gửi email hướng dẫn khách vào "Lịch đặt của tôi" để nhập thông tin nhận hoàn tiền.</p>
              )}
              {isManager && bankInfoTarget.invoice?.trang_thai !== "HOAN_TIEN" && (
                <button
                  onClick={() => handleConfirmRefund(bankInfoTarget)}
                  className="mt-5 w-full py-3 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold transition-colors"
                >
                  Xác nhận đã hoàn tiền &amp; gửi email cho khách
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
