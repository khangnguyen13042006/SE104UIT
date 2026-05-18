"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, formatDateTime } from "@/lib/api";
import { Star, Loader2, AlertTriangle, MessageSquare, TrendingUp, Filter, ArrowUpDown } from "lucide-react";

type SortOption = "newest" | "oldest" | "highest" | "lowest";

export default function FeedbacksAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [starFilter, setStarFilter] = useState<string>("");  // "", "1", "2", "3", "4", "5"
  const [sort, setSort] = useState<SortOption>("newest");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (starFilter) {
        params.set("min_star", starFilter);
        params.set("max_star", starFilter);
      }
      const [items, s] = await Promise.all([
        apiGet(`/api/feedbacks?${params}`),
        apiGet("/api/feedbacks/stats").catch(() => null),
      ]);
      setList(items);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [starFilter]);

  // Client-side sort
  const sorted = useMemo(() => {
    const arr = [...list];
    switch (sort) {
      case "newest": arr.sort((a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime()); break;
      case "oldest": arr.sort((a, b) => new Date(a.ngay_tao).getTime() - new Date(b.ngay_tao).getTime()); break;
      case "highest": arr.sort((a, b) => b.danh_gia_tong - a.danh_gia_tong || new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime()); break;
      case "lowest": arr.sort((a, b) => a.danh_gia_tong - b.danh_gia_tong || new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime()); break;
    }
    return arr;
  }, [list, sort]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
          <span className="text-sm font-medium text-primary uppercase tracking-wider">Phản hồi</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Đánh giá khách hàng</h1>
        <p className="text-muted-foreground text-sm mt-1">Theo dõi feedback để cải thiện dịch vụ</p>
      </motion.div>

      {/* Stats */}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<MessageSquare className="w-5 h-5" />} label="Tổng đánh giá" value={stats.tong_so} color="from-primary to-primary/60" />
          <StatCard icon={<Star className="w-5 h-5" />} label="Điểm trung bình" value={`${stats.trung_binh}★`} color="from-accent to-accent/60" />
          <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Hài lòng (≥4★)" value={stats.hai_long || 0} color="from-chart-3 to-chart-3/60" />
          <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Cảnh báo (<3★)" value={stats.canh_bao} color="from-destructive to-destructive/60" />
        </motion.div>
      )}

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-card rounded-3xl border border-border p-5 space-y-4">
        {/* Star filter */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Lọc theo số sao</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <FilterChip active={!starFilter} onClick={() => setStarFilter("")}>
              Tất cả
            </FilterChip>
            {[5, 4, 3, 2, 1].map((n) => (
              <FilterChip key={n} active={starFilter === String(n)} onClick={() => setStarFilter(String(n))}>
                <span className="flex items-center gap-1">
                  {n}<Star className="w-3 h-3 fill-current" />
                </span>
              </FilterChip>
            ))}
          </div>
        </div>

        {/* Sort */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Sắp xếp</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <FilterChip active={sort === "newest"} onClick={() => setSort("newest")}>Mới nhất</FilterChip>
            <FilterChip active={sort === "oldest"} onClick={() => setSort("oldest")}>Cũ nhất</FilterChip>
            <FilterChip active={sort === "highest"} onClick={() => setSort("highest")}>Điểm cao nhất</FilterChip>
            <FilterChip active={sort === "lowest"} onClick={() => setSort("lowest")}>Điểm thấp nhất</FilterChip>
          </div>
        </div>

        <div className="pt-3 border-t border-border text-sm text-muted-foreground">
          Hiển thị <strong className="text-foreground">{sorted.length}</strong> đánh giá
          {starFilter && ` với ${starFilter}★`}
        </div>
      </motion.div>

      {/* List */}
      {loading ? (
        <div className="p-16 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : sorted.length === 0 ? (
        <div className="bg-card rounded-3xl p-16 text-center border border-border">
          <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">Không có đánh giá nào{starFilter ? ` với ${starFilter}★` : ""}</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="space-y-3">
          {sorted.map((f, i) => <FeedbackItem key={f.id} f={f} delay={i * 0.03} />)}
        </motion.div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
          : "bg-secondary text-foreground hover:bg-secondary/70"
      }`}>
      {children}
    </button>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <div className="bg-card rounded-3xl border border-border p-5">
      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center mb-3 text-white`}>
        {icon}
      </div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-display font-bold text-foreground">{value}</div>
    </div>
  );
}

function FeedbackItem({ f, delay }: { f: any; delay: number }) {
  const urgent = f.danh_gia_tong <= 2;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className={`bg-card rounded-3xl border p-5 hover:shadow-md transition-all ${
        urgent ? "border-destructive/30" : "border-border"
      }`}>
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
            urgent ? "bg-gradient-to-br from-destructive to-destructive/70" : "bg-gradient-to-br from-primary to-accent"
          }`}>
            {(f.ten_khach || "K").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-foreground truncate">{f.ten_khach || "Khách"}</div>
            <div className="text-xs text-muted-foreground truncate">
              {f.ten_san} · {formatDateTime(f.ngay_tao)}
            </div>
          </div>
          {urgent && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="w-3 h-3" /> Khẩn
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-4 h-4 ${n <= f.danh_gia_tong ? "text-accent fill-accent" : "text-muted-foreground/20"}`} />
          ))}
        </div>
      </div>

      {f.nhan_xet && (
        <p className="text-sm text-foreground mb-3 leading-relaxed italic bg-secondary/40 rounded-xl p-3">"{f.nhan_xet}"</p>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Sub label="Cơ sở" value={f.danh_gia_co_so} />
        <Sub label="Nhân viên" value={f.danh_gia_nhan_vien} />
        <Sub label="Dịch vụ" value={f.danh_gia_dich_vu} />
      </div>
    </motion.div>
  );
}

function Sub({ label, value }: any) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary">
      {label}:{" "}
      <span className="font-bold text-foreground inline-flex items-center gap-0.5">
        {value}/5 <Star className="w-3 h-3 fill-accent text-accent" />
      </span>
    </span>
  );
}
