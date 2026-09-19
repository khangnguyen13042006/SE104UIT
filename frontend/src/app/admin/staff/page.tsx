"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPost, apiPut, apiDelete, getUser, formatVND } from "@/lib/api";
import {
  Loader2, UserCog, Phone, Mail, Eye, EyeOff, CalendarCheck2,
  History, X, MapPin, Clock, Wallet, TrendingUp, Pencil, Check, Trash2, BadgeCheck,
} from "lucide-react";

const CA_LABEL: Record<string, string> = {
  SANG: "Sáng (6h - 14h)",
  CHIEU: "Chiều (14h - 22h)",
};

const WORK_STATUS: Record<string, { label: string; cls: string }> = {
  DANG_LAM: { label: "Đang làm việc", cls: "bg-primary/10 text-primary" },
  TAM_NGHI: { label: "Tạm nghỉ", cls: "bg-amber-500/10 text-amber-600" },
  DA_NGHI: { label: "Đã nghỉ hẳn", cls: "bg-destructive/10 text-destructive" },
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function StaffAdmin() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [thang, setThang] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [historyTarget, setHistoryTarget] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [salaryTarget, setSalaryTarget] = useState<any>(null);
  const [salaryHistory, setSalaryHistory] = useState<any>(null);

  async function openSalaryHistory(u: any) {
    setSalaryTarget(u);
    setSalaryHistory(null);
    try {
      setSalaryHistory(await apiGet(`/api/staff/${u.id}/history`));
    } catch (e: any) {
      alert(e.message || "Không tải được lịch sử lương");
      setSalaryTarget(null);
    }
  }

  useEffect(() => {
    setIsAdmin(getUser()?.vai_tro === "ADMIN");
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [salary, allShifts, allFields] = await Promise.all([
        apiGet(`/api/staff/salary?thang=${thang}`),
        apiGet("/api/shifts"),
        apiGet("/api/fields"),
      ]);
      setStaffList(salary.nhan_vien);
      setShifts(allShifts);
      setFields(allFields);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [thang]);

  const shiftsByStaff = useMemo(() => {
    const map: Record<number, any[]> = {};
    for (const s of shifts) {
      if (!map[s.nhan_vien_id]) map[s.nhan_vien_id] = [];
      map[s.nhan_vien_id].push(s);
    }
    for (const id in map) {
      map[id].sort((a, b) => new Date(b.ngay).getTime() - new Date(a.ngay).getTime());
    }
    return map;
  }, [shifts]);

  const totals = useMemo(() => {
    const total = staffList.reduce((sum, u) => sum + u.tong_luong, 0);
    const paid = staffList.filter((u) => u.da_chuyen).reduce((sum, u) => sum + u.tong_luong, 0);
    return { total, paid, remaining: total - paid };
  }, [staffList]);

  const fieldName = (id: number) => fields.find((f) => f.id === id)?.ten_san || `Sân ${id}`;

  async function run(fn: () => Promise<any>) {
    try {
      await fn();
      await load();
    } catch (e: any) {
      alert(e.message || "Có lỗi xảy ra");
    }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
          <span className="text-sm font-medium text-primary uppercase tracking-wider">Nhân sự</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Nhân viên</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Trạng thái làm việc, lương theo ca và lịch sử phân ca
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Tháng lương
            <input
              type="month"
              value={thang}
              onChange={(e) => e.target.value && setThang(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-card text-foreground"
            />
          </label>
        </div>
      </motion.div>

      {!loading && staffList.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-3">
          <SummaryTile label="Tổng lương tháng" value={formatVND(totals.total)} />
          <SummaryTile label="Đã chuyển" value={formatVND(totals.paid)} tone="primary" />
          <SummaryTile label="Chưa chuyển" value={formatVND(totals.remaining)} tone="warn" />
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      ) : staffList.length === 0 ? (
        <div className="bg-card rounded-3xl p-16 text-center border border-border">
          <UserCog className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">Chưa có nhân viên nào</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {staffList.map((u) => (
            <StaffCard
              key={u.id}
              user={u}
              thang={thang}
              canDelete={isAdmin}
              onViewHistory={() => setHistoryTarget(u)}
              onViewSalary={() => openSalaryHistory(u)}
              onChangeStatus={(tinh_trang_lam_viec) =>
                run(() => apiPut(`/api/staff/${u.id}`, { tinh_trang_lam_viec }))
              }
              onChangeRate={(luong_ca) => run(() => apiPut(`/api/staff/${u.id}`, { luong_ca }))}
              onConfirmPaid={(da_chuyen) =>
                run(() => apiPost("/api/staff/salary/confirm", { nhan_vien_id: u.id, thang, da_chuyen }))
              }
              onDelete={() => {
                if (
                  !confirm(
                    `Xóa nhân viên "${u.ho_ten}"? Toàn bộ lịch sử phân ca và lương của nhân viên này sẽ bị xóa và không thể khôi phục.`
                  )
                )
                  return;
                run(() => apiDelete(`/api/staff/${u.id}`));
              }}
            />
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {salaryTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-card w-full max-w-lg rounded-3xl border border-border p-6 shadow-2xl max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-display font-bold text-foreground">Lịch sử lương</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{salaryTarget.ho_ten}</p>
                </div>
                <button onClick={() => setSalaryTarget(null)} className="p-2 hover:bg-secondary rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {!salaryHistory ? (
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary my-8" />
              ) : (
                <div className="space-y-5">
                  <section>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Lương theo tháng</h4>
                    {salaryHistory.thang.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Chưa có tháng nào có ca làm.</p>
                    ) : (
                      <div className="space-y-2">
                        {salaryHistory.thang.map((m: any) => (
                          <div key={m.thang} className="p-3 rounded-xl border border-border bg-secondary/30 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground">
                                Tháng {m.thang.slice(5)}/{m.thang.slice(0, 4)}
                              </div>
                              <div className="text-xs text-muted-foreground">{m.so_ca} ca</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-foreground">{formatVND(m.tong_luong)}</div>
                              <div className={`text-[11px] font-semibold ${m.da_chuyen ? "text-primary" : "text-amber-600"}`}>
                                {m.da_chuyen
                                  ? `Đã chuyển${m.ngay_chuyen ? " " + new Date(m.ngay_chuyen + "Z").toLocaleDateString("vi-VN") : ""}`
                                  : "Chưa chuyển"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  <section>
                    <h4 className="text-sm font-semibold text-foreground mb-2">
                      Lịch sử mức lương / ca{" "}
                      <span className="font-normal text-muted-foreground">(hiện tại {formatVND(salaryHistory.luong_hien_tai)})</span>
                    </h4>
                    {salaryHistory.doi_luong.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Chưa từng thay đổi mức lương (mặc định 100.000đ/ca).</p>
                    ) : (
                      <div className="space-y-2">
                        {salaryHistory.doi_luong.map((c: any, i: number) => (
                          <div key={i} className="p-3 rounded-xl border border-border bg-secondary/30">
                            <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                              <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                              {formatVND(c.luong_cu)} → {formatVND(c.luong_moi)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Đổi lúc {new Date(c.ngay_thay_doi + "Z").toLocaleString("vi-VN")} • áp dụng từ ca ngày{" "}
                              {new Date(c.ngay_ap_dung).toLocaleDateString("vi-VN")}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </motion.div>
          </div>
        )}
        {historyTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-card w-full max-w-lg rounded-3xl border border-border p-6 shadow-2xl max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-display font-bold text-foreground">Lịch sử làm việc</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{historyTarget.ho_ten}</p>
                </div>
                <button onClick={() => setHistoryTarget(null)} className="p-2 hover:bg-secondary rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {(shiftsByStaff[historyTarget.id] || []).length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-8 text-center">Chưa từng được phân ca nào.</p>
              ) : (
                <div className="space-y-2">
                  {(shiftsByStaff[historyTarget.id] || []).map((s) => (
                    <div key={s.id} className="p-3 rounded-xl border border-border bg-secondary/30 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          {new Date(s.ngay).toLocaleDateString("vi-VN")} — {CA_LABEL[s.ca_truc] || s.ca_truc}
                        </div>
                        {s.san_phu_trach && (
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                            <MapPin className="w-3 h-3" />
                            {s.san_phu_trach
                              .split(",")
                              .filter(Boolean)
                              .map((id: string) => fieldName(parseInt(id)))
                              .join(", ")}
                          </div>
                        )}
                        {s.ghi_chu && <div className="text-xs text-muted-foreground mt-1 italic">{s.ghi_chu}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "primary" | "warn" }) {
  const color = tone === "primary" ? "text-primary" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-display font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function StaffCard({
  user, thang, canDelete, onViewHistory, onViewSalary, onChangeStatus, onChangeRate, onConfirmPaid, onDelete,
}: {
  user: any;
  thang: string;
  canDelete: boolean;
  onViewHistory: () => void;
  onViewSalary: () => void;
  onChangeStatus: (s: string) => void;
  onChangeRate: (n: number) => void;
  onConfirmPaid: (paid: boolean) => void;
  onDelete: () => void;
}) {
  const [showContact, setShowContact] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState(String(user.luong_ca));
  const status = WORK_STATUS[user.tinh_trang_lam_viec] || WORK_STATUS.DANG_LAM;

  function saveRate() {
    const n = parseInt(rateInput.replace(/\D/g, ""), 10);
    if (isNaN(n) || n < 0) return alert("Mức lương không hợp lệ");
    setEditingRate(false);
    if (n !== user.luong_ca) onChangeRate(n);
  }

  return (
    <div className="bg-card rounded-3xl border border-border p-5 hover:shadow-md transition">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold shrink-0">
          {user.ho_ten?.charAt(0)?.toUpperCase() || "N"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground truncate">{user.ho_ten}</div>
          <button
            onClick={() => setShowContact((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {showContact ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showContact ? "Ẩn liên hệ" : "Xem liên hệ"}
          </button>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${status.cls}`}>{status.label}</span>
      </div>

      {showContact && (
        <div className="mb-4 p-3 rounded-xl bg-secondary/40 space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-foreground">
            <Phone className="w-3.5 h-3.5 text-muted-foreground" /> {user.sdt || "—"}
          </div>
          <div className="flex items-center gap-1.5 text-foreground">
            <Mail className="w-3.5 h-3.5 text-muted-foreground" /> {user.email || "—"}
          </div>
        </div>
      )}

      {/* Tình trạng làm việc */}
      <div className="mb-4 grid grid-cols-3 gap-1 p-1 rounded-xl bg-secondary/50">
        {Object.entries(WORK_STATUS).map(([key, v]) => (
          <button
            key={key}
            onClick={() => key !== user.tinh_trang_lam_viec && onChangeStatus(key)}
            className={`text-[11px] font-semibold py-1.5 rounded-lg transition ${
              key === user.tinh_trang_lam_viec
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Lương */}
      <div className="p-3 rounded-2xl border border-border space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="w-4 h-4" /> Lương / ca
          </span>
          {editingRate ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRate()}
                inputMode="numeric"
                className="w-24 px-2 py-1 rounded-lg border border-border bg-background text-right text-sm"
              />
              <button onClick={saveRate} className="p-1 rounded-lg text-primary hover:bg-primary/10">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setEditingRate(false)} className="p-1 rounded-lg text-muted-foreground hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </span>
          ) : (
            <button
              onClick={() => {
                setRateInput(String(user.luong_ca));
                setEditingRate(true);
              }}
              className="flex items-center gap-1.5 font-semibold text-foreground hover:text-primary"
              title="Chỉ áp dụng cho các ca sau hôm nay"
            >
              {formatVND(user.luong_ca)} <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Tháng {thang.slice(5)}/{thang.slice(0, 4)}: {user.so_ca_thang} ca đã làm
            {user.so_ca_sap_toi > 0 && ` (+${user.so_ca_sap_toi} sắp tới)`}
          </span>
          <strong className="text-foreground">{formatVND(user.tong_luong)}</strong>
        </div>
        <button onClick={onViewSalary} className="w-full text-xs font-semibold text-primary hover:underline text-left">
          Xem lịch sử lương &amp; mức lương
        </button>
        {user.da_chuyen ? (
          <button
            onClick={() => confirm("Bỏ xác nhận đã chuyển lương tháng này?") && onConfirmPaid(false)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold"
          >
            <BadgeCheck className="w-4 h-4" /> Đã chuyển
            {user.ngay_chuyen && ` (${new Date(user.ngay_chuyen + "Z").toLocaleDateString("vi-VN")})`}
          </button>
        ) : (
          <button
            disabled={user.tong_luong === 0}
            onClick={() =>
              confirm(`Xác nhận đã chuyển ${formatVND(user.tong_luong)} cho ${user.ho_ten}?`) && onConfirmPaid(true)
            }
            className="w-full py-2 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-40"
          >
            Xác nhận đã chuyển lương
          </button>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 mt-4 border-t border-border">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarCheck2 className="w-4 h-4" />
          <span>
            Tổng ca: <strong className="text-foreground">{user.tong_so_ca}</strong>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onViewHistory}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <History className="w-3.5 h-3.5" /> Lịch sử
          </button>
          {canDelete && (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" /> Xóa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
