"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, formatDateTime } from "@/lib/api";
import { 
  Star, Loader2, AlertTriangle, MessageSquare, TrendingUp, 
  Filter, ArrowUpDown, Search, Calendar, X, RotateCcw 
} from "lucide-react";

type SortOption = "newest" | "oldest" | "highest" | "lowest";

export default function FeedbacksAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // States cho bộ lọc đồng bộ với Admin
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
      // Khang lưu ý: API Backend cần hỗ trợ tu_ngay/den_ngay cho feedback nếu muốn lọc từ Server
      if (tuNgay) params.set("tu_ngay", tuNgay);
      if (denNgay) params.set("den_ngay", denNgay);

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

  useEffect(() => { load(); }, [starFilter, tuNgay, denNgay]);

  // Logic lọc và tìm kiếm Client-side cho mượt
  const filteredAndSorted = useMemo(() => {
    let result = list.filter(f => {
      const matchKeyword = 
        f.ten_khach?.toLowerCase().includes(keyword.toLowerCase()) || 
        f.ten_san?.toLowerCase().includes(keyword.toLowerCase()) ||
        f.nhan_xet?.toLowerCase().includes(keyword.toLowerCase());
      return matchKeyword;
    });

    switch (sort) {
      case "newest": result.sort((a, b) => new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime()); break;
      case "oldest": result.sort((a, b) => new Date(a.ngay_tao).getTime() - new Date(b.ngay_tao).getTime()); break;
      case "highest": result.sort((a, b) => b.danh_gia_tong - a.danh_gia_tong || new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime()); break;
      case "lowest": result.sort((a, b) => a.danh_gia_tong - b.danh_gia_tong || new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime()); break;
    }
    return result;
  }, [list, keyword, sort]);

  function resetFilters() {
    setKeyword("");
    setStarFilter("");
    setTuNgay("");
    setDenNgay("");
    setSort("newest");
  }

  return (
    <div className="space-y-6 font-serif">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
          <span className="text-sm font-medium text-primary uppercase tracking-wider">Phản hồi</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Đánh giá khách hàng</h1>
        <p className="text-muted-foreground text-sm mt-1">Phân tích ý kiến để nâng cao chất lượng sân bóng</p>
      </motion.div>

      {/* Thẻ thống kê nhanh */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<MessageSquare className="w-5 h-5" />} label="Tổng đánh giá" value={stats.tong_so} color="from-primary to-primary/60" />
          <StatCard icon={<Star className="w-5 h-5" />} label="Điểm trung bình" value={`${stats.trung_binh}★`} color="from-accent to-accent/60" />
          <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Hài lòng" value={stats.hai_long || 0} color="from-chart-3 to-chart-3/60" />
          <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Cần lưu ý" value={stats.canh_bao} color="from-destructive to-destructive/60" />
        </div>
      )}

      {/* Thanh bộ lọc nâng cấp */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-card rounded-3xl border border-border p-6 space-y-5 shadow-sm">
        
        {/* Tìm kiếm & Nút Reset */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              value={keyword} 
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm tên khách, tên sân, nội dung nhận xét..."
              className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-input bg-background outline-none focus:border-primary transition-all text-sm" 
            />
          </div>
          <button onClick={resetFilters} className="px-4 py-2 rounded-2xl border border-border hover:bg-secondary text-sm font-semibold flex items-center gap-2 transition-all">
            <X className="w-4 h-4" /> Xóa lọc
          </button>
          <button onClick={load} className="p-2.5 rounded-2xl bg-secondary hover:bg-secondary/80">
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap gap-6 items-center border-t border-border pt-5">
          {/* Lọc sao */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Star className="w-3 h-3" /> Theo số sao
            </label>
            <div className="flex gap-2 flex-wrap">
              <FilterChip active={!starFilter} onClick={() => setStarFilter("")}>Tất cả</FilterChip>
              {[5, 4, 3, 2, 1].map((n) => (
                <FilterChip key={n} active={starFilter === String(n)} onClick={() => setStarFilter(String(n))}>
                  {n}★
                </FilterChip>
              ))}
            </div>
          </div>

          {/* Lọc ngày */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-3 h-3" /> Khoảng ngày
            </label>
            <div className="flex items-center gap-2">
              <input type="date" value={tuNgay} onChange={e => setTuNgay(e.target.value)} className="px-3 py-1.5 rounded-xl border border-input bg-background text-xs outline-none focus:border-primary" />
              <span className="text-muted-foreground">→</span>
              <input type="date" value={denNgay} onChange={e => setDenNgay(e.target.value)} className="px-3 py-1.5 rounded-xl border border-input bg-background text-xs outline-none focus:border-primary" />
            </div>
          </div>

          {/* Sắp xếp */}
          <div className="space-y-2 ml-auto">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <ArrowUpDown className="w-3 h-3" /> Thứ tự
            </label>
            <select value={sort} onChange={e => setSort(e.target.value as SortOption)} className="px-4 py-1.5 rounded-xl border border-input bg-background text-xs font-semibold outline-none cursor-pointer">
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
              <option value="highest">Đánh giá cao nhất</option>
              <option value="lowest">Đánh giá thấp nhất</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Hiển thị số lượng kết quả */}
      <div className="text-sm text-muted-foreground px-2">
        Tìm thấy <strong className="text-foreground">{filteredAndSorted.length}</strong> phản hồi phù hợp
      </div>

      {/* Danh sách Feedback */}
      {loading ? (
        <div className="p-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="bg-card rounded-3xl p-20 text-center border border-dashed border-border">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
          <p className="text-muted-foreground italic text-sm">Không tìm thấy đánh giá nào khớp với tiêu chí lọc.</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4">
          {filteredAndSorted.map((f, i) => <FeedbackItem key={f.id} f={f} delay={i * 0.05} />)}
        </motion.div>
      )}
    </div>
  );
}

// Các sub-components giữ nguyên logic style nhưng bọc thêm font cho sang
function FilterChip({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "bg-secondary text-foreground hover:bg-secondary/80 border border-transparent"
      }`}>
      {children}
    </button>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <div className="bg-card rounded-3xl border border-border p-5 shadow-sm">
      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center mb-3 text-white shadow-inner`}>
        {icon}
      </div>
      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">{label}</div>
      <div className="text-2xl font-display font-bold text-foreground">{value}</div>
    </div>
  );
}

