"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPost, apiPut, formatVND } from "@/lib/api";
import { Plus, Edit2, X, Loader2, Recycle, Package } from "lucide-react";

export default function ServicesAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try { setList(await apiGet("/api/services")); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
            <span className="text-sm font-medium text-primary uppercase tracking-wider">Sản phẩm</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Dịch vụ</h1>
          <p className="text-muted-foreground text-sm mt-1">Đồ thuê sẽ tự restock khi booking hoàn thành</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="px-5 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-primary/25 transition-all">
          <Plus className="w-4 h-4" /> Thêm dịch vụ
        </button>
      </motion.div>

      {loading ? (
        <div className="p-16 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : list.length === 0 ? (
        <div className="bg-card rounded-3xl p-16 text-center border border-border">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium mb-4">Chưa có dịch vụ nào</p>
          <button onClick={() => setCreating(true)}
            className="px-5 py-3 bg-primary text-primary-foreground rounded-2xl text-sm font-semibold inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Thêm dịch vụ đầu tiên
          </button>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-3xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-4">Tên dịch vụ</th>
                  <th className="text-center p-4">Loại</th>
                  <th className="text-right p-4">Đơn giá</th>
                  <th className="text-center p-4">Đơn vị</th>
                  <th className="text-right p-4">Tồn kho</th>
                  <th className="text-center p-4">Trạng thái</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((s) => (
                  <tr key={s.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="p-4 font-semibold text-foreground">{s.ten_dich_vu}</td>
                    <td className="p-4 text-center">
                      {s.la_cho_thue ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-chart-3/10 text-chart-3 border border-chart-3/20">
                          <Recycle className="w-3 h-3" /> Đồ thuê
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Tiêu hao</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-semibold text-foreground">{formatVND(s.don_gia)}</td>
                    <td className="p-4 text-center text-muted-foreground">{s.don_vi_tinh}</td>
                    <td className={`p-4 text-right font-bold ${s.ton_kho < 5 ? "text-destructive" : "text-foreground"}`}>{s.ton_kho}</td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex text-xs font-bold px-2 py-1 rounded-full ${
                        s.trang_thai === "HOAT_DONG" ? "bg-primary/10 text-primary border border-primary/20" : "bg-muted text-muted-foreground"
                      }`}>{s.trang_thai === "HOAT_DONG" ? "Hoạt động" : "Ngừng KD"}</span>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => setEditing(s)} className="p-2 hover:bg-secondary rounded-xl transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {(editing || creating) && (
        <ServiceModal svc={editing} onClose={() => { setEditing(null); setCreating(false); }}
          onSuccess={() => { setEditing(null); setCreating(false); load(); }} />
      )}
    </div>
  );
}

function ServiceModal({ svc, onClose, onSuccess }: any) {
  const [form, setForm] = useState({
    ten_dich_vu: svc?.ten_dich_vu || "",
    don_gia: svc?.don_gia || 10000,
    don_vi_tinh: svc?.don_vi_tinh || "Cái",
    ton_kho: svc?.ton_kho || 10,
    la_cho_thue: svc?.la_cho_thue ?? false,
    trang_thai: svc?.trang_thai || "HOAT_DONG",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!form.ten_dich_vu.trim()) { setErr("Vui lòng nhập tên dịch vụ"); return; }
    setLoading(true); setErr("");
    try {
      if (svc) await apiPut(`/api/services/${svc.id}`, form);
      else await apiPost("/api/services", form);
      onSuccess();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-3xl w-full max-w-md my-8 shadow-2xl border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-2xl font-display font-bold">{svc ? "Sửa dịch vụ" : "Thêm dịch vụ"}</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Input label="Tên dịch vụ *" value={form.ten_dich_vu} onChange={(v: string) => setForm({ ...form, ten_dich_vu: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Đơn giá" type="number" value={form.don_gia} onChange={(v: string) => setForm({ ...form, don_gia: parseFloat(v) || 0 })} />
            <Input label="Đơn vị" value={form.don_vi_tinh} onChange={(v: string) => setForm({ ...form, don_vi_tinh: v })} />
          </div>
          <Input label="Tồn kho" type="number" value={form.ton_kho} onChange={(v: string) => setForm({ ...form, ton_kho: parseInt(v) || 0 })} />

          <label className="flex items-start gap-3 p-4 rounded-xl border border-border cursor-pointer hover:bg-secondary/50 transition-colors">
            <input type="checkbox" checked={form.la_cho_thue}
              onChange={(e) => setForm({ ...form, la_cho_thue: e.target.checked })}
              className="w-4 h-4 mt-0.5 accent-primary" />
            <div className="flex-1">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Recycle className="w-4 h-4 text-chart-3" /> Đây là đồ cho thuê (auto-restock)
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                VD: Giày, áo tập. Khi booking hoàn thành, tồn kho tự cộng lại.
              </div>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-semibold mb-1.5 block">Trạng thái</span>
            <select value={form.trang_thai} onChange={(e) => setForm({ ...form, trang_thai: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none">
              <option value="HOAT_DONG">Hoạt động</option>
              <option value="NGUNG_KINH_DOANH">Ngừng kinh doanh</option>
            </select>
          </label>

          {err && <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</div>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 py-3 rounded-2xl border border-border hover:bg-secondary font-semibold disabled:opacity-50">Hủy</button>
            <button type="button" onClick={submit} disabled={loading}
              className="flex-1 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 disabled:opacity-50">
              {loading ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Input({ label, value, onChange, type = "text" }: any) {
  return (
    <label className="block">
      <span className="text-sm font-semibold mb-1.5 block">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all" />
    </label>
  );
}
