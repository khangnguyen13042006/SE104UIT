"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, formatDate, getUser } from "@/lib/api";
import { Plus, Trash2, X, Loader2, Calendar, ClipboardList, Filter } from "lucide-react";

const CA_LABEL: Record<string, string> = {
  SANG: "Sáng (6h - 14h)",
  CHIEU: "Chiều (14h - 22h)",
};

export default function ShiftsAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [user, setUser] = useState<any>(null);

  // States cho Bộ lọc
  const [filterNv, setFilterNv] = useState<string>("");
  const [filterTuNgay, setFilterTuNgay] = useState<string>("");
  const [filterDenNgay, setFilterDenNgay] = useState<string>("");

  const isStaff = user?.vai_tro === "NHAN_VIEN";
  const canManage = user && ["ADMIN", "QUAN_LY"].includes(user.vai_tro);

  // Khởi tạo dữ liệu nền (Nhân viên, Sân bóng)
  useEffect(() => {
    async function init() {
      const u = getUser();
      setUser(u);
      if (u && ["ADMIN", "QUAN_LY"].includes(u.vai_tro)) {
        try {
          const [sData, fData] = await Promise.all([
            apiGet("/api/users?vai_tro=NHAN_VIEN"),
            apiGet("/api/fields")
          ]);
          setStaff(Array.isArray(sData) ? sData : []);
          setFields(Array.isArray(fData) ? fData : []);
        } catch (e) {
          console.error("Lỗi tải dữ liệu nền", e);
        }
      }
    }
    init();
    loadShifts(); // Tải ca trực lần đầu
  }, []);

  // Hàm tải ca trực dựa trên bộ lọc
  async function loadShifts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Nếu không có filterTuNgay/filterDenNgay, API sẽ tự động trả về TẤT CẢ
      if (filterTuNgay) params.set("tu_ngay", filterTuNgay);
      if (filterDenNgay) params.set("den_ngay", filterDenNgay);
      if (filterNv) params.set("nhan_vien_id", filterNv);

      const data = await apiGet(`/api/shifts?${params.toString()}`);
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function del(id: number) {
    if (!confirm("Xóa ca trực này?")) return;
    try {
      await apiDelete(`/api/shifts/${id}`);
      loadShifts();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Group dữ liệu theo ngày
  const byDate: Record<string, any[]> = {};
  for (const s of list) {
    (byDate[s.ngay] = byDate[s.ngay] || []).push(s);
  }
  // Sắp xếp ngày mới nhất lên đầu (hoặc bạn có thể dùng .sort() để xếp tăng dần)
  const sortedDates = Object.keys(byDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold tracking-[0.25em] text-primary mb-2">
            {isStaff ? "LỊCH LÀM VIỆC" : "VẬN HÀNH"}
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">
            {isStaff ? "Ca trực của tôi" : "Phân ca nhân viên"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isStaff
              ? "Xem các ca trực được phân công"
              : "Quản lý lịch trực và phân công nhân viên"}
          </p>
        </div>
        {canManage && (
          <button onClick={() => setCreating(true)}
            className="px-5 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-primary/25 transition-all">
            <Plus className="w-4 h-4" /> Phân ca mới
          </button>
        )}
      </div>

      {/* ==== THANH BỘ LỌC ==== */}
      <div className="flex flex-wrap gap-3 bg-card p-4 rounded-3xl border border-border shadow-sm">
        {canManage && (
          <select 
            value={filterNv} 
            onChange={e => setFilterNv(e.target.value)} 
            className="px-4 py-2.5 rounded-xl border border-input bg-background font-bold text-sm outline-none cursor-pointer hover:bg-secondary transition-colors flex-1 min-w-[200px]"
          >
            <option value="">Tất cả nhân viên</option>
            {staff.map((s: any) => (
              <option key={s.id} value={s.id}>{s.ho_ten}</option>
            ))}
          </select>
        )}
        
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <input 
            type="date" 
            value={filterTuNgay} 
            onChange={e => setFilterTuNgay(e.target.value)} 
            className="w-full px-4 py-2.5 rounded-xl border border-input bg-background font-medium outline-none focus:border-primary transition-colors text-sm"
            title="Từ ngày"
          />
          <span className="text-muted-foreground font-bold">-</span>
          <input 
            type="date" 
            value={filterDenNgay} 
            onChange={e => setFilterDenNgay(e.target.value)} 
            className="w-full px-4 py-2.5 rounded-xl border border-input bg-background font-medium outline-none focus:border-primary transition-colors text-sm"
            title="Đến ngày"
          />
        </div>

        <button 
          onClick={loadShifts} 
          className="px-6 py-2.5 bg-secondary text-foreground font-bold rounded-xl hover:bg-secondary/80 transition-all flex items-center gap-2"
        >
          <Filter className="w-4 h-4" /> Lọc ca trực
        </button>
      </div>

      {/* ==== DANH SÁCH CA TRỰC ==== */}
      {loading ? (
        <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : sortedDates.length === 0 ? (
        <div className="bg-card rounded-3xl p-16 text-center border border-border">
          <ClipboardList className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">
            Không tìm thấy ca trực nào phù hợp với điều kiện lọc
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((d) => {
            const dateObj = new Date(d);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isPast = dateObj < today;
            const isToday = dateObj.toDateString() === today.toDateString();

            return (
              <div key={d} className="bg-card rounded-3xl border border-border p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2 border-b border-border pb-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-primary" />
                    <span className="text-xl font-display font-bold text-foreground">{formatDate(d)}</span>
                    {isToday && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold shadow-sm">
                        Hôm nay
                      </span>
                    )}
                    {isPast && !isToday && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium border border-border">
                        Đã qua
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{byDate[d].length} ca</span>
                </div>
                <div className="grid lg:grid-cols-2 gap-3">
                  {byDate[d].map((s) => (
                    <div key={s.id} className="p-4 rounded-2xl bg-secondary/30 flex items-center justify-between gap-3 border border-transparent hover:border-border hover:bg-secondary/50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-foreground text-sm mb-1.5 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          {s.ten_nhan_vien}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="inline-block px-2 py-1 rounded-lg bg-background border border-border text-foreground font-bold mr-2 shadow-sm">
                            {CA_LABEL[s.ca_truc] || s.ca_truc}
                          </span>
                          {s.san_phu_trach && (
                            <span className="italic font-medium">Sân phụ trách: {s.san_phu_trach}</span>
                          )}
                        </div>
                        {s.ghi_chu && (
                          <div className="text-xs text-muted-foreground mt-2 italic bg-background/50 p-2 rounded-lg border border-border border-dashed">
                            📝 Ghi chú: {s.ghi_chu}
                          </div>
                        )}
                      </div>
                      {canManage && (
                        <button onClick={() => del(s.id)} className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl shrink-0 transition-all" title="Xóa ca">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && canManage && (
        <CreateShiftModal staff={staff} fields={fields}
          onClose={() => setCreating(false)}
          onSuccess={() => { setCreating(false); loadShifts(); }} />
      )}
    </div>
  );
}

// Giữ nguyên Modal Tạo Ca
function CreateShiftModal({ staff, fields, onClose, onSuccess }: any) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [form, setForm] = useState({
    nhan_vien_id: staff[0]?.id || 0,
    ngay: tomorrow.toISOString().slice(0, 10),
    ca_truc: "SANG",
    san_phu_trach: [] as number[],
    ghi_chu: "",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleField(id: number) {
    setForm((f) => ({
      ...f,
      san_phu_trach: f.san_phu_trach.includes(id)
        ? f.san_phu_trach.filter((x) => x !== id)
        : [...f.san_phu_trach, id],
    }));
  }

  async function submit() {
    setLoading(true);
    setErr("");
    try {
      await apiPost("/api/shifts", form);
      onSuccess();
    } catch (e: any) {
      if (e.status === 409 && e.detail?.code === "SHIFT_OVERLAP_DAY") {
        if (confirm(`⚠️ CẢNH BÁO\n\n${e.detail.message}\n\nBạn có chắc chắn muốn phân thêm ca này không?`)) {
          try {
            await apiPost("/api/shifts", { ...form, force: true });
            onSuccess();
          } catch (e2: any) {
            setErr(e2.message);
          }
        }
      } else {
        setErr(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl border border-border">
        <div className="flex items-center justify-between p-6 border-b border-border bg-secondary/30">
          <h3 className="text-2xl font-black uppercase tracking-tight text-primary">Phân Ca Trực</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <label className="block">
            <span className="text-sm font-bold mb-2 block uppercase text-muted-foreground tracking-widest">Nhân viên</span>
            <select value={form.nhan_vien_id} onChange={(e) => setForm({ ...form, nhan_vien_id: parseInt(e.target.value) })}
              className="w-full px-4 py-3 rounded-xl border border-input outline-none bg-background focus:border-primary font-medium">
              {staff.map((s: any) => <option key={s.id} value={s.id}>{s.ho_ten}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-bold mb-2 block uppercase text-muted-foreground tracking-widest">Ngày</span>
              <input type="date" value={form.ngay} min={new Date(Date.now()+86400000).toISOString().slice(0,10)}
                onChange={(e) => setForm({ ...form, ngay: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-input outline-none focus:border-primary font-medium" />
            </label>
            <label className="block">
              <span className="text-sm font-bold mb-2 block uppercase text-muted-foreground tracking-widest">Ca</span>
              <select value={form.ca_truc} onChange={(e) => setForm({ ...form, ca_truc: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-input outline-none bg-background focus:border-primary font-medium">
                <option value="SANG">Sáng (6h - 14h)</option>
                <option value="CHIEU">Chiều (14h - 22h)</option>
              </select>
            </label>
          </div>
          <div>
            <span className="text-sm font-bold mb-3 block uppercase text-muted-foreground tracking-widest">Sân phụ trách</span>
            <div className="grid grid-cols-2 gap-2">
              {fields.map((f: any) => (
                <button key={f.id} type="button" onClick={() => toggleField(f.id)}
                  className={`px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider border-2 transition-all shadow-sm ${
                    form.san_phu_trach.includes(f.id)
                      ? "bg-primary text-primary-foreground border-primary scale-[0.98]"
                      : "bg-background border-input hover:border-primary hover:text-primary"
                  }`}>
                  {f.ten_san}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-bold mb-2 block uppercase text-muted-foreground tracking-widest">Ghi chú</span>
            <textarea value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} rows={2}
              className="w-full px-4 py-3 rounded-xl border border-input outline-none resize-none focus:border-primary bg-secondary/20" />
          </label>

          {err && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-bold italic">{err}</div>}

          <div className="flex gap-3 pt-4 border-t border-border mt-4">
            <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl border border-border hover:bg-secondary font-bold uppercase tracking-widest transition-all">Hủy</button>
            <button onClick={submit} disabled={loading} className="flex-1 py-3.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest shadow-lg shadow-primary/30 disabled:opacity-50 transition-all active:scale-95">
              {loading ? "Đang lưu..." : "Xác nhận tạo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
