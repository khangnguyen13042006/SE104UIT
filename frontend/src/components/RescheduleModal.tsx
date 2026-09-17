"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPut } from "@/lib/api";
import { X, Calendar, Clock, Loader2, AlertCircle } from "lucide-react";

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

interface Props {
  booking: any;
  onClose: () => void;
  onSuccess: (updated: any) => void;
}

export default function RescheduleModal({ booking, onClose, onSuccess }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(booking.ngay_dat);
  const [duration, setDuration] = useState<number>(booking.so_gio || 1.5);
  const [startTime, setStartTime] = useState<string>(booking.gio_bat_dau?.slice(0, 5) || "");
  const [bookedRanges, setBookedRanges] = useState<{ s: number; e: number }[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoadingSchedule(true);
    apiGet(`/api/fields/${booking.san_id}/schedule?ngay=${selectedDate}`)
      .then((r) => {
        const ranges = (r.bookings || [])
          .filter((b: any) => b.id !== booking.id)
          .map((b: any) => {
            const [sh, sm] = b.gio_bat_dau.split(":").map(Number);
            const [eh, em] = b.gio_ket_thuc.split(":").map(Number);
            return { s: sh * 60 + sm, e: eh * 60 + em };
          });
        setBookedRanges(ranges);
      })
      .catch(() => setBookedRanges([]))
      .finally(() => setLoadingSchedule(false));
  }, [selectedDate, booking.san_id, booking.id]);

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
    const isToday = selectedDate === now.toISOString().slice(0, 10);
    if (isToday) {
      const currentTotalMin = now.getHours() * 60 + now.getMinutes();
      if (startTotalMin <= currentTotalMin) return false;
    }
    return !isSlotBooked(start, end);
  }

  const endTime = useMemo(() => (startTime ? addDuration(startTime, duration) : null), [startTime, duration]);
  const todayStr = new Date().toISOString().slice(0, 10);

  async function submit() {
    if (!startTime || !endTime) {
      setErr("Vui lòng chọn giờ bắt đầu còn trống.");
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const updated = await apiPut(`/api/bookings/${booking.id}/reschedule`, {
        ngay_dat: selectedDate,
        gio_bat_dau: `${startTime}:00`,
        gio_ket_thuc: `${endTime}:00`,
      });
      onSuccess(updated);
    } catch (e: any) {
      setErr(e.message || "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card rounded-3xl w-full max-w-lg shadow-2xl border border-border max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-xl font-display font-bold text-foreground">Đổi lịch đặt sân</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {booking.ma_dat_san} — {booking.ten_san}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-semibold mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> Ngày mới
            </label>
            <input
              type="date"
              min={todayStr}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-input bg-background outline-none focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="text-sm font-semibold mb-1.5 block">Thời lượng</label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                    duration === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:border-primary/30"
                  }`}
                >
                  {d}h
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold mb-1.5 flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> Giờ bắt đầu còn trống
            </label>
            {loadingSchedule ? (
              <div className="py-8 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
                {START_TIMES.map((t) => {
                  const available = isStartAvailable(t, duration);
                  const isSelected = t === startTime;
                  const [hh] = t.split(":").map(Number);
                  const isPeak = hh >= 17 && hh < 22;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={!available}
                      onClick={() => setStartTime(t)}
                      className={`py-2 rounded-lg text-xs font-semibold text-center border-2 transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-md"
                          : !available
                          ? "bg-destructive/5 text-destructive/30 border-destructive/10 cursor-not-allowed"
                          : isPeak
                          ? "bg-amber-100 border-amber-400 text-amber-900 hover:bg-amber-200"
                          : "bg-card border-border text-foreground hover:border-primary/30"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {startTime && endTime && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm">
              Khung giờ mới: <strong>{startTime} - {endTime}</strong> ngày {selectedDate}
            </div>
          )}

          {err && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-3 rounded-2xl border border-border hover:bg-secondary font-semibold disabled:opacity-50 transition-colors"
            >
              Quay lại
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !startTime}
              className="flex-1 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold disabled:opacity-50 shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...
                </>
              ) : (
                "Xác nhận đổi lịch"
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
