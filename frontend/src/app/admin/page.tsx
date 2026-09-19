"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatVND } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import {
  TrendingUp, Calendar, MapPin, Users, ArrowRight, Package,
  RefreshCw, ChevronRight, ChevronLeft, X,
} from "lucide-react";

const TINH_TRANG: Record<string, { label: string; card: string; time: string; dot: string }> = {
  sap_toi: {
    label: "Sắp tới",
    card: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    time: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  dang_da: {
    label: "Đang đá",
    card: "bg-emerald-100 border-emerald-500 ring-2 ring-emerald-500/30 hover:border-emerald-600",
    time: "text-emerald-800",
    dot: "bg-emerald-600 animate-pulse",
  },
  xong: {
    label: "Đã xong",
    card: "bg-slate-100 border-slate-200 hover:border-slate-300",
    time: "text-slate-500",
    dot: "bg-slate-400",
  },
  huy: {
    label: "Đã hủy",
    card: "bg-red-50 border-red-200 hover:border-red-300",
    time: "text-red-600 line-through",
    dot: "bg-red-500",
  },
};

const hhmm = (t?: string) => (t || "").slice(0, 5);

export default function AdminDashboard() {
  // Poll 60s; trạng thái từng khung giờ còn được tính lại mỗi 30s ở client (xem `nowVn`)
  const { data, loading, refreshing, error, reload } = useApi<any>("/api/reports/today", 60000);
  const [svcTarget, setSvcTarget] = useState<any>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Giờ VN hiện tại = mốc server trả về + thời gian trôi qua ở client (không phụ thuộc múi giờ máy khách)
  const [anchor, setAnchor] = useState<{ server: number; local: number } | null>(null);
  useEffect(() => {
    if (data?.gio_hien_tai) {
      setAnchor({ server: new Date(data.gio_hien_tai + "Z").getTime(), local: Date.now() });
    }
  }, [data?.gio_hien_tai]);

  const nowVn = useMemo(() => {
    void tick;
    if (!anchor) return null;
    return new Date(anchor.server + (Date.now() - anchor.local));
  }, [anchor, tick]);

  function liveTinhTrang(slot: any): string {
    if (slot.tinh_trang === "huy" || slot.trang_thai === "HUY") return "huy";
    if (slot.trang_thai === "HOAN_THANH") return "xong";
    if (!nowVn || !data?.ngay) return slot.tinh_trang;
    const start = new Date(`${data.ngay}T${slot.gio_bat_dau}Z`).getTime();
    const end = new Date(`${data.ngay}T${slot.gio_ket_thuc}Z`).getTime();
    const now = Date.UTC(
      nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate(),
      nowVn.getUTCHours(), nowVn.getUTCMinutes(), nowVn.getUTCSeconds()
    );
    if (now >= end) return "xong";
    if (now >= start) return "dang_da";
    return "sap_toi";
  }

  const ngayLabel = data?.ngay
    ? new Date(data.ngay + "T00:00:00").toLocaleDateString("vi-VN", {
        weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
      })
    : "";

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
          <span className="text-sm font-medium text-primary uppercase tracking-wider">Hôm nay</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1 capitalize">
              {ngayLabel || "Số liệu trong ngày"}
              {nowVn && <> • {nowVn.toISOString().slice(11, 16)}</>}
            </p>
          </div>
          <button
            onClick={reload}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Làm mới
          </button>
        </div>
      </motion.div>

      {error && !data && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} icon={<TrendingUp className="w-6 h-6" />} label="Doanh thu hôm nay"
          value={formatVND(data?.tong_doanh_thu || 0)} color="from-primary to-primary/60" />
        <StatCard loading={loading} icon={<Calendar className="w-6 h-6" />} label="Lượt đặt hôm nay"
          value={data?.tong_luot_dat ?? 0}
          sub={data?.so_luot_huy ? `${data.so_luot_huy} đơn đã hủy` : undefined}
          color="from-accent to-accent/60" />
        <StatCard loading={loading} icon={<MapPin className="w-6 h-6" />} label="Tỷ lệ lấp đầy"
          value={`${data?.ty_le_lap_day ?? 0}%`} sub={data ? `${data.tong_gio}h đã đặt` : undefined}
          color="from-chart-3 to-chart-3/60" />
        <StatCard loading={loading} icon={<Users className="w-6 h-6" />} label="Khách hôm nay"
          value={data?.so_khach ?? 0} color="from-chart-4 to-chart-4/60" />
      </div>

      <ScheduleBoard
        loading={loading}
        san={data?.san || []}
        liveTinhTrang={liveTinhTrang}
        onShowServices={setSvcTarget}
      />

      <div>
        <h2 className="text-xl font-display font-bold text-foreground mb-4">Thao tác nhanh</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction href="/admin/bookings" icon={<Calendar className="w-5 h-5" />} label="Quản lý booking" />
          <QuickAction href="/admin/fields" icon={<MapPin className="w-5 h-5" />} label="Quản lý sân" />
          <QuickAction href="/admin/reports" icon={<TrendingUp className="w-5 h-5" />} label="Xem báo cáo" />
          <QuickAction href="/admin/shifts" icon={<Users className="w-5 h-5" />} label="Phân ca" />
        </div>
      </div>

      {svcTarget && <ServiceModal slot={svcTarget} onClose={() => setSvcTarget(null)} />}
    </div>
  );
}

