"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, formatDate, getUser } from "@/lib/api";
import { Plus, Trash2, X, Loader2, Calendar, ClipboardList } from "lucide-react";

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

  const isStaff = user?.vai_tro === "NHAN_VIEN";
  const canManage = user && ["ADMIN", "QUAN_LY"].includes(user.vai_tro);

  async function load() {
    setLoading(true);
    try {
      const u = getUser();
      setUser(u);

      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      const end = new Date(today);
      end.setDate(today.getDate() + 30);

      const tasks: any[] = [
        apiGet(`/api/shifts?tu_ngay=${start.toISOString().slice(0,10)}&den_ngay=${end.toISOString().slice(0,10)}`),
      ];
      // Chỉ ADMIN/QUAN_LY mới có quyền list users + cần fields cho modal phân ca
      if (u && ["ADMIN", "QUAN_LY"].includes(u.vai_tro)) {
        tasks.push(apiGet("/api/users?vai_tro=NHAN_VIEN"));
        tasks.push(apiGet("/api/fields"));
      }

      const results = await Promise.all(tasks);
      setList(results[0]);
      if (results[1]) setStaff(results[1]);
      if (results[2]) setFields(results[2]);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function del(id: number) {
    if (!confirm("Xóa ca trực này?")) return;
    try {
      await apiDelete(`/api/shifts/${id}`);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Group by ngày
  const byDate: Record<string, any[]> = {};
  for (const s of list) {
    (byDate[s.ngay] = byDate[s.ngay] || []).push(s);
  }
  const sortedDates = Object.keys(byDate).sort();

  return (
    <div className="space-y-5">
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
            <Plus className="w-4 h-4" /> Phân ca
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : sortedDates.length === 0 ? (
        <div className="bg-card rounded-3xl p-16 text-center border border-border">
          <ClipboardList className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">
            {isStaff ? "Bạn chưa được phân ca trực nào" : "Chưa có ca trực nào"}
          </p>
          {isStaff && (
            <p className="text-xs text-muted-foreground mt-2">
              Vui lòng liên hệ Quản lý để được phân ca
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedDates.map((d) => {
            const dateObj = new Date(d);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isPast = dateObj < today;
            const isToday = dateObj.toDateString() === today.toDateString();

            return (
              <div key={d} className="bg-card rounded-3xl border border-border p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-primary" />
                    <span className="text-xl font-display font-bold text-foreground">{formatDate(d)}</span>
                    {isToday && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">
                        Hôm nay
                      </span>
                    )}
                    {isPast && !isToday && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Đã qua
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{byDate[d].length} ca</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {byDate[d].map((s) => (
                    <div key={s.id} className="p-4 rounded-2xl bg-secondary/50 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground">{s.ten_nhan_vien}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          <span className="inline-block px-2 py-0.5 rounded bg-background text-foreground font-medium mr-1.5">
                            {CA_LABEL[s.ca_truc] || s.ca_truc}
                          </span>
                          {s.san_phu_trach && (
                            <span>Sân: {s.san_phu_trach}</span>
                          )}
                        </div>
                        {s.ghi_chu && (
                          <div className="text-xs text-muted-foreground mt-1 italic">📝 {s.ghi_chu}</div>
                        )}
                      </div>
                      {canManage && (
                        <button onClick={() => del(s.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded-xl shrink-0">
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
          onSuccess={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}

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
        // Hiện confirm dialog
        if (confirm(`⚠️ CẢNH BÁO\n\n${e.detail.message}\n\nBạn có chắc chắn muốn phân thêm ca này không?`)) {
          // User confirm → retry với force=true
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
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-2xl font-display font-bold">Phân ca</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-sm font-semibold mb-1.5 block">Nhân viên</span>
            <select value={form.nhan_vien_id} onChange={(e) => setForm({ ...form, nhan_vien_id: parseInt(e.target.value) })}
              className="w-full px-3 py-2.5 rounded-xl border border-input outline-none bg-background focus:border-primary">
              {staff.map((s: any) => <option key={s.id} value={s.id}>{s.ho_ten}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold mb-1.5 block">Ngày</span>
              <input type="date" value={form.ngay} min={new Date(Date.now()+86400000).toISOString().slice(0,10)}
                onChange={(e) => setForm({ ...form, ngay: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-input outline-none focus:border-primary" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold mb-1.5 block">Ca</span>
              <select value={form.ca_truc} onChange={(e) => setForm({ ...form, ca_truc: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-input outline-none bg-background focus:border-primary">
                <option value="SANG">Sáng (6h - 14h)</option>
                <option value="CHIEU">Chiều (14h - 22h)</option>
              </select>
            </label>
          </div>
          <div>
            <span className="text-sm font-semibold mb-2 block">Sân phụ trách</span>
            <div className="grid grid-cols-2 gap-2">
              {fields.map((f: any) => (
                <button key={f.id} type="button" onClick={() => toggleField(f.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border-2 transition-colors ${
                    form.san_phu_trach.includes(f.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-input hover:border-primary/40"
                  }`}>
                  {f.ten_san}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-semibold mb-1.5 block">Ghi chú</span>
            <textarea value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-input outline-none resize-none focus:border-primary" />
          </label>

          {err && <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</div>}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border hover:bg-secondary font-semibold">Hủy</button>
            <button onClick={submit} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold disabled:opacity-50">
              {loading ? "..." : "Tạo ca"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
