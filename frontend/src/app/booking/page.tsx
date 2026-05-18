"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { apiGet, apiPost, formatVND, getUser } from "@/lib/api";
import { 
  AlertCircle, CheckCircle2, MapPin, Phone, User, Mail, 
  Wifi, Car, Coffee, Loader2, Clock, Users, Zap, ChevronRight,
  Star, Calendar, Sparkles
} from "lucide-react";

// Giờ bắt đầu: mỗi 30 phút từ 6:00 đến 22:00
const START_TIMES: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    if (h === 22 && m === 30) continue;
    START_TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

const DURATIONS = [0.5, 1, 1.5, 2, 2.5, 3];
const DAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

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
  const [dateOffset, setDateOffset] = useState(0);
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

  const targetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dateOffset);
    return d;
  }, [dateOffset]);
  const dateStr = targetDate.toISOString().slice(0, 10);

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
        setLoadErr(
          e.message?.includes("Failed to fetch")
            ? "Không kết nối được tới backend."
            : `Lỗi: ${e.message}`
        );
      });

    // Load membership tier nếu user đã login để áp giảm giá tự động
    const u = getUser();
    if (u) {
      apiGet("/api/memberships/me/status")
        .then((s) => setMemberStatus({
          tier: s.tier,
          tier_name: s.tier_name,
          discount_percent: s.discount_percent,
        }))
        .catch(() => {});

      // Auto-fill thông tin liên hệ từ user đã login
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
    const [eh] = end.split(":").map(Number);
    const endMin = eh * 60 + parseInt(end.split(":")[1]);
    if (endMin > 23 * 60) return false;
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

  // Giảm giá membership (chỉ áp dụng cho tiền sân, không áp cho dịch vụ)
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
    if (emailKhach.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailKhach)) {
      setErr("Email không hợp lệ");
      return;
    }

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
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadErr) {
    return (
      <>
        <Navbar />
        <div className="max-w-2xl mx-auto p-6 mt-8">
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="text-destructive shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-destructive mb-2">Không tải được dữ liệu</h3>
                <p className="text-sm text-destructive/80 mb-4">{loadErr}</p>
                <button onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-destructive text-white rounded-xl text-sm font-semibold">
                  Tải lại trang
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!activeField) {
    return (
      <>
        <Navbar />
        <div className="p-16 text-center text-muted-foreground">
          <Loader2 className="animate-spin mx-auto mb-2 w-8 h-8" />
          <p>Đang tải...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <span>Trang chủ</span>
            <ChevronRight className="w-4 h-4" />
            <span>Sân bóng đá</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-foreground font-medium">Đặt sân</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">
                  Đặt Sân Bóng
                </h1>
                <div className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  <Zap className="w-4 h-4" />
                  <span>Real-time</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  TP. Hồ Chí Minh
                </span>
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-accent fill-accent" />
                  4.8/5
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active Field Preview Image */}
            {activeField && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                key={activeField.id}
                className="relative aspect-[16/9] rounded-3xl overflow-hidden border border-border shadow-lg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/fields/img-${(fields.findIndex((f) => f.id === activeField.id) % 6) + 1}.jpg`}
                  alt={activeField.ten_san}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                  <div className="font-display font-bold text-2xl mb-1 drop-shadow-lg">{activeField.ten_san}</div>
                  <div className="text-sm opacity-90 drop-shadow">
                    {activeField.loai_san === "SAN_5" ? "Sân 5 người" : activeField.loai_san === "SAN_7" ? "Sân 7 người" : "Sân 11 người"} · Sức chứa {activeField.suc_chua} người
                  </div>
                </div>
                <div className="absolute top-3 right-3 bg-white/95 rounded-xl px-3 py-1.5 text-sm font-bold text-primary shadow-lg">
                  {formatVND(activeField.gia_tieu_chuan)}/h
                </div>
              </motion.div>
            )}

            {/* Field Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card rounded-3xl border border-border p-6"
            >
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">1</span>
                Chọn sân
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {fields.map((f, idx) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveField(f)}
                    className={`rounded-2xl border-2 text-left overflow-hidden transition-all duration-200 ${
                      activeField.id === f.id
                        ? "border-primary shadow-lg shadow-primary/20 scale-[1.02]"
                        : "border-border hover:border-primary/30 hover:scale-[1.01]"
                    }`}
                  >
                    <div className="relative aspect-[4/3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/fields/img-${(idx % 6) + 1}.jpg`}
                        alt={f.ten_san}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2 text-white">
                        <div className="font-bold text-sm drop-shadow">{f.ten_san.split(" - ")[0]}</div>
                      </div>
                    </div>
                    <div className="p-3 bg-card">
                      <div className="text-xs text-muted-foreground mb-0.5">
                        {f.loai_san === "SAN_5" ? "5 vs 5" : f.loai_san === "SAN_7" ? "7 vs 7" : "11 vs 11"}
                      </div>
                      <div className="text-sm font-semibold text-primary">
                        {formatVND(f.gia_tieu_chuan)}/h
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Date & Duration */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-3xl border border-border p-6"
            >
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">2</span>
                Chọn ngày & thời lượng
              </h2>

              {/* Day Tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() + i);
                  const isToday = i === 0;
                  return (
                    <button
                      key={i}
                      onClick={() => setDateOffset(i)}
                      className={`flex-shrink-0 px-4 py-3 rounded-2xl text-center transition-all ${
                        dateOffset === i
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                          : "bg-secondary hover:bg-secondary/80 text-foreground"
                      }`}
                    >
                      <div className="text-xs font-medium opacity-80">
                        {isToday ? "Hôm nay" : DAY_LABELS[d.getDay()]}
                      </div>
                      <div className="text-lg font-bold">{d.getDate()}</div>
                    </button>
                  );
                })}
              </div>

              {/* Duration */}
              <div className="mb-4">
                <label className="text-sm font-semibold text-foreground mb-3 block">
                  Thời lượng chơi
                </label>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        duration === d
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                          : "bg-secondary hover:bg-secondary/80 text-foreground"
                      }`}
                    >
                      {d === 0.5 ? "30 phút" : `${d} giờ`}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Time Slots */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card rounded-3xl border border-border p-6"
            >
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">3</span>
                Chọn giờ bắt đầu
              </h2>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mb-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-card border border-border" />
                  <span className="text-muted-foreground">Trống</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-destructive/20 border border-destructive/30" />
                  <span className="text-muted-foreground">Đã đặt</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-primary" />
                  <span className="text-muted-foreground">Đang chọn</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-accent/20 border border-accent/30" />
                  <span className="text-muted-foreground">Cao điểm (17h+)</span>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                {START_TIMES.map((t) => {
                  const end = addDuration(t, duration);
                  const available = isStartAvailable(t, duration);
                  const isPeak = parseInt(t.split(":")[0]) >= 17;
                  const isSelected = startTime === t;
                  return (
                    <button
                      key={t}
                      disabled={!available}
                      onClick={() => setStartTime(t)}
                      className={`slot-card p-3 rounded-xl text-center border-2 transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                          : !available
                          ? "bg-destructive/10 text-destructive/50 border-destructive/20 cursor-not-allowed"
                          : isPeak
                          ? "bg-accent/10 border-accent/30 text-foreground hover:border-accent"
                          : "bg-card border-border text-foreground hover:border-primary/30"
                      }`}
                    >
                      <div className="font-bold text-sm">{t}</div>
                      <div className="text-[10px] opacity-70">→ {end}</div>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Services */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-card rounded-3xl border border-border p-6"
            >
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">4</span>
                Dịch vụ đi kèm
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {services.slice(0, 8).map((svc) => {
                  const qty = chosenSvc[svc.id] || 0;
                  return (
                    <label
                      key={svc.id}
                      className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        qty > 0 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={qty > 0}
                        onChange={(e) => setQty(svc.id, e.target.checked ? 1 : 0)}
                        className="w-5 h-5 rounded-lg accent-primary"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{svc.ten_dich_vu}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatVND(svc.don_gia)}/{svc.don_vi_tinh}
                        </div>
                      </div>
                      {qty > 0 && (
                        <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                          <button
                            onClick={() => setQty(svc.id, qty - 1)}
                            className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 font-bold"
                          >
                            −
                          </button>
                          <span className="w-8 text-center font-bold">{qty}</span>
                          <button
                            onClick={() => setQty(svc.id, Math.min(qty + 1, svc.ton_kho))}
                            className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 font-bold"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </label>
                  );
                })}
              </div>
            </motion.div>

            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-card rounded-3xl border border-border p-6"
            >
              <h2 className="text-xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">5</span>
                Thông tin liên hệ
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" /> Họ tên <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={tenKhach}
                    onChange={(e) => setTenKhach(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Phone className="w-4 h-4" /> Số điện thoại <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={sdtKhach}
                    onChange={(e) => setSdtKhach(e.target.value)}
                    placeholder="0901234567"
                    maxLength={10}
                    className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email <span className="text-muted-foreground font-normal">(tùy chọn)</span>
                  </label>
                  <input
                    value={emailKhach}
                    onChange={(e) => setEmailKhach(e.target.value)}
                    placeholder="ban@email.com"
                    type="email"
                    className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  />
                </div>
              </div>
            </motion.div>
          </div>

          {/* Sidebar - Summary */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="sticky top-24 bg-card rounded-3xl border border-border p-6"
            >
              <h3 className="text-lg font-display font-bold text-foreground mb-4">
                Tóm tắt đặt sân
              </h3>

              {/* Field Info */}
              <div className="p-4 rounded-2xl bg-secondary/50 mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">⚽</span>
                  <div>
                    <div className="font-bold text-foreground">{activeField.ten_san}</div>
                    <div className="text-sm text-muted-foreground">
                      {activeField.loai_san === "SAN_5" ? "Sân 5 người" : activeField.loai_san === "SAN_7" ? "Sân 7 người" : "Sân 11 người"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Booking Details */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Ngày
                  </span>
                  <span className="font-medium text-foreground">
                    {targetDate.toLocaleDateString("vi-VN")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Thời gian
                  </span>
                  <span className="font-medium text-foreground">
                    {startTime ? `${startTime} - ${endTime}` : "Chưa chọn"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" /> Thời lượng
                  </span>
                  <span className="font-medium text-foreground">
                    {duration === 0.5 ? "30 phút" : `${duration} giờ`}
                  </span>
                </div>
              </div>

              {/* Membership badge */}
              {memberStatus && memberStatus.discount_percent > 0 && (
                <div className="border-t border-border pt-4 mb-2">
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
                    <Sparkles className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 text-xs">
                      <div className="font-semibold text-foreground">Thẻ {memberStatus.tier_name}</div>
                      <div className="text-muted-foreground">Tự động giảm {memberStatus.discount_percent}% tiền sân</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pricing */}
              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tiền sân</span>
                  <span className="font-medium text-foreground">{formatVND(tienSan)}</span>
                </div>
                {tienDV > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Dịch vụ</span>
                    <span className="font-medium text-foreground">{formatVND(tienDV)}</span>
                  </div>
                )}
                {giamGia > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-primary flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Giảm thẻ {memberStatus?.tier_name} (-{memberStatus?.discount_percent}%)
                    </span>
                    <span className="font-semibold text-primary">−{formatVND(giamGia)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="font-bold text-foreground">Tổng cộng</span>
                  <span className="text-2xl font-display font-bold text-primary">
                    {formatVND(tongCong)}
                  </span>
                </div>
              </div>

              {/* Error */}
              <AnimatePresence>
                {err && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                  >
                    {err}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Button */}
              <button
                onClick={submit}
                disabled={submitting || !startTime}
                className="w-full mt-6 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Đặt sân ngay</span>
                  </>
                )}
              </button>

              {/* Info */}
              <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-accent/10 border border-accent/20">
                <Wifi className="w-5 h-5 text-accent shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Wifi miễn phí, bãi đỗ xe, căng tin
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
}
