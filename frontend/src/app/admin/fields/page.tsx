"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPost, apiPut, formatVND } from "@/lib/api";
import { Plus, Edit2, X, Loader2, MapPin } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  HOAT_DONG: "Hoạt động", BAO_TRI: "Bảo trì", DONG_CUA: "Đóng cửa",
};

export default function FieldsAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await apiGet("/api/fields");
      setList(r);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
            <span className="text-sm font-medium text-primary uppercase tracking-wider">Cơ sở vật chất</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Quản lý sân</h1>
          <p className="text-muted-foreground text-sm mt-1">Thêm, sửa, ngưng hoạt động các sân bóng</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="px-5 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-primary/25 transition-all">
          <Plus className="w-4 h-4" /> Thêm sân mới
        </button>
      </motion.div>

      {loading ? (
        <div className="p-16 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : list.length === 0 ? (
        <div className="bg-card rounded-3xl p-16 text-center border border-border">
          <MapPin className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium mb-4">Chưa có sân nào</p>
          <button onClick={() => setCreating(true)}
            className="px-5 py-3 bg-primary text-primary-foreground rounded-2xl text-sm font-semibold inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Thêm sân đầu tiên
          </button>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((f, idx) => (
            <div key={f.id} className="bg-card rounded-3xl border border-border overflow-hidden card-hover">
              <div className="relative aspect-[16/10]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/fields/img-${(idx % 6) + 1}.jpg`} alt={f.ten_san} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute top-3 right-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    f.trang_thai === "HOAT_DONG" ? "bg-primary text-primary-foreground" :
                    f.trang_thai === "BAO_TRI" ? "bg-accent text-accent-foreground" :
                    "bg-destructive text-destructive-foreground"
                  }`}>{STATUS_LABEL[f.trang_thai]}</span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <div className="font-display font-bold text-xl drop-shadow">{f.ten_san}</div>
                  <div className="text-xs opacity-90">
                    {f.loai_san === "SAN_5" ? "Sân 5 người" : f.loai_san === "SAN_7" ? "Sân 7 người" : "Sân 11 người"} · {f.suc_chua} người
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Giá thường</div>
                    <div className="font-bold text-foreground">{formatVND(f.gia_tieu_chuan)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Cao điểm</div>
                    <div className="font-bold text-primary">{formatVND(f.gia_cao_diem)}</div>
                  </div>
                </div>
                {f.mo_ta && <div className="text-xs text-muted-foreground mb-3 line-clamp-2">{f.mo_ta}</div>}
                <button onClick={() => setEditing(f)}
                  className="w-full py-2.5 rounded-xl border border-border hover:bg-secondary text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                  <Edit2 className="w-4 h-4" /> Chỉnh sửa
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {(editing || creating) && (
        <FieldModal field={editing} onClose={() => { setEditing(null); setCreating(false); }}
          onSuccess={() => { setEditing(null); setCreating(false); load(); }} />
      )}
    </div>
  );
}

function FieldModal({ field, onClose, onSuccess }: any) {
  const [form, setForm] = useState({
    ten_san: field?.ten_san || "",
    loai_san: field?.loai_san || "SAN_5",
    suc_chua: field?.suc_chua || 10,
    gia_tieu_chuan: field?.gia_tieu_chuan || 150000,
    gia_cao_diem: field?.gia_cao_diem || 250000,
    mo_ta: field?.mo_ta || "",
    trang_thai: field?.trang_thai || "HOAT_DONG",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!form.ten_san.trim()) { setErr("Vui lòng nhập tên sân"); return; }
    setLoading(true); setErr("");
    try {
      if (field) await apiPut(`/api/fields/${field.id}`, form);
      else await apiPost("/api/fields", form);
      onSuccess();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-3xl w-full max-w-lg my-8 shadow-2xl border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card rounded-t-3xl">
          <h3 className="text-2xl font-display font-bold">{field ? "Sửa sân" : "Thêm sân mới"}</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Input label="Tên sân *" value={form.ten_san} onChange={(v: string) => setForm({ ...form, ten_san: v })} />
          <Select label="Loại sân" value={form.loai_san} onChange={(v: string) => setForm({ ...form, loai_san: v })}
            options={[["SAN_5", "Sân 5 người"], ["SAN_7", "Sân 7 người"], ["SAN_11", "Sân 11 người"]]} />
          <Input label="Sức chứa (người)" type="number" value={form.suc_chua} onChange={(v: string) => setForm({ ...form, suc_chua: parseInt(v) || 0 })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Giá thường (VND/h)" type="number" value={form.gia_tieu_chuan}
              onChange={(v: string) => setForm({ ...form, gia_tieu_chuan: parseFloat(v) || 0 })} />
            <Input label="Giá cao điểm" type="number" value={form.gia_cao_diem}
              onChange={(v: string) => setForm({ ...form, gia_cao_diem: parseFloat(v) || 0 })} />
          </div>
          <Input label="Mô tả" value={form.mo_ta} onChange={(v: string) => setForm({ ...form, mo_ta: v })} textarea />
          <Select label="Trạng thái" value={form.trang_thai} onChange={(v: string) => setForm({ ...form, trang_thai: v })}
            options={[["HOAT_DONG", "Hoạt động"], ["BAO_TRI", "Bảo trì"], ["DONG_CUA", "Đóng cửa"]]} />

          {err && <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</div>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 py-3 rounded-2xl border border-border hover:bg-secondary font-semibold transition-colors disabled:opacity-50">Hủy</button>
            <button type="button" onClick={submit} disabled={loading}
              className="flex-1 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 disabled:opacity-50 transition-all">
              {loading ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Input({ label, value, onChange, type = "text", textarea }: any) {
  return (
    <label className="block">
      <span className="text-sm font-semibold mb-1.5 block text-foreground">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none resize-none transition-all" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all" />
      )}
    </label>
  );
}

function Select({ label, value, onChange, options }: any) {
  return (
    <label className="block">
      <span className="text-sm font-semibold mb-1.5 block text-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all">
        {options.map(([v, l]: any) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
