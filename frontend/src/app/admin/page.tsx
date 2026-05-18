"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { apiGet, formatVND } from "@/lib/api";
import { TrendingUp, Calendar, MapPin, Users, ArrowRight, Loader2, Clock, Star } from "lucide-react";

export default function AdminDashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [recentBookings, setRB] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const end = today.toISOString().slice(0, 10);
    Promise.all([
      apiGet(`/api/reports/summary?tu_ngay=${start}&den_ngay=${end}`).catch(() => null),
      apiGet(`/api/bookings`).catch(() => []),
    ]).then(([s, b]) => { setSummary(s); setRB(b.slice(0, 5)); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
          <span className="text-sm font-medium text-primary uppercase tracking-wider">Tổng quan</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Số liệu tháng hiện tại</p>
      </motion.div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<TrendingUp className="w-6 h-6" />} label="Tổng doanh thu" value={formatVND(summary.tong_doanh_thu)} color="from-primary to-primary/60" delay={0.1} />
          <StatCard icon={<Calendar className="w-6 h-6" />} label="Lượt đặt" value={summary.tong_luot_dat} color="from-accent to-accent/60" delay={0.2} />
          <StatCard icon={<MapPin className="w-6 h-6" />} label="Tỷ lệ lấp đầy" value={`${summary.ty_le_lap_day}%`} color="from-chart-3 to-chart-3/60" delay={0.3} />
          <StatCard icon={<Users className="w-6 h-6" />} label="Khách hàng" value={summary.tong_khach_hang} color="from-chart-4 to-chart-4/60" delay={0.4} />
        </div>
      )}

      {summary && (
        <div className="grid md:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="p-6 bg-card rounded-3xl border border-border">
            <div className="flex items-center gap-3 mb-2">
              <Star className="w-5 h-5 text-accent" />
              <span className="text-sm text-muted-foreground">Sân đặt nhiều nhất</span>
            </div>
            <div className="text-2xl font-display font-bold text-foreground">{summary.san_dat_nhieu_nhat || "—"}</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="p-6 bg-card rounded-3xl border border-border">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground">Khung giờ cao điểm</span>
            </div>
            <div className="text-2xl font-display font-bold text-foreground">{summary.khung_gio_cao_diem || "—"}</div>
          </motion.div>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="bg-card rounded-3xl border border-border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold text-foreground">Lịch đặt gần đây</h2>
          <Link href="/admin/bookings" className="flex items-center gap-2 text-sm text-primary font-semibold hover:underline">
            Xem tất cả <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {recentBookings.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Chưa có booking</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentBookings.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.1 }}
                className="flex items-center justify-between p-4 rounded-2xl bg-secondary/50 hover:bg-secondary transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <span className="text-2xl">⚽</span>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{b.ten_san}</div>
                    <div className="text-sm text-muted-foreground">
                      {b.ten_khach || "Khách vãng lai"} • {b.ngay_dat} {b.gio_bat_dau?.slice(0, 5)}-{b.gio_ket_thuc?.slice(0, 5)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-foreground">{formatVND(b.tien_san)}</div>
                  <div className={`text-xs font-medium px-2 py-1 rounded-full ${
                    b.trang_thai === "HOAN_THANH" ? "bg-primary/10 text-primary" :
                    b.trang_thai === "CHO_XAC_NHAN" ? "bg-accent/10 text-accent" :
                    "bg-muted text-muted-foreground"
                  }`}>{b.trang_thai}</div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
        <h2 className="text-xl font-display font-bold text-foreground mb-4">Thao tác nhanh</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction href="/admin/bookings" icon={<Calendar className="w-5 h-5" />} label="Quản lý booking" />
          <QuickAction href="/admin/fields" icon={<MapPin className="w-5 h-5" />} label="Quản lý sân" />
          <QuickAction href="/admin/reports" icon={<TrendingUp className="w-5 h-5" />} label="Xem báo cáo" />
          <QuickAction href="/admin/shifts" icon={<Users className="w-5 h-5" />} label="Phân ca" />
        </div>
      </motion.div>
    </div>
  );
}

function StatCard({ icon, label, value, color, delay }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="bg-card rounded-3xl border border-border p-6 card-hover">
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 text-white`}>{icon}</div>
      <div className="text-sm text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-display font-bold text-foreground">{value}</div>
    </motion.div>
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
