"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { Plus, Edit2, X, Loader2, Search, Users as UsersIcon } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", QUAN_LY: "Quản lý", NHAN_VIEN: "Nhân viên", KHACH_HANG: "Khách hàng",
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "bg-destructive/10 text-destructive border-destructive/20",
  QUAN_LY: "bg-chart-4/10 text-chart-4 border-chart-4/20",
  NHAN_VIEN: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  KHACH_HANG: "bg-primary/10 text-primary border-primary/20",
};

export default function UsersAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("vai_tro", filter);
      if (keyword) params.set("keyword", keyword);
      const r = await apiGet(`/api/users?${params}`);
      setList(r);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
            <span className="text-sm font-medium text-primary uppercase tracking-wider">Nhân sự</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Tài khoản</h1>
          <p className="text-muted-foreground text-sm mt-1">Quản lý nhân viên, quản lý và khách hàng</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="px-5 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-primary/25 transition-all">
          <Plus className="w-4 h-4" /> Tạo tài khoản
        </button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-3xl border border-border p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Tìm theo tên / email / SĐT..."
            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-3 rounded-2xl border border-input bg-background focus:border-primary outline-none font-medium text-sm">
          <option value="">Tất cả vai trò</option>
          <option value="ADMIN">Admin</option>
          <option value="QUAN_LY">Quản lý</option>
          <option value="NHAN_VIEN">Nhân viên</option>
          <option value="KHACH_HANG">Khách hàng</option>
        </select>
        <button onClick={load} className="px-5 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl text-sm font-semibold transition-colors">Tìm</button>
      </motion.div>

      {loading ? (
        <div className="p-16 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
      ) : list.length === 0 ? (
        <div className="bg-card rounded-3xl p-16 text-center border border-border">
          <UsersIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">Không tìm thấy tài khoản</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-3xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="text-left p-4">Họ tên</th>
                  <th className="text-left p-4">Email</th>
                  <th className="text-left p-4">SĐT</th>
                  <th className="text-center p-4">Vai trò</th>
                  <th className="text-center p-4">Trạng thái</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((u) => (
                  <tr key={u.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {u.ho_ten?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <span className="font-semibold text-foreground">{u.ho_ten}</span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground text-sm">{u.email}</td>
                    <td className="p-4 text-muted-foreground text-sm">{u.sdt}</td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex text-xs font-bold px-2.5 py-1 rounded-full border ${ROLE_COLOR[u.vai_tro]}`}>
                        {ROLE_LABEL[u.vai_tro]}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex text-xs font-bold px-2.5 py-1 rounded-full ${
                        u.trang_thai === "HOAT_DONG" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                      }`}>{u.trang_thai === "HOAT_DONG" ? "Hoạt động" : "Vô hiệu hóa"}</span>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => setEditing(u)} className="p-2 hover:bg-secondary rounded-xl transition-colors">
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

      {creating && <CreateUserModal onClose={() => setCreating(false)} onSuccess={() => { setCreating(false); load(); }} />}
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSuccess={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CreateUserModal({ onClose, onSuccess }: any) {
  const [form, setForm] = useState({
    ho_ten: "", email: "", sdt: "", mat_khau: "", vai_tro: "NHAN_VIEN",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr("");
    if (!form.ho_ten.trim()) { setErr("Họ tên không được trống"); return; }
    if (!form.email.includes("@")) { setErr("Email không hợp lệ"); return; }
    if (!/^0\d{9}$/.test(form.sdt)) { setErr("SĐT phải 10 số bắt đầu bằng 0"); return; }
    if (form.mat_khau.length < 8) { setErr("Mật khẩu tối thiểu 8 ký tự"); return; }

    setLoading(true);
    try {
      await apiPost("/api/users", form);
      onSuccess();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal onClose={onClose} title="Tạo tài khoản mới">
      <div className="space-y-3">
        <Input label="Họ tên *" value={form.ho_ten} onChange={(v: string) => setForm({ ...form, ho_ten: v })} />
        <Input label="Email *" type="email" value={form.email} onChange={(v: string) => setForm({ ...form, email: v })} />
        <Input label="SĐT *" value={form.sdt} onChange={(v: string) => setForm({ ...form, sdt: v })} />
        <Input label="Mật khẩu (≥8 ký tự, có chữ + số) *" type="password" value={form.mat_khau} onChange={(v: string) => setForm({ ...form, mat_khau: v })} />
        <label className="block">
          <span className="text-sm font-semibold mb-1.5 block">Vai trò</span>
          <select value={form.vai_tro} onChange={(e) => setForm({ ...form, vai_tro: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none">
            <option value="NHAN_VIEN">Nhân viên</option>
            <option value="QUAN_LY">Quản lý</option>
            <option value="ADMIN">Admin</option>
            <option value="KHACH_HANG">Khách hàng</option>
          </select>
        </label>
        {err && <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</div>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={loading} className="flex-1 py-3 rounded-2xl border border-border hover:bg-secondary font-semibold disabled:opacity-50">Hủy</button>
          <button type="button" onClick={submit} disabled={loading}
            className="flex-1 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 disabled:opacity-50">
            {loading ? "Đang tạo..." : "Tạo tài khoản"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSuccess }: any) {
  const [form, setForm] = useState({
    ho_ten: user.ho_ten, sdt: user.sdt,
    vai_tro: user.vai_tro, trang_thai: user.trang_thai,
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true); setErr("");
    try {
      await apiPut(`/api/users/${user.id}`, form);
      onSuccess();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal onClose={onClose} title="Sửa tài khoản">
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground p-3 rounded-xl bg-secondary">Email: <strong className="text-foreground">{user.email}</strong> (không đổi)</div>
        <Input label="Họ tên" value={form.ho_ten} onChange={(v: string) => setForm({ ...form, ho_ten: v })} />
        <Input label="SĐT" value={form.sdt} onChange={(v: string) => setForm({ ...form, sdt: v })} />
        <label className="block">
          <span className="text-sm font-semibold mb-1.5 block">Vai trò</span>
          <select value={form.vai_tro} onChange={(e) => setForm({ ...form, vai_tro: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary outline-none">
            <option value="KHACH_HANG">Khách hàng</option>
            <option value="NHAN_VIEN">Nhân viên</option>
            <option value="QUAN_LY">Quản lý</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold mb-1.5 block">Trạng thái</span>
          <select value={form.trang_thai} onChange={(e) => setForm({ ...form, trang_thai: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary outline-none">
            <option value="HOAT_DONG">Hoạt động</option>
            <option value="VO_HIEU_HOA">Vô hiệu hóa</option>
          </select>
        </label>
        {err && <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</div>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={loading} className="flex-1 py-3 rounded-2xl border border-border hover:bg-secondary font-semibold disabled:opacity-50">Hủy</button>
          <button type="button" onClick={submit} disabled={loading}
            className="flex-1 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 disabled:opacity-50">
            {loading ? "..." : "Lưu"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ onClose, title, children }: any) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-3xl w-full max-w-md my-8 shadow-2xl border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-2xl font-display font-bold">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
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
