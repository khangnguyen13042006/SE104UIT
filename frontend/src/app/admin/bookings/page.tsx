"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPost, formatVND, formatDate } from "@/lib/api";
import {
  Loader2, CheckCircle2, DollarSign, Search, X, Calendar,
  Filter, Clock, XCircle, RotateCcw, Receipt, User, Phone, MapPin
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
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);
  const [lyDoHuy, setLyDoHuy] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await apiGet("/api/bookings/admin/all");
      setList(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(id: number) {
    if (!confirm("Xác nhận đơn đặt sân này?")) return;
    try {
      await apiPost(`/api/bookings/${id}/confirm`);
      fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleCancel() {
    if (!cancelTarget || !lyDoHuy.trim()) return;
    try {
      await apiPost(`/api/bookings/${cancelTarget}/cancel`, { ly_do_huy: lyDoHuy });
      setCancelTarget(null);
      setLyDoHuy("");
      fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const filtered = list.filter(b => {
    // Sửa lỗi: dùng ma_dat_san thay vì ma_booking
    const matchSearch = 
      b.ten_khach?.toLowerCase().includes(keyword.toLowerCase()) || 
      b.ma_dat_san?.toLowerCase().includes(keyword.toLowerCase()) ||
      b.sdt_khach?.includes(keyword);
    const matchStatus = statusFilter === "ALL" || b.trang_thai === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black italic uppercase text-foreground tracking-tighter">Quản lý đặt sân</h1>
          <p className="text-muted-foreground text-sm">Theo dõi và xử lý các yêu cầu đặt sân thời gian thực</p>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={fetchData} className="p-2 hover:bg-secondary rounded-full transition-all">
             <RotateCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input 
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="Tìm theo tên, SĐT hoặc mã đơn..." 
            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-card border border-border outline-none focus:border-primary transition-all font-medium shadow-sm" 
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-card border border-border outline-none focus:border-primary appearance-none font-medium shadow-sm"
          >
            <option value="ALL">Tất cả trạng thái</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v.text}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/50 border-b border-border">
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Mã đơn / Khách hàng</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Thông tin sân</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Thời gian</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Tổng tiền</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="p-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="p-20 text-center text-muted-foreground font-medium">Không tìm thấy dữ liệu phù hợp</td></tr>
              ) : filtered.map((b) => (
                <tr key={b.id} className="hover:bg-secondary/20 transition-colors group">
                  <td className="p-5">
                    <div className="font-bold text-primary mb-1">#{b.ma_dat_san}</div>
                    <div className="flex items-center gap-2 font-semibold text-foreground"><User className="w-3.5 h-3.5 text-muted-foreground" /> {b.ten_khach}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Phone className="w-3.5 h-3.5" /> {b.sdt_khach}</div>
                  </td>
                  <td className="p-5">
                    <div className="font-bold flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-red-500" /> {b.ten_san}</div>
                    <div className="text-xs text-muted-foreground mt-1 px-2 py-0.5 bg-secondary rounded-full w-fit">
                      {b.loai_san === 'SAN_5' ? 'Sân 5 người' : 'Sân 7 người'}
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-2 text-sm font-medium"><Calendar className="w-3.5 h-3.5 text-muted-foreground" /> {formatDate(b.ngay_dat)}</div>
                    <div className="flex items-center gap-2 text-sm font-bold mt-1 text-primary"><Clock className="w-3.5 h-3.5" /> {b.gio_bat_dau.slice(0,5)} - {b.gio_ket_thuc.slice(0,5)}</div>
                  </td>
                  <td className="p-5 text-right">
                    <div className="font-black text-lg">{formatVND(b.tong_tien)}</div>
                    <div className={`mt-2 inline-block px-3 py-1 rounded-full text-[10px] font-bold border ${STATUS_LABEL[b.trang_thai]?.cls || ""}`}>
                      {STATUS_LABEL[b.trang_thai]?.text || b.trang_thai}
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {b.trang_thai === 'CHO_XAC_NHAN' && (
                        <>
                          <button 
                            onClick={() => handleConfirm(b.id)}
                            className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                            title="Xác nhận đơn"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setCancelTarget(b.id)}
                            className="p-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition-all"
                            title="Hủy đơn"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => router.push(`/admin/bookings/${b.id}`)}
                        className="p-2 bg-secondary text-foreground rounded-xl hover:bg-border transition-all"
                        title="Chi tiết"
                      >
                        <Receipt className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Hủy Đơn */}
      <AnimatePresence>
        {cancelTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="bg-card w-full max-w-md rounded-3xl border border-border p-8 shadow-2xl">
              <h3 className="text-2xl font-black mb-2 uppercase italic text-red-600">Hủy đơn đặt sân</h3>
              <p className="text-muted-foreground text-sm mb-6">Vui lòng nhập lý do cụ thể để lưu lại lịch sử hệ thống.</p>
              <textarea 
                value={lyDoHuy} 
                onChange={e => setLyDoHuy(e.target.value)} 
                placeholder="Ví dụ: Khách báo bận, sân bảo trì..." 
                className="w-full p-4 rounded-2xl bg-secondary/50 border border-border outline-none min-h-[120px] mb-6 focus:border-red-500 transition-all font-medium" 
              />
              <div className="flex gap-3">
                <button onClick={() => { setCancelTarget(null); setLyDoHuy(""); }} className="flex-1 py-4 font-bold hover:bg-secondary rounded-2xl transition-all">Đóng</button>
                <button onClick={handleCancel} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200">Xác nhận hủy</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
