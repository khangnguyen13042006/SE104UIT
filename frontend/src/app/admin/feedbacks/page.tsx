"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, formatDateTime } from "@/lib/api";
import { Star, Loader2, AlertTriangle, MessageSquare, TrendingUp, Filter, ArrowUpDown, Search, Calendar, X, RotateCcw } from "lucide-react";

type SortOption = "newest" | "oldest" | "highest" | "lowest";

export default function FeedbacksAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // States cho bộ lọc (Thêm mới)
  const [keyword, setKeyword] = useState("");
  const [starFilter, setStarFilter] = useState<string>(""); 
  const [tuNgay, setTuNgay] = useState<string>("");
  const [denNgay, setDenNgay] = useState<string>("");
  const [sort, setSort] = useState<SortOption>("newest");

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

  // Logic lọc và tìm kiếm (Thêm mới)
  const filteredAndSorted = useMemo(() => {
    let result = list.filter(f => {
      const matchKeyword = 
        f.ten_khach?.toLowerCase().includes(keyword.toLowerCase()) || 
        f.ten_san?.toLowerCase().includes(keyword.toLowerCase()) ||
        f.nhan_xet?.toLowerCase().includes(keyword.toLowerCase());
      
      // Lọc ngày (nếu có chọn)
      let matchDate = true;
      if (tuNgay || denNgay) {
        const d = new Date(f.ngay_tao).getTime();
        if (tuNgay) matchDate = matchDate && d >= new Date(tuNgay).getTime();
        if (denNgay) {
          const end = new Date(denNgay);
          end.setHours(23, 59, 59);
          matchDate = matchDate && d <= end.getTime();
        }
      }
      
      return matchKeyword && matchDate;
    });

    switch (sort) {
      case "newest": result.sort((a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime()); break;
      case "oldest": result.sort((a, b) => new Date(a.ngay_tao).getTime() - new Date(b.ngay_tao).getTime()); break;
      case "highest": result.sort((a, b) => b.danh_gia_tong - a.danh_gia_tong); break;
      case "lowest": result.sort((a, b) => a.danh_gia_tong - b.danh_gia_tong); break;
    }
    return result;
  }, [list, keyword, sort, tuNgay, denNgay]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Đánh giá khách hàng</h1>
        <p className="text-muted-foreground text-sm">Xem và quản lý các phản hồi từ người dùng</p>
      </motion.div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<MessageSquare className="w-5 h-5" />} label="Tổng số" value={stats.tong_so} color="bg-blue-500" />
          <StatCard icon={<Star className="w-5 h-5" />} label="Trung bình" value={`${stats.trung_binh}★`} color="bg-accent" />
          <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Hài lòng" value={stats.hai_long || 0} color="bg-emerald-500" />
          <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Cần lưu ý" value={stats.canh_bao} color="bg-destructive" />
        </div>
      )}

      {/* PHẦN BỘ LỌC (PHẦN THÊM MỚI) */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4 shadow-sm">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              value={keyword} 
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm khách, sân, nhận xét..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-input bg-background text-sm outline-none focus:border-primary" 
            />
          </div>
          <div className="flex items-center gap-2 bg-background border border-input rounded-xl px-3 py-1">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input type="date" value={tuNgay} onChange={e => setTuNgay(e.target.value)} className="bg-transparent text-xs outline-none" />
            <span className="text-muted-foreground">-</span>
            <input type="date" value={denNgay} onChange={e => setDenNgay(e.target.value)} className="bg-transparent text-xs outline-none" />
          </div>
          <button onClick={() => { setKeyword(""); setTuNgay(""); setDenNgay(""); setStarFilter(""); }} className="px-3 py-2 text-xs font-medium hover:bg-secondary rounded-xl transition-colors">
            Xóa lọc
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex gap-2">
            <FilterBtn active={!starFilter} onClick={() => setStarFilter("")}>Tất cả</FilterBtn>
            {[5, 4, 3, 2, 1].map(n => (
              <FilterBtn key={n} active={starFilter === String(n)} onClick={() => setStarFilter(String(n))}>{n}★</FilterBtn>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            <select value={sort} onChange={e => setSort(e.target.value as SortOption)} className="bg-transparent text-xs font-bold outline-none cursor-pointer">
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
              <option value="highest">Cao nhất</option>
              <option value="lowest">Thấp nhất</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : (
        <div className="grid gap-4">
          {filteredAndSorted.map((f, i) => (
            <FeedbackItem key={f.id} f={f} delay={i * 0.05} />
          ))}
          {filteredAndSorted.length === 0 && (
            <div className="text-center p-10 text-muted-foreground italic">Không có đánh giá nào phù hợp.</div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, children }: any) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white`}>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function FeedbackItem({ f, delay }: { f: any; delay: number }) {
  const urgent = f.danh_gia_tong <= 2;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className={`bg-card rounded-2xl border p-5 hover:shadow-sm transition-all ${urgent ? "border-destructive/30 bg-destructive/5" : "border-border"}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${urgent ? "bg-destructive" : "bg-primary"}`}>
            {(f.ten_khach || "K").charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-sm">{f.ten_khach || "Khách vãng lai"}</div>
            <div className="text-xs text-muted-foreground truncate">{f.ten_san} · {formatDateTime(f.ngay_tao)}</div>
          </div>
          {urgent && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="w-3 h-3" /> Khẩn</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-4 h-4 ${n <= f.danh_gia_tong ? "text-accent fill-accent" : "text-muted-foreground/20"}`} />
          ))}
        </div>
      </div>

      {f.nhan_xet && <p className="text-sm text-foreground mb-3 leading-relaxed italic bg-secondary/40 rounded-xl p-3">"{f.nhan_xet}"</p>}

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
    <span className="inline-flex items-center gap-1 bg-secondary px-2 py-1 rounded-lg">
      {label}: <span className="font-bold text-foreground">{value}</span>
      <Star className="w-2 h-2 fill-accent text-accent" />
    </span>
  );
}
