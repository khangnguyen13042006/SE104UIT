"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { apiGet, apiPost, formatVND, formatDate, getUser } from "@/lib/api";
import { Calendar, Clock, MapPin, X, Star, AlertCircle, Loader2, RotateCcw, Ban, CheckCircle2 } from "lucide-react";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  CHO_XAC_NHAN: { text: "Chờ xác nhận", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  DA_XAC_NHAN: { text: "Đã xác nhận", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  DANG_SU_DUNG: { text: "Đang sử dụng", cls: "bg-purple-100 text-purple-800 border-purple-200" },
  HOAN_THANH: { text: "Hoàn thành", cls: "bg-brand-100 text-brand-700 border-brand-200" },
  HUY: { text: "Đã hủy", cls: "bg-red-100 text-red-700 border-red-200" },
};

export default function MyBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<any[]>([]);
  const [feedbackByBooking, setFeedbackByBooking] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const u = getUser();
      const params = new URLSearchParams();
      if (filter) params.set("trang_thai", filter);
      if (u && ["ADMIN", "QUAN_LY", "NHAN_VIEN"].includes(u.vai_tro)) {
        params.set("khach_hang_id", String(u.id));
      }
      const [bookingList, feedbacks] = await Promise.all([
        apiGet(`/api/bookings?${params}`),
        apiGet("/api/feedbacks").catch(() => []),
      ]);
      setBookings(bookingList);
      // Map booking_id → feedback
      const fbMap: Record<number, any> = {};
      for (const f of feedbacks || []) {
        if (f.booking_id) fbMap[f.booking_id] = f;
      }
      setFeedbackByBooking(fbMap);
    } catch (e: any) {
      if (e.message.includes("401") || e.message.includes("xác thực")) {
        router.push("/login");
      } else {
        alert(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getUser()) {
      router.push("/login");
      return;
    }
    load();
  }, [filter]);

  return (
    <>
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="text-xs font-bold tracking-[0.25em] text-brand-600 mb-2">LỊCH SỬ ĐẶT</div>
            <h1 className="font-display text-5xl text-ink-900">LỊCH CỦA TÔI</h1>
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-ink-900/10 bg-white font-medium text-sm">
            <option value="">Tất cả trạng thái</option>
            <option value="CHO_XAC_NHAN">Chờ xác nhận</option>
            <option value="DA_XAC_NHAN">Đã xác nhận</option>
            <option value="HOAN_THANH">Hoàn thành</option>
            <option value="HUY">Đã hủy</option>
          </select>
        </div>

        {loading ? (
          <div className="p-16 text-center text-ink-400">
            <Loader2 className="animate-spin mx-auto mb-2" /> Đang tải...
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center border border-ink-900/5">
            <Calendar className="mx-auto mb-3 text-ink-400" size={40} />
            <p className="text-ink-400">Bạn chưa có booking nào</p>
            <button onClick={() => router.push("/booking")}
              className="mt-4 px-5 py-2.5 bg-ink-900 text-white rounded-xl font-semibold text-sm">
              Đặt sân ngay
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <BookingCard key={b.id} b={b}
                feedback={feedbackByBooking[b.id]}
                onCancel={() => setCancelTarget(b)}
                onFeedback={() => setFeedbackTarget(b)} />
            ))}
          </div>
        )}
      </div>

      {cancelTarget && (
        <CancelModal booking={cancelTarget} onClose={() => setCancelTarget(null)}
          onSuccess={() => { setCancelTarget(null); load(); }} />
      )}
      {feedbackTarget && (
        <FeedbackModal booking={feedbackTarget} onClose={() => setFeedbackTarget(null)}
          onSuccess={() => { setFeedbackTarget(null); load(); }} />
      )}
    </>
  );
}

