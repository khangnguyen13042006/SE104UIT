"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { apiGet, apiPost, formatVND } from "@/lib/api";
import { CheckCircle2, Clock, Copy, Loader2, ArrowLeft, AlertCircle, Calendar, MapPin, User, Phone, Check } from "lucide-react";

const BANK = {
  name: "Ngân hàng Vietcombank",
  account: "0123456789",
  holder: "SAN BONG UIT",
  bin: "970436",
};

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claimed, setClaimed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    try {
      const b = await apiGet(`/api/bookings/public/${bookingId}`);
      setBooking(b);
      const tienDV = (b.services || []).reduce((s: number, x: any) => s + parseFloat(x.thanh_tien), 0);
      const tongCong = parseFloat(b.tien_san) + tienDV;
      setInvoice({ tong_cong: tongCong, tien_san: parseFloat(b.tien_san), tien_dich_vu: tienDV });
      if (b.ghi_chu && b.ghi_chu.includes("KHÁCH BÁO ĐÃ CHUYỂN KHOẢN")) setClaimed(true);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [bookingId]);

  async function confirmPaid() {
    if (!confirm("Bạn xác nhận đã chuyển khoản đúng số tiền?")) return;
    setSubmitting(true);
    try { await apiPost(`/api/bookings/${bookingId}/claim-paid`); setClaimed(true); }
    catch (e: any) { setErr(e.message); }
    finally { setSubmitting(false); }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function formatDate(s: string): string {
    const d = new Date(s);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }

  if (loading) {
    return (<>
      <Navbar />
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    </>);
  }

  if (err || !booking) {
    return (<>
      <Navbar />
      <div className="max-w-md mx-auto p-6 mt-12">
        <div className="bg-destructive/10 border border-destructive/20 rounded-3xl p-8 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-display font-bold text-destructive mb-2">Lỗi</h2>
          <p className="text-destructive/80 mb-6">{err || "Không tìm thấy booking"}</p>
          <Link href="/booking" className="inline-flex items-center gap-2 px-6 py-3 bg-destructive text-white rounded-2xl font-semibold">Quay lại đặt sân</Link>
        </div>
      </div>
    </>);
  }

  const amount = Math.round(invoice.tong_cong);
  const desc = `Thanh toan ${booking.ma_dat_san}`;
  const qrUrl = `https://img.vietqr.io/image/${BANK.bin}-${BANK.account}-qr_only.png?amount=${amount}&addInfo=${encodeURIComponent(desc)}&accountName=${encodeURIComponent(BANK.holder)}`;

  return (
    <>
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/booking" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Quay lại đặt sân
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-2">Thanh toán</h1>
          <p className="text-muted-foreground">Quét mã QR để chuyển khoản hoàn tất đặt sân</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-3xl border border-border p-6 mb-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Mã đặt sân" value={booking.ma_dat_san} mono />
            <InfoRow icon={<MapPin className="w-4 h-4" />} label="Sân" value={booking.ten_san} />
            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Ngày" value={formatDate(booking.ngay_dat)} />
            <InfoRow icon={<Clock className="w-4 h-4" />} label="Khung giờ" value={`${booking.gio_bat_dau?.slice(0, 5)} - ${booking.gio_ket_thuc?.slice(0, 5)}`} />
            <InfoRow icon={<User className="w-4 h-4" />} label="Khách hàng" value={booking.ten_khach || "—"} />
            <InfoRow icon={<Phone className="w-4 h-4" />} label="SĐT" value={booking.sdt_khach || "—"} />
          </div>
          {booking.services && booking.services.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Dịch vụ:</div>
              <div className="text-foreground">{booking.services.map((s: any) => `${s.ten_dich_vu} ×${s.so_luong}`).join(" • ")}</div>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-3xl border border-border p-6 mb-6">
          {!claimed ? (
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="text-center">
                <div className="inline-block p-4 bg-white rounded-3xl shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="QR Code" width={280} height={280} className="w-[280px] h-[280px] rounded-2xl" />
                </div>
                <p className="text-sm text-muted-foreground mt-4">Mở app ngân hàng → Quét QR</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Thông tin chuyển khoản</div>
                <div className="space-y-3">
                  <BankRow label="Ngân hàng" value={BANK.name} />
                  <BankRow label="Số tài khoản" value={BANK.account} onCopy={() => copyText(BANK.account, "account")} copied={copied === "account"} />
                  <BankRow label="Chủ tài khoản" value={BANK.holder} />
                  <BankRow label="Số tiền" value={formatVND(amount)} big onCopy={() => copyText(String(amount), "amount")} copied={copied === "amount"} />
                  <BankRow label="Nội dung" value={desc} onCopy={() => copyText(desc, "desc")} copied={copied === "desc"} />
                </div>
                <div className="mt-6 p-4 rounded-2xl bg-accent/10 border border-accent/20 text-sm text-accent">
                  <strong>Lưu ý:</strong> Ghi đúng nội dung chuyển khoản để nhân viên đối soát nhanh chóng.
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }} className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-accent/20 mb-6">
                <Clock className="w-10 h-10 text-accent" />
              </motion.div>
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">Đã ghi nhận thanh toán</h2>
              <p className="text-muted-foreground mb-2">Cảm ơn bạn. Nhân viên sẽ kiểm tra giao dịch và xác nhận đặt sân trong vài phút.</p>
              <p className="text-sm text-muted-foreground mb-8">Trạng thái: <span className="text-accent font-semibold">Đang chờ xác nhận</span></p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/booking" className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold transition-colors">Đặt thêm sân</Link>
                <Link href="/my-bookings" className="px-6 py-3 border border-border hover:bg-secondary rounded-2xl font-semibold transition-colors">Xem lịch của tôi</Link>
              </div>
            </div>
          )}
        </motion.div>

        {!claimed && (
          <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} onClick={confirmPaid} disabled={submitting}
            className="w-full py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /><span>Đang xử lý...</span></>
            ) : (
              <><CheckCircle2 className="w-5 h-5" /><span>Đã thanh toán</span></>
            )}
          </motion.button>
        )}

        <p className="text-xs text-center text-muted-foreground mt-6">
          Sau khi bấm <strong>Đã thanh toán</strong>, đơn sẽ chuyển sang trạng thái <em>chờ nhân viên xác nhận</em>.
        </p>
      </div>
    </>
  );
}

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`font-semibold text-foreground ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
    </div>
  );
}

function BankRow({ label, value, big, onCopy, copied }: { label: string; value: string; big?: boolean; onCopy?: () => void; copied?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <div className={big ? "text-xl font-display font-bold text-primary" : "font-semibold text-foreground text-right"}>{value}</div>
        {onCopy && (
          <button onClick={onCopy} className="p-2 rounded-xl hover:bg-secondary transition-colors" title="Copy">
            {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
          </button>
        )}
      </div>
    </div>
  );
}
