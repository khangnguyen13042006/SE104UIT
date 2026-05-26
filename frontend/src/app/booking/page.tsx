"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { apiGet, apiPost, formatVND, getUser } from "@/lib/api";
import { 
  AlertCircle, CheckCircle2, MapPin, Phone, User, Mail, 
  Wifi, Loader2, Clock, Users, Zap, ChevronRight,
  Star, Calendar, Sparkles
} from "lucide-react";

const START_TIMES: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    if (h === 22 && m === 30) continue;
    START_TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

const DURATIONS = [0.5, 1, 1.5, 2, 2.5, 3];

function addDuration(start: string, hours: number): string {
  const [h, m] = start.split(":").map(Number);
  const totalMin = h * 60 + m + hours * 60;
  const eh = Math.floor(totalMin / 60);
  const em = totalMin % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

type Field = {
  id: number;
  ten_san: string;
  loai_san: string;
  suc_chua: number;
  gia_tieu_chuan: number;
  gia_cao_diem: number;
  mo_ta: string | null;
  trang_thai: string;
};

type Service = {
  id: number;
  ten_dich_vu: string;
  don_gia: number;
  don_vi_tinh: string;
  ton_kho: number;
};

export default function BookingPage() {
  const router = useRouter();
  const [fields, setFields] = useState<Field[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [activeField, setActiveField] = useState<Field | null>(null);
  
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [bookedRanges, setBookedRanges] = useState<{ s: number; e: number }[]>([]);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(1);
  const [chosenSvc, setChosenSvc] = useState<Record<number, number>>({});
  const [tenKhach, setTenKhach] = useState("");
  const [sdtKhach, setSdtKhach] = useState("");
  const [emailKhach, setEmailKhach] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [memberStatus, setMemberStatus] = useState<{ tier: string; tier_name: string; discount_percent: number } | null>(null);

  const dateStr = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const d = String(selectedDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  useEffect(() => {
    Promise.all([
      apiGet("/api/fields?trang_thai=HOAT_DONG"),
      apiGet("/api/services?trang_thai=HOAT_DONG"),
    ])
      .then(([f, s]) => {
        setFields(f);
        setServices(s);
        if (f.length > 0) setActiveField(f[0]);
        else setLoadErr("Hệ thống chưa có dữ liệu sân.");
      })
      .catch((e: any) => {
        setLoadErr(e.message?.includes("Failed to fetch") ? "Không kết nối được tới backend." : `Lỗi: ${e.message}`);
      });

    const u = getUser();
    if (u) {
      apiGet("/api/memberships/me/status").then((s) => setMemberStatus({
          tier: s.tier,
          tier_name: s.tier_name,
          discount_percent: s.discount_percent,
      })).catch(() => {});
      setTenKhach(u.ho_ten || "");
      setSdtKhach(u.sdt || "");
      setEmailKhach(u.email || "");
    }
  }, []);

  useEffect(() => {
    if (!activeField) return;
    setStartTime(null);
    apiGet(`/api/fields/${activeField.id}/schedule?ngay=${dateStr}`)
      .then((r) => {
        const ranges = r.bookings.map((b: any) => {
          const [sh, sm] = b.gio_bat_dau.split(":").map(Number);
          const [eh, em] = b.gio_ket_thuc.split(":").map(Number);
          return { s: sh * 60 + sm, e: eh * 60 + em };
        });
        setBookedRanges(ranges);
      })
      .catch(() => setBookedRanges([]));
  }, [activeField, dateStr]);

  function isSlotBooked(gbd: string, gkt: string): boolean {
    const [sh, sm] = gbd.split(":").map(Number);
    const [eh, em] = gkt.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    return bookedRanges.some((b) => s < b.e && e > b.s);
  }

  function isStartAvailable(start: string, dur: number): boolean {
    const end = addDuration(start, dur);
    const [sh, sm] = start.split(":").map(Number);
    const startTotalMin = sh * 60 + sm;

    const [eh, em] = end.split(":").map(Number);
    if (eh * 60 + em > 23 * 60) return false;

    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();
  
    if (isToday) {
      const currentTotalMin = now.getHours() * 60 + now.getMinutes();
      if (startTotalMin <= currentTotalMin) return false;
    }
    return !isSlotBooked(start, end);
  }

  function setQty(svcId: number, qty: number) {
    setChosenSvc((c) => {
      const n = { ...c };
      if (qty <= 0) delete n[svcId];
      else n[svcId] = qty;
      return n;
    });
  }

  const endTime = useMemo(() => startTime ? addDuration(startTime, duration) : null, [startTime, duration]);

  const tienSan = useMemo(() => {
    if (!activeField || !startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    const peak = 17 * 60;
    let total = 0;
    if (start < peak) {
      const ne = Math.min(end, peak);
      total += ((ne - start) / 60) * activeField.gia_tieu_chuan;
    }
    if (end > peak) {
      const pb = Math.max(start, peak);
      total += ((end - pb) / 60) * activeField.gia_cao_diem;
    }
    return total;
  }, [activeField, startTime, endTime]);

  const tienDV = useMemo(() => {
    return Object.entries(chosenSvc).reduce((sum, [id, qty]) => {
      const svc = services.find((s) => s.id === parseInt(id));
      return sum + (svc ? svc.don_gia * qty : 0);
    }, 0);
  }, [chosenSvc, services]);

  const giamGia = useMemo(() => {
    if (!memberStatus || memberStatus.discount_percent === 0) return 0;
    return Math.round(tienSan * memberStatus.discount_percent / 100);
  }, [tienSan, memberStatus]);

  const tongCong = tienSan + tienDV - giamGia;

  async function submit() {
    setErr("");
    if (!activeField) { setErr("Vui lòng chọn sân"); return; }
    if (!startTime || !endTime) { setErr("Vui lòng chọn giờ bắt đầu"); return; }
    if (!tenKhach.trim()) { setErr("Vui lòng nhập họ tên"); return; }
    if (!/^0\d{9}$/.test(sdtKhach)) { setErr("SĐT phải gồm 10 số, bắt đầu bằng 0"); return; }

    setSubmitting(true);
    try {
      const res = await apiPost("/api/bookings/guest", {
        san_id: activeField.id,
        ngay_dat: dateStr,
        gio_bat_dau: startTime + ":00",
        gio_ket_thuc: endTime + ":00",
        ten_khach: tenKhach,
        sdt_khach: sdtKhach,
        email_khach: emailKhach.trim() || null,
        services: Object.entries(chosenSvc).map(([id, qty]) => ({
          dich_vu_id: parseInt(id), so_luong: qty,
        })),
      });
      router.push(`/payment/${res.id}`);
    } catch (e: any) { setErr(e.message); }
    finally { setSubmitting(false); }
  }

  if (loadErr) return <div className="p-10 text-center text-destructive">{loadErr}</div>;
  if (!activeField) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto w-8 h-8" /></div>;

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <span>Trang chủ</span><ChevronRight className="w-4 h-4" /><span>Sân bóng đá</span><ChevronRight className="w-4 h-4" /><span className="text-foreground font-medium">Đặt sân</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Đặt Sân Bóng</h1>
                <div className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium"><Zap className="w-4 h-4" /><span>Real-time</span></div>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="w-4 h-4" />TP. Hồ Chí Minh</span><span className="flex items-center gap-1"><Star className="w-4 h-4 text-accent fill-accent" />4.8/5</span></div>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={activeField.id} className="relative aspect-[16/9] rounded-3xl overflow-hidden border border-border shadow-lg">
              <img src={`/fields/img-${(fields.findIndex((f) => f.id === activeField.id) % 6) + 1}.jpg`} alt={activeField.ten_san} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <div className="font-display font-bold text-2xl mb-1 drop-shadow-lg">{activeField.ten_san}</div>
                <div className="text-sm opacity-90 drop-shadow">{activeField.loai_san === "SAN_5" ? "Sân 5 người" : "Sân 7 người"} · Sức chứa {activeField.suc_chua} người</div>
              </div>
              <div className="absolute top-3 right-3 bg-white/95 rounded-xl px-3 py-1.5 text-sm font-bold text-primary shadow-lg">{formatVND(activeField.gia_tieu_chuan)}/h</div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-3xl border border-border p-6">
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">1</span>Chọn sân</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {fields.map((f, idx) => (
                  <button key={f.id} onClick={() => setActiveField(f)} className={`rounded-2xl border-2 text-left overflow-hidden transition-all duration-200 ${activeField.id === f.id ? "border-primary shadow-lg scale-[1.02]" : "border-border hover:border-primary/30"}`}>
                    <div className="relative aspect-[4/3]"><img src={`/fields/img-${(idx % 6) + 1}.jpg`} alt={f.ten_san} className="absolute inset-0 w-full h-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" /><div className="absolute bottom-2 left-2 right-2 text-white"><div className="font-bold text-sm drop-shadow">{f.ten_san.split(" - ")[0]}</div></div></div>
                    <div className="p-3 bg-card"><div className="text-xs text-muted-foreground mb-0.5">{f.loai_san === "SAN_5" ? "5 vs 5" : "7 vs 7"}</div><div className="text-sm font-semibold text-primary">{formatVND(f.gia_tieu_chuan)}/h</div></div>
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-3xl border border-border p-6">
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">2</span>Chọn ngày & thời lượng</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> Ngày đặt sân</label>
                  <div className="flex flex-col gap-3">
                    <input type="date" value={dateStr} min={today.toISOString().split("T")[0]} onChange={(e) => setSelectedDate(new Date(e.target.value))} className="w-full sm:max-w-[220px] px-4 py-2.5 rounded-xl border-2 border-input bg-background font-semibold cursor-pointer outline-none focus:border-primary transition-all" />
                    <div className="flex flex-wrap gap-2">
                      {[0, 1, 2, 3].map((i) => {
                        const d = new Date(today); d.setDate(d.getDate() + i);
                        const isSel = d.toDateString() === selectedDate.toDateString();
                        let label = i === 0 ? "Hôm nay" : i === 1 ? "Ngày mai" : `${d.getDate()}/${d.getMonth() + 1}`;
                        return <button key={i} onClick={() => setSelectedDate(d)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isSel ? "bg-primary text-primary-foreground shadow-md" : "bg-secondary hover:bg-secondary/80 text-foreground"}`}>{label}</button>;
                      })}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> Thời lượng</label>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map((d) => (
                      <button key={d} onClick={() => setDuration(d)} className={`min-w-[4rem] px-3 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${duration === d ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-transparent bg-secondary hover:bg-secondary/80 text-foreground"}`}>{d === 0.5 ? "30p" : `${d}h`}</button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-3xl border border-border p-6">
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">3</span>
                Chọn giờ bắt đầu
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                {START_TIMES.map((t) => {
                  const available = isStartAvailable(t, duration);
                  const isSelected = startTime === t;
                  const hour = parseInt(t.split(":")[0]);
                  const isPeak = hour >= 18 && hour < 21;
                  return (
                    <button key={t} disabled={!available} onClick={() => setStartTime(t)} className={`p-3 rounded-xl text-center border-2 transition-all ${isSelected ? "bg-primary text-primary-foreground border-primary shadow-lg" : !available ? "bg-destructive/5 text-destructive/30 border-destructive/10 cursor-not-allowed" : isPeak ? "bg-amber-100 border-amber-400 text-amber-900 hover:bg-amber-200" : "bg-card border-border text-foreground hover:border-primary/30"}`}>
                      <div className="font-bold text-sm">{t}</div><div className="text-[10px] opacity-70">→ {addDuration(t, duration)}</div>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card rounded-3xl border border-border p-6">
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">4</span>Dịch vụ đi kèm</h2>
              <div className="max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid sm:grid-cols-2 gap-3">
                  {services.map((svc) => {
                    const qty = chosenSvc[svc.id] || 0;
                    return (
                      <label key={svc.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${qty > 0 ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                        <input type="checkbox" checked={qty > 0} onChange={(e) => setQty(svc.id, e.target.checked ? 1 : 0)} className="w-5 h-5 rounded-lg accent-primary" />
                        <div className="flex-1"><div className="font-medium text-foreground">{svc.ten_dich_vu}</div><div className="text-sm text-muted-foreground">{formatVND(svc.don_gia)}/{svc.don_vi_tinh}</div></div>
                        {qty > 0 && <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}><button onClick={() => setQty(svc.id, qty - 1)} className="w-8 h-8 rounded-lg bg-secondary font-bold">−</button><span className="w-8 text-center font-bold">{qty}</span><button onClick={() => setQty(svc.id, qty + 1)} className="w-8 h-8 rounded-lg bg-secondary font-bold">+</button></div>}
                      </label>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-card rounded-3xl border border-border p-6">
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">5</span>Thông tin liên hệ</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><User className="w-4 h-4" /> Họ tên <span className="text-destructive">*</span></label><input value={tenKhach} onChange={(e) => setTenKhach(e.target.value)} placeholder="Nguyễn Văn A" className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all" /></div>
                <div><label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Phone className="w-4 h-4" /> Số điện thoại <span className="text-destructive">*</span></label><input value={sdtKhach} onChange={(e) => setSdtKhach(e.target.value)} placeholder="0901234567" maxLength={10} className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all" /></div>
                <div className="sm:col-span-2"><label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Mail className="w-4 h-4" /> Email <span className="text-muted-foreground font-normal">(tùy chọn)</span></label><input value={emailKhach} onChange={(e) => setEmailKhach(e.target.value)} placeholder="ban@email.com" type="email" className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all" /></div>
              </div>
            </motion.div>
          </div>

         {/* Sidebar - Tóm tắt và Tính tiền */}
          <div className="lg:col-span-1">
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="sticky top-24 bg-card rounded-3xl border border-border p-6 shadow-xl">
              <h3 className="text-lg font-display font-bold text-foreground mb-4">Tóm tắt đơn đặt</h3>
              <div className="p-4 rounded-2xl bg-secondary/50 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">⚽</span>
                  <div>
                    <div className="font-bold text-foreground">{activeField.ten_san}</div>
                    <div className="text-sm text-muted-foreground">{activeField.loai_san === "SAN_5" ? "Sân 5 người" : "Sân 7 người"}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground flex items-center gap-2"><Calendar className="w-4 h-4" /> Ngày</span><span className="font-medium text-foreground">{selectedDate.toLocaleDateString("vi-VN")}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" /> Thời gian</span><span className="font-medium text-foreground">{startTime ? `${startTime} - ${endTime}` : "Chưa chọn"}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground flex items-center gap-2"><Users className="w-4 h-4" /> Thời lượng</span><span className="font-medium text-foreground">{duration === 0.5 ? "30 phút" : `${duration} giờ`}</span></div>
              </div>

              {memberStatus && memberStatus.discount_percent > 0 && (
                <div className="border-t border-border pt-4 mb-4">
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
                    <Sparkles className="w-4 h-4 text-primary" /><div className="flex-1 text-xs"><div className="font-semibold">Thẻ {memberStatus.tier_name}</div><div className="text-muted-foreground">Giảm {memberStatus.discount_percent}% tiền sân</div></div>
                  </div>
                </div>
              )}

              <div className="border-t border-border pt-4 space-y-4">
                {/* HIỂN THỊ CHI TIẾT TIỀN SÂN */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground font-bold">Tiền sân</span>
                    {startTime && (
                      <span className="font-medium text-right italic text-[10px] text-amber-600">
                        (Cao điểm tính từ 17:00)
                      </span>
                    )}
                  </div>
                  
                  {startTime ? (
                    <div className="space-y-1 bg-secondary/30 p-2 rounded-lg mt-1 border border-border/50">
                      {(() => {
                        const [sh, sm] = startTime.split(":").map(Number);
                        const [eh, em] = endTime!.split(":").map(Number);
                        const start = sh * 60 + sm;
                        const end = eh * 60 + em;
                        const peakLimit = 17 * 60;

                        let normalHours = 0;
                        let peakHours = 0;

                        if (start < peakLimit) normalHours = (Math.min(end, peakLimit) - start) / 60;
                        if (end > peakLimit) peakHours = (end - Math.max(start, peakLimit)) / 60;

                        return (
                          <>
                            {normalHours > 0 && (
                              <div className="flex justify-between text-[11px]">
                                <span>Giờ thường: {formatVND(activeField.gia_tieu_chuan)} x {normalHours}h</span>
                                <span>{formatVND(normalHours * activeField.gia_tieu_chuan)}</span>
                              </div>
                            )}
                            {peakHours > 0 && (
                              <div className="flex justify-between text-[11px] text-amber-700 font-medium">
                                <span>Giờ cao điểm: {formatVND(activeField.gia_cao_diem)} x {peakHours}h</span>
                                <span>{formatVND(peakHours * activeField.gia_cao_diem)}</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <div className="text-right text-xs font-bold pt-1 border-t border-border/50">
                        Cộng: {formatVND(tienSan)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs italic text-muted-foreground p-2">Vui lòng chọn giờ để thấy chi tiết giá</div>
                  )}
                </div>

                {/* HIỂN THỊ CHI TIẾT DỊCH VỤ */}
                {Object.entries(chosenSvc).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Dịch vụ đã chọn</span>
                    <div className="bg-secondary/30 p-2 rounded-lg border border-border/50 space-y-2">
                      {Object.entries(chosenSvc).map(([id, qty]) => {
                        const s = services.find((x) => x.id === parseInt(id));
                        if (!s) return null;
                        return (
                          <div key={id} className="flex flex-col gap-0.5 border-l-2 border-primary/20 pl-3">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-medium text-foreground">{s.ten_dich_vu}</span>
                              <span>{formatVND(s.don_gia)} x {qty}</span>
                            </div>
                            <div className="text-right text-[11px] font-bold">{formatVND(s.don_gia * qty)}</div>
                          </div>
                        );
                      })}
                      <div className="text-right text-xs font-bold pt-1 border-t border-border/50">
                        Cộng: {formatVND(tienDV)}
                      </div>
                    </div>
                  </div>
                )}

                {giamGia > 0 && <div className="flex items-center justify-between text-sm pt-2"><span className="text-primary flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Giảm giá thẻ</span><span className="font-semibold text-primary">−{formatVND(giamGia)}</span></div>}
                
                <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                  <span className="font-bold">Tổng cộng</span>
                  <span className="text-2xl font-display font-bold text-primary">{formatVND(tongCong)}</span>
                </div>
              </div>

              <AnimatePresence>{err && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</motion.div>}</AnimatePresence>

              <button onClick={submit} disabled={submitting || !startTime} className="w-full mt-6 py-4 bg-primary text-white rounded-2xl font-semibold shadow-lg hover:shadow-primary/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Xử lý...</span></> : <><CheckCircle2 className="w-5 h-5" /><span>Đặt sân ngay</span></>}
              </button>
              <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-accent/10 border border-accent/20"><Wifi className="w-5 h-5 text-accent" /><p className="text-[10px] text-muted-foreground">Hỗ trợ: Wifi, bãi đỗ xe, nước uống miễn phí.</p></div>
            </motion.div>
          </div>