function RefundStatusBox({ booking }: { booking: any }) {
  // Determine refund state from invoice + hoan_tien flag
  const invStatus = booking.invoice?.trang_thai;
  let state: "no_refund" | "pending" | "refunded";
  let title: string;
  let detail: string;
  let icon: React.ReactNode;
  let cls: string;

  if (invStatus === "CHO_HOAN_TIEN") {
    state = "pending";
    title = "Đang chờ hoàn tiền (Pending Refund)";
    detail = `Booking đã hủy với chính sách hoàn tiền. Nhân viên sẽ xác nhận chuyển khoản hoàn về tài khoản của bạn trong 1-3 ngày làm việc.`;
    icon = <Clock className="w-5 h-5" />;
    cls = "bg-accent/10 border-accent/30 text-accent";
  } else if (invStatus === "HOAN_TIEN") {
    state = "refunded";
    title = "Đã hoàn tiền (Refunded)";
    detail = `Số tiền hoàn đã được chuyển về tài khoản. Vui lòng kiểm tra ngân hàng/ví của bạn.`;
    icon = <CheckCircle2 className="w-5 h-5" />;
    cls = "bg-chart-3/10 border-chart-3/30 text-chart-3";
  } else {
    // Default to no refund (either policy said no, or invoice never paid)
    state = "no_refund";
    title = "Không hoàn tiền (No Refund)";
    detail = booking.hoan_tien === false
      ? `Theo chính sách hoặc quyết định của staff, booking này không được hoàn tiền.`
      : `Booking này không có khoản thanh toán cần hoàn.`;
    icon = <Ban className="w-5 h-5" />;
    cls = "bg-muted border-border text-muted-foreground";
  }

  return (
    <div className={`p-4 rounded-xl border ${cls}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold mb-1">{title}</div>
          <div className="text-xs leading-relaxed opacity-90">{detail}</div>
          {state === "refunded" && booking.invoice && (
            <div className="text-xs mt-2 font-semibold">
              Số tiền hoàn: ~{formatVND(parseFloat(booking.invoice.tong_cong) * 0.5)} (50% theo policy)
            </div>
          )}
          {state === "pending" && booking.invoice && (
            <div className="text-xs mt-2 font-semibold">
              Dự kiến hoàn: {formatVND(parseFloat(booking.invoice.tong_cong) * 0.5)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BookingCard({ b, feedback, onCancel, onFeedback }: any) {
  const st = STATUS_LABEL[b.trang_thai];
  const canCancel = ["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(b.trang_thai);
  const canFeedback = b.trang_thai === "HOAN_THANH" && !feedback;
  const hoursUntil = (new Date(`${b.ngay_dat}T${b.gio_bat_dau}`).getTime() - Date.now()) / 3600000;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 hover:shadow-md transition">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">{b.ma_dat_san}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st?.cls}`}>{st?.text}</span>
          </div>
          <h3 className="text-2xl font-display font-bold text-foreground">{b.ten_san}</h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-display font-bold text-primary">{formatVND(b.invoice?.tong_cong || b.tien_san)}</div>
          {b.invoice && parseFloat(b.invoice.tien_dich_vu) > 0 && (
            <div className="text-xs text-muted-foreground">
              Sân: {formatVND(b.tien_san)} + DV: {formatVND(b.invoice.tien_dich_vu)}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-0.5">{b.hinh_thuc_thanh_toan === "TIEN_MAT" ? "Tiền mặt" : "Chuyển khoản"}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
        <span className="flex items-center gap-1"><Calendar size={14} /> {formatDate(b.ngay_dat)}</span>
        <span className="flex items-center gap-1"><Clock size={14} /> {b.gio_bat_dau.slice(0, 5)} - {b.gio_ket_thuc.slice(0, 5)} ({b.so_gio}h)</span>
        {b.services?.length > 0 && (
          <span className="flex items-center gap-1">🛍️ {b.services.length} dịch vụ</span>
        )}
      </div>

      {b.services?.length > 0 && (
        <div className="text-xs text-muted-foreground mb-3 pl-1">
          {b.services.map((s: any) => `${s.ten_dich_vu} ×${s.so_luong}`).join(" • ")}
        </div>
      )}

      {/* Cancellation reason + refund status — 3 states: No Refund / Pending Refund / Refunded */}
      {b.trang_thai === "HUY" && (
        <div className="mb-3 space-y-2">
          {b.ly_do_huy && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              <strong>Lý do hủy:</strong> {b.ly_do_huy}
            </div>
          )}
          <RefundStatusBox booking={b} />
        </div>
      )}

      {/* Submitted feedback inline */}
      {feedback && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 fill-accent text-accent" />
              <span className="text-xs font-bold text-foreground">Bạn đã đánh giá</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`w-3 h-3 ${n <= feedback.danh_gia_tong ? "fill-accent text-accent" : "text-muted-foreground/30"}`} />
                ))}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{new Date(feedback.ngay_tao).toLocaleDateString("vi-VN")}</span>
          </div>
          {feedback.nhan_xet && (
            <p className="text-sm italic text-foreground bg-secondary/40 rounded-xl p-3">"{feedback.nhan_xet}"</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-2">
            <span>Cơ sở: <strong className="text-foreground">{feedback.danh_gia_co_so}/5</strong></span>
            <span>·</span>
            <span>Nhân viên: <strong className="text-foreground">{feedback.danh_gia_nhan_vien}/5</strong></span>
            <span>·</span>
            <span>Dịch vụ: <strong className="text-foreground">{feedback.danh_gia_dich_vu}/5</strong></span>
          </div>
        </div>
      )}

      {(canCancel || canFeedback) && (
        <div className="flex gap-2 pt-3 border-t border-border">
          {canCancel && (
            <button onClick={onCancel}
              className="px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 rounded-lg transition">
              <X size={14} className="inline mr-1" />
              Hủy lịch {hoursUntil >= 24 ? "(hoàn 50%)" : "(không hoàn tiền)"}
            </button>
          )}
          {canFeedback && (
            <button onClick={onFeedback}
              className="px-4 py-2 text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition">
              <Star size={14} className="inline mr-1" />
              Đánh giá
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CancelModal({ booking, onClose, onSuccess }: any) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const hoursUntil = (new Date(`${booking.ngay_dat}T${booking.gio_bat_dau}`).getTime() - Date.now()) / 3600000;

  async function submit() {
    if (reason.length < 3) {
      setErr("Vui lòng nhập lý do (≥3 ký tự)");
      return;
    }
    setLoading(true);
    try {
      await apiPost(`/api/bookings/${booking.id}/cancel`, { ly_do_huy: reason });
      alert("Đã hủy booking");
      onSuccess();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Hủy booking">
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 mb-4 flex gap-2">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <div>
          {hoursUntil >= 24
            ? `Còn ${hoursUntil.toFixed(1)}h trước giờ chơi — được hoàn 50% tiền sân.`
            : `Còn ${hoursUntil.toFixed(1)}h trước giờ chơi — KHÔNG được hoàn tiền.`}
        </div>
      </div>
      <label className="block text-sm font-semibold mb-1.5">Lý do hủy</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
        className="w-full px-3 py-2.5 rounded-xl border border-input focus:border-primary outline-none resize-none bg-background"
        placeholder="Ví dụ: Đổi lịch họp đột xuất..." />
      {err && <div className="mt-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</div>}
      <div className="flex gap-2 mt-5">
        <button type="button" onClick={onClose} disabled={loading}
          className="flex-1 py-3 rounded-2xl border border-border hover:bg-secondary font-semibold disabled:opacity-50 transition-colors">
          Quay lại
        </button>
        <button type="button" onClick={submit} disabled={loading}
          className="flex-1 py-3 rounded-2xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold disabled:opacity-50 transition-colors">
          {loading ? "Đang hủy..." : "Xác nhận hủy"}
        </button>
      </div>
    </ModalShell>
  );
}

function FeedbackModal({ booking, onClose, onSuccess }: any) {
  const [tong, setTong] = useState(5);
  const [coSo, setCoSo] = useState(5);
  const [nv, setNv] = useState(5);
  const [dv, setDv] = useState(5);
  const [nhanXet, setNX] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setLoading(true);
    setErr("");
    try {
      await apiPost("/api/feedbacks", {
        booking_id: booking.id,
        danh_gia_tong: tong, danh_gia_co_so: coSo,
        danh_gia_nhan_vien: nv, danh_gia_dich_vu: dv,
        nhan_xet: nhanXet,
      });
      alert("Cảm ơn bạn đã đánh giá!");
      onSuccess();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Đánh giá trải nghiệm">
      <p className="text-sm text-ink-400 mb-4">{booking.ten_san} — {formatDate(booking.ngay_dat)}</p>
      <div className="space-y-3">
        <StarRow label="Đánh giá tổng" value={tong} onChange={setTong} />
        <StarRow label="Cơ sở vật chất" value={coSo} onChange={setCoSo} />
        <StarRow label="Thái độ nhân viên" value={nv} onChange={setNv} />
        <StarRow label="Dịch vụ đi kèm" value={dv} onChange={setDv} />
      </div>
      <label className="block text-sm font-semibold mt-4 mb-1.5">Nhận xét</label>
      <textarea value={nhanXet} onChange={(e) => setNX(e.target.value)} rows={3} maxLength={500}
        className="w-full px-3 py-2.5 rounded-xl border border-input bg-background focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none resize-none transition-all"
        placeholder="Trải nghiệm của bạn..." />
      {err && <div className="mt-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</div>}
      <div className="flex gap-2 mt-5">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="flex-1 py-3 rounded-2xl border border-border hover:bg-secondary font-semibold disabled:opacity-50 transition-colors"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="flex-1 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold disabled:opacity-50 shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Đang gửi...</span>
            </>
          ) : (
            <span>Gửi đánh giá</span>
          )}
        </button>
      </div>
    </ModalShell>
  );
}

function StarRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)}
            className={`text-2xl transition ${n <= value ? "text-amber-400" : "text-ink-900/15"}`}>★</button>
        ))}
      </div>
    </div>
  );
}

function ModalShell({ onClose, title, children }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl w-full max-w-md shadow-2xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-2xl font-display font-bold text-foreground">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
