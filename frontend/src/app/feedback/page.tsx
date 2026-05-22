"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, formatDateTime } from "@/lib/api";
import { Star, Loader2, MessageSquare, Filter, ArrowUpDown } from "lucide-react";

type SortOption = "newest" | "highest";

export default function CustomerFeedbacks() {
  const [list, setList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [starFilter, setStarFilter] = useState<string>(""); 
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

  const sortedList = useMemo(() => {
    let result = [...list];
    if (sort === "newest") {
      result.sort((a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime());
    } else {
      result.sort((a, b) => b.danh_gia_tong - a.danh_gia_tong);
    }
    return result;
  }, [list, sort]);

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 space-y-8 font-serif">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-foreground italic">Cộng Đồng Đánh Giá</h1>
        <p className="text-muted-foreground">Những chia sẻ thực tế từ các cầu thủ đã trải nghiệm sân bóng</p>
      </div>

      {/* Thống kê rút gọn cho khách xem */}
      {stats && (
        <div className="flex justify-center gap-8 bg-card p-6 rounded-3xl border border-border shadow-sm">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{stats.trung_binh}★</div>
            <div className="text-xs uppercase font-bold text-muted-foreground tracking-widest">Điểm trung bình</div>
          </div>
          <div className="w-px bg-border self-stretch" />
          <div className="text-center">
            <div className="text-3xl font-bold text-foreground">{stats.tong_so}</div>
            <div className="text-xs uppercase font-bold text-muted-foreground tracking-widest">Lượt đánh giá</div>
          </div>
        </div>
      )}

      {/* Bộ lọc đơn giản cho người dùng */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <button onClick={() => setStarFilter("")} className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${!starFilter ? "bg-primary text-white" : "bg-secondary"}`}>Tất cả</button>
          {[5, 4, 3].map((n) => (
            <button key={n} onClick={() => setStarFilter(String(n))} className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${starFilter === String(n) ? "bg-primary text-white" : "bg-secondary"}`}>{n}★</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
          <select value={sort} onChange={e => setSort(e.target.value as SortOption)} className="bg-transparent text-xs font-bold outline-none cursor-pointer border border-border rounded-xl px-3 py-2">
            <option value="newest">Mới nhất</option>
            <option value="highest">Đánh giá tốt nhất</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : (
        <div className="grid gap-6">
          {sortedList.map((f, i) => (
            <FeedbackCard key={f.id} f={f} delay={i * 0.05} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ f, delay }: { f: any; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-card rounded-3xl border border-border p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
            {(f.ten_khach || "K").charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-sm">{f.ten_khach || "Khách vãng lai"}</div>
            <div className="text-[10px] text-muted-foreground uppercase font-medium">{f.ten_san} • {formatDateTime(f.ngay_tao)}</div>
          </div>
        </div>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={14} className={`${n <= f.danh_gia_tong ? "text-amber-400 fill-amber-400" : "text-muted-foreground/20"}`} />
          ))}
        </div>
      </div>
      <p className="text-sm text-foreground italic leading-relaxed bg-secondary/30 p-4 rounded-2xl">"{f.nhan_xet || "Khách hàng không để lại nhận xét."}"</p>
    </motion.div>
  );
}
