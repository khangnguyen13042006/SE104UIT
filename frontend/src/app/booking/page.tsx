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
  const [activeField, setActiveField] = useState<any>(null);
  
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
    if (!activeField?.id) return;
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

  // KHANG: Logic khóa giờ đã qua + giờ đã đặt
  function isStartAvailable(t: string, dur: number): boolean {
    const [sh, sm] = t.split(":").map(Number);
    const startM = sh * 60 + sm;
    const endM = startM + dur * 60;
    
    if (endM > 23 * 60) return false;

    // 1. Chặn giờ đã qua nếu là hôm nay
    if (isToday) {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      if (startM <= currentMin) return false; 
    }

    // 2. Chặn giờ đã bị đặt (bookedRanges)
    return !bookedRanges.some(b => startM < b.e && endM > b.s);
  }

  function setQty(svcId: number, qty: number) {
    setChosenSvc((c) => {
      const n = { ...c };
      if (qty <= 0) delete n[svcId];
      else n[svcId] = qty;
      return n;
    });
  }

  const tienSan = useMemo(() => {
    if (!activeField || !startTime) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = s + duration * 60;
    const peak = 17 * 60;
    let total = 0;
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
    if (!startTime || !tenKhach || !sdtKhach || !activeField) { setErr("Vui lòng điền đủ thông tin"); return; }
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
      <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Preview sân bóng */}
          <section className="bg-card overflow-hidden rounded-3xl border border-border aspect-video relative shadow-sm">
            {activeField ? (
              <>
                <img src={`/fields/img-1.jpg`} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent text-white">
                  <h1 className="text-3xl font-bold">{activeField?.ten_san || "Đang tải..."}</h1>
                  <p className="opacity-90">{activeField?.loai_san === "SAN_5" ? "Sân 5 người" : "Sân 7 người"} · Sức chứa {activeField?.suc_chua || 0} người</p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground italic">Vui lòng chọn sân bóng</div>
            )}
          </section>

          {/* 1. Chọn sân */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Zap className="text-primary"/> 1. Chọn sân bóng</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {fields?.map((f, idx) => (
                <button key={f.id} onClick={() => setActiveField(f)} className={`p-2 rounded-2xl border-2 transition-all ${activeField?.id === f.id ? "border-primary bg-primary/5" : "border-transparent bg-secondary"}`}>
                  <div className="aspect-video rounded-xl overflow-hidden mb-2"><img src={`/fields/img-${(idx % 6) + 1}.jpg`} className="w-full h-full object-cover" /></div>
                  <div className="font-bold text-xs sm:text-sm">{f?.ten_san || "Sân chưa đặt tên"}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Ngày & Thời lượng */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Calendar className="text-primary"/> 2. Chọn ngày & thời lượng</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <input type="date" value={dateStr} min={today.toISOString().split("T")[0]} onChange={(e) => setSelectedDate(new Date(e.target.value))} className="w-full p-3 rounded-xl border-2 border-input bg-background font-bold" />
                <div className="flex flex-wrap gap-2">
                  {[0,1,2,3].map(i => {
                    const d = new Date(today); d.setDate(d.getDate()+i);
                    const isSel = selectedDate.toDateString() === d.toDateString();
                    return <button key={i} onClick={() => setSelectedDate(d)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isSel ? "bg-primary text-white" : "bg-secondary hover:bg-secondary/80 text-foreground"}`}>{i===0?"Hôm nay":i===1?"Ngày mai":`${d.getDate()}/${d.getMonth()+1}`}</button>
                  })}
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Thời lượng chơi</label>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map(d => <button key={d} onClick={() => setDuration(d)} className={`px-4 py-2 rounded-xl border-2 font-bold transition-all ${duration===d?"border-primary bg-primary/10 text-primary":"border-transparent bg-secondary"}`}>{d}h</button>)}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Giờ bắt đầu */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Clock className="text-primary"/> 3. Chọn giờ bắt đầu</h2>
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {START_TIMES.map(t => {
                const ok = isStartAvailable(t, duration);
                const isSel = startTime === t;
                return (
                  <button 
                    key={t} 
                    disabled={!ok} 
                    onClick={() => setStartTime(t)} 
                    className={`p-2 rounded-xl border-2 font-bold text-sm transition-all ${
                      isSel ? "bg-primary text-white border-primary shadow-md" : 
                      !ok ? "opacity-20 cursor-not-allowed bg-secondary/50 border-transparent" : 
                      "bg-secondary hover:border-primary/40 border-transparent"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 4. Dịch vụ */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Package className="text-primary"/> 4. Dịch vụ đi kèm</h2>
            <div className="grid sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2">
              {services?.map((svc) => {
                const qty = chosenSvc[svc.id] || 0;
                return (
                  <label key={svc.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${qty > 0 ? "border-primary bg-primary/5" : "border-border"}`}>
                    <input type="checkbox" checked={qty > 0} onChange={(e) => setQty(svc.id, e.target.checked ? 1 : 0)} className="w-5 h-5 accent-primary" />
                    <div className="flex-1"><div className="font-bold text-sm">{svc.ten_dich_vu}</div><div className="text-xs opacity-60">{formatVND(svc.don_gia)}/{svc.don_vi_tinh}</div></div>
                    {qty > 0 && <div className="flex items-center gap-2" onClick={e => e.preventDefault()}><button onClick={() => setQty(svc.id, qty - 1)} className="w-8 h-8 rounded-lg bg-secondary font-bold">−</button><span className="w-5 text-center font-bold text-sm">{qty}</span><button onClick={() => setQty(svc.id, qty + 1)} className="w-8 h-8 rounded-lg bg-secondary font-bold">+</button></div>}
                  </label>
                );
              })}
            </div>
          </section>

          {/* 5. Thông tin khách hàng */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><User className="text-primary"/> 5. Thông tin liên hệ</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-xs font-bold px-1">Họ tên *</label><input value={tenKhach} onChange={e => setTenKhach(e.target.value)} className="w-full p-3 rounded-xl border border-input bg-background" placeholder="Nguyễn Văn A" /></div>
              <div className="space-y-1"><label className="text-xs font-bold px-1">Số điện thoại *</label><input value={sdtKhach} onChange={e => setSdtKhach(e.target.value)} className="w-full p-3 rounded-xl border border-input bg-background" placeholder="090..." maxLength={10} /></div>
            </div>
          </section>
        </div>

        {/* Sidebar Tóm tắt */}
        <aside className="space-y-6">
          <div className="sticky top-24 bg-card p-6 rounded-3xl border border-border shadow-xl">
            <h3 className="text-xl font-bold mb-6 font-display">Tóm tắt đơn đặt</h3>
            <div className="space-y-4 border-b pb-6 mb-6 text-sm">
              <div className="flex justify-between"><span>Sân:</span><span className="font-bold">{activeField?.ten_san || "Chưa chọn"}</span></div>
              <div className="flex justify-between"><span>Ngày:</span><span className="font-bold">{selectedDate.toLocaleDateString("vi-VN")}</span></div>
              <div className="flex justify-between text-primary font-bold"><span>Giờ:</span><span>{startTime ? `${startTime} - ${addDuration(startTime, duration)}` : "Chưa chọn"}</span></div>
            </div>
            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-muted-foreground"><span>Tiền sân:</span><span>{formatVND(tienSan)}</span></div>
              {tienDV > 0 && <div className="flex justify-between text-muted-foreground"><span>Dịch vụ:</span><span>{formatVND(tienDV)}</span></div>}
              {giamGia > 0 && <div className="flex justify-between text-primary font-medium"><span>Giảm giá:</span><span>-{formatVND(giamGia)}</span></div>}
              <div className="flex justify-between text-xl font-bold border-t pt-3 mt-3"><span>Tổng cộng:</span><span className="text-primary">{formatVND(tongCong)}</span></div>
            </div>
            {err && <div className="p-3 bg-destructive/10 text-destructive rounded-xl text-xs mb-4">{err}</div>}
            <button onClick={submit} disabled={submitting || !startTime} className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-lg hover:shadow-primary/90 disabled:opacity-50 transition-all flex justify-center gap-2 items-center">
              {submitting ? <Loader2 className="animate-spin w-5 h-5"/> : <CheckCircle2 className="w-5 h-5"/>} 
              {submitting ? "Đang xử lý..." : "Đặt sân ngay"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
