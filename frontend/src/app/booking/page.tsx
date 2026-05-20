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
        const fieldData = Array.isArray(f) ? f : [];
        setFields(fieldData);
        setServices(Array.isArray(s) ? s : []);
        if (fieldData.length > 0) setActiveField(fieldData[0]);
      })
      .catch(() => setLoadErr("Lỗi kết nối dữ liệu máy chủ"));

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

  if (loadErr) return <div className="p-10 text-center text-red-500 font-serif">{loadErr}</div>;

  return (
    <div className="min-h-screen bg-background font-serif">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Preview sân bóng - FIX LỖI CRASH VERCEL */}
          <section className="bg-card overflow-hidden rounded-3xl border border-border aspect-video relative shadow-sm">
            {activeField ? (
              <>
                <img src={`/fields/img-1.jpg`} className="w-full h-full object-cover" alt="Field Preview" />
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent text-white">
                  {/* Sử dụng ?.ten_san an toàn */}
                  <h1 className="text-3xl font-bold">{activeField?.ten_san || "Sân bóng đá"}</h1>
                  <p className="opacity-90">{activeField?.loai_san === "SAN_5" ? "Sân 5 người" : "Sân 7 người"} · Sức chứa {activeField?.suc_chua || 0} người</p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground italic">Đang tải dữ liệu sân...</div>
            )}
          </section>

          {/* 1. Chọn sân */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 font-display"><Zap className="text-primary w-5 h-5"/> 1. Chọn sân bóng</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {fields?.length > 0 ? (
                fields.map((f, idx) => (
                  <button key={f.id} onClick={() => setActiveField(f)} className={`p-2 rounded-2xl border-2 transition-all ${activeField?.id === f.id ? "border-primary bg-primary/5" : "border-transparent bg-secondary"}`}>
                    <div className="aspect-video rounded-xl overflow-hidden mb-2"><img src={`/fields/img-${(idx % 6) + 1}.jpg`} className="w-full h-full object-cover" alt="Field" /></div>
                    <div className="font-bold text-xs sm:text-sm">{f?.ten_san || "Sân chưa đặt tên"}</div>
                  </button>
                ))
              ) : (
                <div className="col-span-full py-10 text-center opacity-50 italic">Không có dữ liệu sân khả dụng.</div>
              )}
            </div>
          </section>

          {/* 2. Ngày & Thời lượng */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 font-display"><Calendar className="text-primary w-5 h-5"/> 2. Chọn ngày & thời lượng</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <input type="date" value={dateStr} min={today.toISOString().split("T")[0]} onChange={(e) => setSelectedDate(new Date(e.target.value))} className="w-full p-3 rounded-xl border-2 border-input bg-background font-bold outline-none focus:border-primary transition-all" />
                <div className="flex flex-wrap gap-2">
                  {[0,1,2,3].map(i => {
                    const d = new Date(today); d.setDate(d.getDate()+i);
                    const isSel = selectedDate.toDateString() === d.toDateString();
                    return <button key={i} onClick={() => setSelectedDate(d)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isSel ? "bg-primary text-white shadow-sm" : "bg-secondary hover:bg-secondary/80"}`}>{i===0?"Hôm nay":i===1?"Ngày mai":`${d.getDate()}/${d.getMonth()+1}`}</button>
                  })}
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Thời lượng đá</label>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map(d => <button key={d} onClick={() => setDuration(d)} className={`px-4 py-2 rounded-xl border-2 font-bold transition-all ${duration===d?"border-primary bg-primary/10 text-primary":"border-transparent bg-secondary"}`}>{d}h</button>)}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Giờ bắt đầu */}
          <section className="bg-card p-6 rounded-3xl border border-border">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 font-display"><Clock className="text-primary w-5 h-5"/> 3. Chọn giờ bắt đầu</h2>
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
                      !ok ? "opacity-10 cursor-not-allowed bg-secondary/50 border-transparent grayscale" : 
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
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 font-display"><Package className="text-primary w-5 h-5"/> 4. Dịch vụ đi kèm</h2>
            <div className="grid sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {services?.map((svc) => {
                const qty = chosenSvc[svc.id] || 0;
                return (
                  <label key={svc.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${qty > 0 ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-secondary/40"}`}>
                    <input type="checkbox" checked={qty > 0} onChange={(e) => {
                      const n = { ...chosenSvc };
                      if (e.target.checked) n[svc.id] = 1; else delete n[svc.id];
                      setChosenSvc(n);
                    }} className="w-5 h-5 accent-primary" />
                    <div className="flex-1"><div className="font-bold text-sm">{svc.ten_dich_vu}</div><div className="text-xs opacity-60">{formatVND(svc.don_gia)}/{svc.don_vi_tinh}</div></div>
                    {qty > 0 && <div className="flex items-center gap-2" onClick={e => e.preventDefault()}><button onClick={() => {
                        const n = { ...chosenSvc }; if (qty > 1) n[svc.id] = qty - 1; else delete n[svc.id]; setChosenSvc(n);
                      }} className="w-8 h-8 rounded-lg bg-secondary font-bold">−</button><span className="w-5 text-center font-bold text-sm">{qty}</span><button onClick={() => {
                        const n = { ...chosenSvc }; n[svc.id] = qty + 1; setChosenSvc(n);
                      }} className="w-8 h-8 rounded-lg bg-secondary font-bold">+</button></div>}
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        {/* Sidebar Tóm tắt đơn */}
        <aside className="space-y-6">
          <div className="sticky top-24 bg-card p-6 rounded-3xl border border-border shadow-xl">
            <h3 className="text-xl font-bold mb-6 font-display">Tóm tắt đơn đặt</h3>
            <div className="space-y-4 border-b border-dashed pb-6 mb-6 text-sm">
              <div className="flex justify-between items-center text-muted-foreground italic">
                <span>Sân:</span>
                {/* Sử dụng ?.ten_san và fallback an toàn tuyệt đối */}
                <span className="font-bold text-foreground not-italic">{activeField?.ten_san || "Chưa chọn sân"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Ngày đá:</span>
                <span className="font-bold">{selectedDate.toLocaleDateString("vi-VN")}</span>
              </div>
              <div className="flex justify-between items-center text-primary font-bold">
                <span>Giờ đá:</span>
                <span>{startTime ? `${startTime} - ${addDuration(startTime, duration)}` : "Chưa chọn giờ"}</span>
              </div>
            </div>
            
            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-muted-foreground"><span>Tiền sân:</span><span>{formatVND(tienSan)}</span></div>
              {tienDV > 0 && <div className="flex justify-between text-muted-foreground font-medium"><span>Dịch vụ:</span><span>{formatVND(tienDV)}</span></div>}
              {giamGia > 0 && <div className="flex justify-between text-primary font-bold"><span>Giảm giá thành viên:</span><span>-{formatVND(giamGia)}</span></div>}
              <div className="flex justify-between text-xl font-bold border-t pt-3 mt-3 border-border"><span>Tổng cộng:</span><span className="text-primary font-display">{formatVND(tongCong)}</span></div>
            </div>

            {err && <div className="p-3 bg-destructive/10 text-destructive rounded-xl text-xs mb-4 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> {err}</div>}

            <button onClick={submit} disabled={submitting || !startTime || !activeField} className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-lg hover:shadow-primary/30 disabled:opacity-50 transition-all flex justify-center gap-2 items-center">
              {submitting ? <Loader2 className="animate-spin w-5 h-5"/> : <CheckCircle2 className="w-5 h-5"/>} 
              {submitting ? "Đang gửi đơn..." : "Xác nhận đặt sân"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