function FeedbackItem({ f, delay }: { f: any; delay: number }) {
  const urgent = f.danh_gia_tong <= 2;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className={`bg-card rounded-3xl border p-6 hover:shadow-md transition-all ${
        urgent ? "border-red-200 bg-red-50/10" : "border-border"
      }`}>
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-sm ${
            urgent ? "bg-red-500" : "bg-primary"
          }`}>
            {(f.ten_khach || "K").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-foreground text-lg">{f.ten_khach || "Khách vãng lai"}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-semibold text-primary/80 uppercase">{f.ten_san}</span> 
              <span>•</span>
              {formatDateTime(f.ngay_tao)}
            </div>
          </div>
          {urgent && (
            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600 uppercase tracking-tighter border border-red-200">
              <AlertTriangle className="w-3 h-3" /> Cần xử lý
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 px-3 py-1.5 bg-secondary/50 rounded-xl border border-border">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-4 h-4 ${n <= f.danh_gia_tong ? "text-amber-400 fill-amber-400" : "text-muted-foreground/20"}`} />
          ))}
        </div>
      </div>

      {f.nhan_xet && (
        <div className="relative mb-4">
          <p className="text-sm text-foreground leading-relaxed italic bg-secondary/30 rounded-2xl p-4 border border-border/50">
            "{f.nhan_xet}"
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <SubScore label="Cơ sở" value={f.danh_gia_co_so} />
        <SubScore label="Nhân viên" value={f.danh_gia_nhan_vien} />
        <SubScore label="Dịch vụ" value={f.danh_gia_dich_vu} />
      </div>
    </motion.div>
  );
}

function SubScore({ label, value }: any) {
  return (
    <span className="inline-flex items-center justify-between px-3 py-1.5 rounded-xl bg-background border border-border sm:min-w-[110px]">
      <span className="opacity-60">{label}</span>
      <span className="font-bold text-foreground text-xs flex items-center gap-0.5">
        {value} <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
      </span>
    </span>
  );
}