function ScheduleBoard({ loading, san, liveTinhTrang, onShowServices }: any) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const scrollBy = (dx: number) => scroller?.scrollBy({ left: dx, behavior: "smooth" });
  const canScroll = san.length > 3;

  return (
    <div className="bg-card rounded-3xl border border-border p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Lịch sân hôm nay</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Chỉ hiện sân có lượt đặt • tự cập nhật theo giờ thực</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
            <Legend cls="bg-emerald-500" label="Chưa hoàn thành" />
            <Legend cls="bg-slate-400" label="Đã hoàn thành" />
            <Legend cls="bg-red-500" label="Đã hủy" />
          </div>
          {canScroll && (
            <div className="flex gap-1">
              <button onClick={() => scrollBy(-320)} className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => scrollBy(320)} className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <Link href="/admin/bookings" className="flex items-center gap-1.5 text-sm text-primary font-semibold hover:underline">
            Xem tất cả <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[280px] shrink-0 rounded-2xl border border-border p-3 space-y-2">
              <div className="h-5 w-32 rounded bg-secondary animate-pulse" />
              <div className="h-16 rounded-xl bg-secondary animate-pulse" />
              <div className="h-16 rounded-xl bg-secondary animate-pulse" />
            </div>
          ))}
        </div>
      ) : san.length === 0 ? (
        <div className="text-center py-14">
          <Calendar className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Hôm nay chưa có sân nào được đặt</p>
        </div>
      ) : (
        <div ref={setScroller} className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar snap-x">
          {san.map((f: any) => (
            <div key={f.san_id} className="w-[280px] shrink-0 snap-start rounded-2xl border border-border bg-secondary/20 overflow-hidden">
              <div className="px-4 py-3 bg-secondary/60 border-b border-border">
                <div className="font-display font-bold text-foreground truncate">{f.ten_san}</div>
                <div className="text-[11px] text-muted-foreground">
                  {f.loai_san === "SAN_5" ? "Sân 5 người" : f.loai_san === "SAN_7" ? "Sân 7 người" : "Sân 11 người"}
                  {" • "}{f.slots.length} khung giờ
                </div>
              </div>
              <div className="p-3 space-y-2">
                {f.slots.map((s: any) => {
                  const st = TINH_TRANG[liveTinhTrang(s)] || TINH_TRANG.sap_toi;
                  return (
                    <div key={s.id} className={`rounded-xl border p-3 transition-colors ${st.card}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`font-bold tabular-nums ${st.time}`}>
                            {hhmm(s.gio_bat_dau)} - {hhmm(s.gio_ket_thuc)}
                          </div>
                          <div className="text-[11px] text-slate-600 truncate">{s.ten_khach}</div>
                          <div className="flex items-center gap-1 mt-1 text-[10px] font-semibold text-slate-500">
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                            <span className="text-slate-400">• {formatVND(s.tong_tien)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => onShowServices(s)}
                          title={s.dich_vu.length ? `${s.dich_vu.length} dịch vụ đi kèm` : "Không có dịch vụ đi kèm"}
                          className={`relative shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
                            s.dich_vu.length
                              ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              : "border-slate-200 bg-white/60 text-slate-300 hover:bg-white"
                          }`}
                        >
                          <Package className="w-4 h-4" />
                          {s.dich_vu.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                              {s.dich_vu.length}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${cls}`} /> {label}
    </span>
  );
}

function ServiceModal({ slot, onClose }: { slot: any; onClose: () => void }) {
  const tong = slot.dich_vu.reduce((s: number, x: any) => s + parseFloat(x.thanh_tien), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full max-w-sm rounded-3xl border border-border p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-display font-bold text-foreground">Dịch vụ đi kèm</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {slot.ma_dat_san} • {hhmm(slot.gio_bat_dau)}-{hhmm(slot.gio_ket_thuc)} • {slot.ten_khach}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {slot.dich_vu.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">Khung giờ này không có dịch vụ đi kèm.</p>
        ) : (
          <div className="space-y-2">
            {slot.dich_vu.map((d: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 text-sm">
                <span className="text-foreground">
                  {d.ten_dich_vu} <span className="text-muted-foreground">×{d.so_luong}</span>
                </span>
                <span className="font-semibold text-foreground">{formatVND(d.thanh_tien)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-border text-sm font-bold">
              <span>Tổng dịch vụ</span>
              <span className="text-primary">{formatVND(tong)}</span>
            </div>
          </div>
        )}

        <Link
          href="/admin/bookings"
          className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          Mở chi tiết đơn <ArrowRight className="w-4 h-4" />
        </Link>
      </motion.div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color, loading }: any) {
  return (
    <div className="bg-card rounded-3xl border border-border p-6 card-hover">
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 text-white`}>{icon}</div>
      <div className="text-sm text-muted-foreground mb-1">{label}</div>
      {loading ? (
        <div className="h-8 w-24 rounded bg-secondary animate-pulse" />
      ) : (
        <div className="text-2xl font-display font-bold text-foreground">{value}</div>
      )}
      {sub && !loading && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function QuickAction({ href, icon, label }: any) {
  return (
    <Link href={href} className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all group">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground group-hover:text-primary transition-colors">{icon}</div>
        <span className="font-medium text-foreground">{label}</span>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
    </Link>
  );
}
