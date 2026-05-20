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

export default function BookingPage() {
  const router = useRouter();
  const [fields, setFields] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [activeField, setActiveField] = useState<any>(null); // Khởi tạo null
  
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
  const [memberStatus, setMemberStatus] = useState<any>(null);

  const dateStr = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const d = String(selectedDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  const isToday = useMemo(() => selectedDate.toDateString() === new Date().toDateString(), [selectedDate]);

  useEffect(() => {
    Promise.all([
      apiGet("/api/fields?trang_thai=HOAT_DONG"),
      apiGet("/api/services?trang_thai=HOAT_DONG"),
    ])
      .then(([f, s]) => {
        setFields(Array.isArray(f) ? f : []);
        setServices(Array.isArray(s) ? s : []);
        if (Array.isArray(f) && f.length > 0) setActiveField(f[0]);
      })
      .catch(() => setLoadErr("Lỗi kết nối máy chủ"));

    const u = getUser();
    if (u) {
      setTenKhach(u.ho_ten || "");
      setSdtKhach(u.sdt || "");
      setEmailKhach(u.email || "");
      apiGet("/api/memberships/me/status").then(setMemberStatus).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!activeField?.id) return; // Bảo vệ nếu activeField null
    setStartTime(null);
    apiGet(`/api/fields/${activeField.id}/schedule?ngay=${dateStr}`)
      .then((r) => {
        if (r?.bookings) {
          setBookedRanges(r.bookings.map((b: any) => {
            const [sh, sm] = b.gio_bat_dau.split(":").map(Number);
            const [eh, em] = b.gio_ket_thuc.split(":").map(Number);
            return { s: sh * 60 + sm, e: eh * 60 + em };
          }));
        }
      })
      .catch(() => setBookedRanges([]));
  }, [activeField, dateStr]);

  function isStartAvailable(t: string, dur: number): boolean {
    const [sh, sm] = t.split(":").map(Number);
    const startM = sh * 60 + sm;
    const endM = startM + dur * 60;
    if (endM > 23 * 60) return false;
    if (isToday) {
      const now = new Date();
      if (startM <= (now.getHours() * 60 + now.getMinutes())) return false;
    }
    return !bookedRanges.some(b => startM < b.e && endM > b.s);
  }

  const tienSan = useMemo(() => {
    if (!activeField || !startTime) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = s + duration * 60;
    const peak = 17 * 60;
    let total = 0;
    // Dùng ?. để truy cập thuộc tính an toàn
    const giaTieuChuan = activeField?.gia_tieu_chuan || 0;
    const giaCaoDiem = activeField?.gia_cao_diem || giaTieuChuan;
    
    if (s < peak) total += ((Math.min(e, peak) - s) / 60) * giaTieuChuan;
    if (e > peak) total += ((e - Math.max(s, peak)) / 60) * giaCaoDiem;
    return total;
  }, [activeField, startTime, duration]);

  const tienDV = useMemo(() => Object.entries(chosenSvc).reduce((sum, [id, qty]) => {
    const s = services.find(x => x.id === parseInt(id));
    return sum + (s ? s.don_gia * qty : 0);
  }, 0), [chosenSvc, services]);

  const giamGia = useMemo(() => memberStatus ? Math.round(tienSan * (memberStatus.discount_percent || 0) / 100) : 0, [tienSan, memberStatus]);
  const tongCong = tienSan + tienDV - giamGia;

  async function submit() {
    if (!startTime || !tenKhach || !sdtKhach || !activeField) { 
      setErr("Vui lòng điền đủ thông tin"); 
      return; 
    }
    setSubmitting(true);
    try {
      const res = await apiPost("/api/bookings/guest", {
        san_id: activeField.id, ngay_dat: dateStr,
        gio_bat_dau: startTime + ":00", gio_ket_thuc: addDuration(startTime, duration) + ":00",
        ten_khach: tenKhach, sdt_khach: sdtKhach, email_khach: emailKhach || null,
        services: Object.entries(chosenSvc).map(([id, q]) => ({ dich_vu_id: parseInt(id), so_luong: q }))
      });
      router.push(`/payment/${res.id}`);
    } catch (e: any) { setErr(e.message); } finally { setSubmitting(false); }
  }

  if (loadErr) return <div className="p-10 text-center text-red-500">{loadErr}</div>;

  return (
    <div className="min-h-screen bg-background font-serif">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Preview sân bóng - Chống crash bằng ?. */}
          <section className="bg-card overflow-hidden rounded-3xl border border-border aspect-video relative">
            {activeField ? (
              <>
                <img src={`/fields/img-1.jpg`} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent text-white">
                  <h1 className="text-3xl font-bold">{activeField?.ten_san || "Đang tải..."}</h1>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground italic">Vui lòng chọn sân</div>
            )}
          </section>

          {/* 1. Chọn sân */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Zap className="text-primary"/> 1. Chọn sân</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {fields?.map(f => (
                <button key={f.id} onClick={() => setActiveField(f)} className={`p-2 rounded-2xl border-2 transition-all ${activeField?.id === f.id ? "border-primary bg-primary/5" : "border-transparent bg-secondary"}`}>
                  <div className="aspect-video rounded-xl overflow-hidden mb-2"><img src={`/fields/img-1.jpg`} className="w-full h-full object-cover" /></div>
                  <div className="font-bold text-sm">{f?.ten_san || "Sân chưa đặt tên"}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Ngày & Thời lượng */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Calendar className="text-primary"/> 2. Thời gian</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <input type="date" value={dateStr} min={today.toISOString().split("T")[0]} onChange={(e) => setSelectedDate(new Date(e.target.value))} className="w-full p-3 rounded-xl border-2 border-input bg-background font-bold" />
                <div className="flex flex-wrap gap-2">
                  {[0,1,2,3].map(i => {
                    const d = new Date(today); d.setDate(d.getDate()+i);
                    return <button key={i} onClick={() => setSelectedDate(d)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedDate.toDateString() === d.toDateString() ? "bg-primary text-white" : "bg-secondary"}`}>{i===0?"Hôm nay":i===1?"Ngày mai":`${d.getDate()}/${d.getMonth()+1}`}</button>
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 h-fit">
                {DURATIONS.map(d => <button key={d} onClick={() => setDuration(d)} className={`px-4 py-2 rounded-xl border-2 font-bold ${duration===d?"border-primary bg-primary/10 text-primary":"border-transparent bg-secondary"}`}>{d}h</button>)}
              </div>
            </div>
          </section>

          {/* 3. Giờ bắt đầu */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Clock className="text-primary"/> 3. Giờ bắt đầu</h2>
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {START_TIMES.map(t => {
                const ok = isStartAvailable(t, duration);
                return <button key={t} disabled={!ok} onClick={() => setStartTime(t)} className={`p-2 rounded-xl border-2 font-bold text-sm ${startTime===t?"bg-primary text-white border-primary":!ok?"opacity-20 cursor-not-allowed":"bg-secondary border-transparent"}`}>{t}</button>
              })}
            </div>
          </section>
        </div>
        {/* Step 4: Dịch vụ đi kèm */}
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

            {/* Step 5: Thông tin liên hệ */}
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

              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Tiền sân</span><span className="font-medium">{formatVND(tienSan)}</span></div>
                {tienDV > 0 && <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Dịch vụ</span><span className="font-medium">{formatVND(tienDV)}</span></div>}
                {giamGia > 0 && <div className="flex items-center justify-between text-sm"><span className="text-primary flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Giảm giá thẻ</span><span className="font-semibold text-primary">−{formatVND(giamGia)}</span></div>}
                <div className="flex items-center justify-between pt-2 border-t border-border mt-2"><span className="font-bold">Tổng cộng</span><span className="text-2xl font-display font-bold text-primary">{formatVND(tongCong)}</span></div>
              </div>

              <AnimatePresence>{err && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</motion.div>}</AnimatePresence>

              <button onClick={submit} disabled={submitting || !startTime} className="w-full mt-6 py-4 bg-primary text-white rounded-2xl font-semibold shadow-lg hover:shadow-primary/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Xử lý...</span></> : <><CheckCircle2 className="w-5 h-5" /><span>Đặt sân ngay</span></>}
              </button>
              <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-accent/10 border border-accent/20"><Wifi className="w-5 h-5 text-accent" /><p className="text-[10px] text-muted-foreground">Hỗ trợ: Wifi, bãi đỗ xe, nước uống miễn phí.</p></div>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
}
