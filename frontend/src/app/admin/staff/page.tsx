"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet } from "@/lib/api";
import {
  Loader2, UserCog, Phone, Mail, Eye, EyeOff, CalendarCheck2,
  History, X, MapPin, Clock,
} from "lucide-react";

const CA_LABEL: Record<string, string> = {
  SANG: "Sáng (6h - 14h)",
  CHIEU: "Chiều (14h - 22h)",
};

export default function StaffAdmin() {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyTarget, setHistoryTarget] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const [users, allShifts, allFields] = await Promise.all([
        apiGet("/api/users?vai_tro=NHAN_VIEN"),
        apiGet("/api/shifts"),
        apiGet("/api/fields"),
      ]);
      setStaffList(users);
      setShifts(allShifts);
      setFields(allFields);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

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

  const fieldName = (id: number) => fields.find((f) => f.id === id)?.ten_san || `Sân ${id}`;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-3 h-3 bg-primary rounded-full pulse-dot" />
          <span className="text-sm font-medium text-primary uppercase tracking-wider">Nhân sự</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Nhân viên</h1>
        <p className="text-muted-foreground text-sm mt-1">Danh sách nhân viên, trạng thái làm việc và lịch sử phân ca</p>
      </motion.div>

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
              shiftCount={(shiftsByStaff[u.id] || []).length}
              onViewHistory={() => setHistoryTarget(u)}
            />
          ))}
        </motion.div>
      )}

      <AnimatePresence>
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

function StaffCard({ user, shiftCount, onViewHistory }: { user: any; shiftCount: number; onViewHistory: () => void }) {
  const [showContact, setShowContact] = useState(false);
  const isActive = user.trang_thai === "HOAT_DONG";

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
        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
            isActive ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          }`}
        >
          {isActive ? "Đang làm việc" : "Đã nghỉ"}
        </span>
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

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarCheck2 className="w-4 h-4" />
          <span>
            Số ca làm: <strong className="text-foreground">{shiftCount}</strong>
          </span>
        </div>
        <button
          onClick={onViewHistory}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <History className="w-3.5 h-3.5" /> Lịch sử
        </button>
      </div>
    </div>
  );
}
