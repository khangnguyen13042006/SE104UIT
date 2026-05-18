"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { apiGet, formatDateTime } from "@/lib/api";
import { Star, Loader2, MessageSquare } from "lucide-react";

export default function FeedbackPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const params = filter ? `?min_star=${filter}&max_star=${filter}` : "";
      const r = await apiGet(`/api/feedbacks${params}`);
      setList(r);
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter]);

  const avg = list.length ? (list.reduce((s, f) => s + f.danh_gia_tong, 0) / list.length).toFixed(1) : "—";

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
            <span className="text-sm font-medium text-primary uppercase tracking-wider">Cộng đồng</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-2">Đánh giá khách hàng</h1>
          <p className="text-muted-foreground mb-6">Trải nghiệm thực tế từ những người đã sử dụng sân</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-sidebar text-sidebar-foreground rounded-3xl p-6 md:p-8 mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="relative">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
              <div>
                <div className="text-xs text-sidebar-foreground/50 mb-1 uppercase tracking-wider">Điểm trung bình</div>
                <div className="text-5xl md:text-6xl font-display font-bold text-primary flex items-baseline gap-2">
                  {avg}
                  <span className="text-2xl text-sidebar-foreground/40">/ 5</span>
                </div>
                <div className="text-sm text-sidebar-foreground/60 mt-1">{list.length} lượt đánh giá</div>
              </div>
              <div className="flex flex-col items-end">
                <Star className="w-12 h-12 text-primary fill-primary mb-2" />
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={`w-4 h-4 ${n <= Math.round(parseFloat(avg) || 0) ? "text-primary fill-primary" : "text-sidebar-foreground/20"}`} />
                  ))}
                </div>
              </div>
            </div>

            {/* Star Filter */}
            <div>
              <div className="text-xs text-sidebar-foreground/50 mb-2 uppercase tracking-wider">Lọc theo số sao</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setFilter("")}
                  className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all ${
                    !filter ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "bg-white/10 hover:bg-white/20 text-sidebar-foreground"
                  }`}>
                  Tất cả ({list.length})
                </button>
                {[5, 4, 3, 2, 1].map((n) => (
                  <button key={n} onClick={() => setFilter(String(n))}
                    className={`px-4 py-2 rounded-2xl text-sm font-semibold flex items-center gap-1.5 transition-all ${
                      filter === String(n) ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "bg-white/10 hover:bg-white/20 text-sidebar-foreground"
                    }`}>
                    {n} <Star className="w-3.5 h-3.5 fill-current" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {loading ? (
          <div className="p-16 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
        ) : list.length === 0 ? (
          <div className="bg-card rounded-3xl p-16 text-center border border-border">
            <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">Chưa có đánh giá nào{filter ? ` cho ${filter} sao` : ""}</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="space-y-3">
            {list.map((f, i) => <FeedbackItem key={f.id} f={f} delay={i * 0.05} />)}
          </motion.div>
        )}
      </div>
    </>
  );
}

function FeedbackItem({ f, delay }: { f: any; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-card rounded-3xl border border-border p-5 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm shrink-0">
            {(f.ten_khach || "K").charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-foreground">{f.ten_khach || "Khách ẩn danh"}</div>
            <div className="text-xs text-muted-foreground">{f.ten_san} • {formatDateTime(f.ngay_tao)}</div>
          </div>
        </div>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-4 h-4 ${n <= f.danh_gia_tong ? "text-accent fill-accent" : "text-muted-foreground/20"}`} />
          ))}
        </div>
      </div>

      {f.nhan_xet && (
        <p className="text-sm text-foreground mb-3 leading-relaxed italic">"{f.nhan_xet}"</p>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {f.danh_gia_co_so && <Sub label="Cơ sở" value={f.danh_gia_co_so} />}
        {f.danh_gia_nhan_vien && <Sub label="Nhân viên" value={f.danh_gia_nhan_vien} />}
        {f.danh_gia_dich_vu && <Sub label="Dịch vụ" value={f.danh_gia_dich_vu} />}
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
