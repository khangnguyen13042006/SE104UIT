"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { apiGet, apiPost, apiUpload, formatVND } from "@/lib/api";
import {
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Calendar,
  MapPin,
  User,
  Phone,
  Check,
  Sparkles,
  UploadCloud,
  X,
  FileImage,
  ShieldCheck,
  XCircle,
  ArrowRight,
} from "lucide-react";

const BANK = {
  name: "Ngân hàng Vietcombank",
  account: "0123456789",
  holder: "SAN BONG UIT",
  bin: "970436",
};

export default function PaymentPage() {
  const params = useParams();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claimed, setClaimed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // AI Verification State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<{
    success: boolean;
    message: string;
    checks?: any;
    details?: any;
    receipt_url?: string;
  } | null>(null);

  async function load() {
    try {
      const b = await apiGet(`/api/bookings/public/${bookingId}`);
      setBooking(b);

      if (b.invoice) {
        setInvoice(b.invoice);
      } else {
        const tienDV = (b.services || []).reduce(
          (s: number, x: any) => s + parseFloat(x.thanh_tien),
          0
        );
        setInvoice({
          tong_cong: parseFloat(b.tien_san) + tienDV,
          tien_san: parseFloat(b.tien_san),
          tien_dich_vu: tienDV,
          giam_gia: 0,
        });
      }

      if (b.ghi_chu && b.ghi_chu.includes("KHÁCH BÁO ĐÃ CHUYỂN KHOẢN")) {
        setClaimed(true);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [bookingId]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReceiptFile(file);
      setVerifyFeedback(null);
      const url = URL.createObjectURL(file);
      setReceiptPreview(url);
    }
  }

  function handleClearFile() {
    setReceiptFile(null);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(null);
    setVerifyFeedback(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleVerifyReceipt() {
    if (!receiptFile) return;
    setVerifying(true);
    setVerifyFeedback(null);

    try {
      const formData = new FormData();
      formData.append("file", receiptFile);

      const res = await apiUpload(`/api/bookings/${bookingId}/verify-receipt`, formData);
      setVerifyFeedback(res);

      if (res.success && res.booking) {
        setBooking(res.booking);
      }
    } catch (e: any) {
      setVerifyFeedback({
        success: false,
        message: e.message || "Không thể kết nối đến máy chủ để xác thực ảnh.",
      });
    } finally {
      setVerifying(false);
    }
  }

  async function confirmPaid() {
    if (!confirm("Bạn xác nhận đã chuyển khoản đúng số tiền?")) return;
    setSubmitting(true);
    try {
      await apiPost(`/api/bookings/${bookingId}/claim-paid`);
      setClaimed(true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
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
    return (
      <>
        <Navbar />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">Đang tải...</p>
          </div>
        </div>
      </>
    );
  }

  if (err || !booking) {
    return (
      <>
        <Navbar />
        <div className="max-w-md mx-auto p-6 mt-12">
          <div className="bg-destructive/10 border border-destructive/20 rounded-3xl p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-display font-bold text-destructive mb-2">Lỗi</h2>
            <p className="text-destructive/80 mb-6">{err || "Không tìm thấy booking"}</p>
            <Link
              href="/booking"
              className="inline-flex items-center gap-2 px-6 py-3 bg-destructive text-white rounded-2xl font-semibold"
            >
              Quay lại đặt sân
            </Link>
          </div>
        </div>
      </>
    );
  }

  const amount = Math.round(invoice?.tong_cong || 0);
  const isConfirmed =
    booking.trang_thai === "DA_XAC_NHAN" ||
    booking.trang_thai === "DANG_SU_DUNG" ||
    booking.trang_thai === "HOAN_THANH";
  const desc = `Thanh toan ${booking.ma_dat_san}`;
  const qrUrl = `https://img.vietqr.io/image/${BANK.bin}-${BANK.account}-qr_only.png?amount=${amount}&addInfo=${encodeURIComponent(
    desc
  )}&accountName=${encodeURIComponent(BANK.holder)}`;

  return (
    <>
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/booking"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại đặt sân
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-2">
            {isConfirmed ? "Xác nhận đặt sân" : "Thanh toán & Xác nhận"}
          </h1>
          <p className="text-muted-foreground">
            {isConfirmed
              ? "Đơn đặt sân của bạn đã được xác nhận thành công"
              : "Quét mã QR hoặc gửi ảnh biên lai để hệ thống AI tự động kích hoạt sân"}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-3xl border border-border p-6 mb-6"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Mã đặt sân" value={booking.ma_dat_san} mono />
            <InfoRow icon={<MapPin className="w-4 h-4" />} label="Sân" value={booking.ten_san} />
            <InfoRow icon={<Calendar className="w-4 h-4" />} label="Ngày" value={formatDate(booking.ngay_dat)} />
            <InfoRow
              icon={<Clock className="w-4 h-4" />}
              label="Khung giờ"
              value={`${booking.gio_bat_dau?.slice(0, 5)} - ${booking.gio_ket_thuc?.slice(0, 5)}`}
            />
            <InfoRow icon={<User className="w-4 h-4" />} label="Khách hàng" value={booking.ten_khach || "—"} />
            <InfoRow icon={<Phone className="w-4 h-4" />} label="SĐT" value={booking.sdt_khach || "—"} />
          </div>
          {booking.services && booking.services.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Dịch vụ:
              </div>
              <div className="text-foreground">
                {booking.services.map((s: any) => `${s.ten_dich_vu} ×${s.so_luong}`).join(" • ")}
              </div>
            </div>
          )}
        </motion.div>

        {isConfirmed ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center mb-6 shadow-xl"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-500 mb-4">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <div className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold text-xs tracking-wider uppercase mb-3">
              ĐÃ XÁC NHẬN THÀNH CÔNG
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">
              Lịch đặt sân đã được kích hoạt!
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto mb-6">
              Hệ thống đã ghi nhận thanh toán đầy đủ ({formatVND(amount)}). Sân bóng đã sẵn sàng đón bạn vào lúc{" "}
              <strong>
                {booking.gio_bat_dau?.slice(0, 5)} ngày {formatDate(booking.ngay_dat)}
              </strong>
              .
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/my-bookings"
                className="px-6 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
              >
                <span>Xem lịch của tôi</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/booking"
                className="px-6 py-3.5 border border-border hover:bg-secondary rounded-2xl font-semibold transition-colors flex items-center justify-center"
              >
                Đặt thêm sân
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-3xl border border-border p-6 mb-6"
          >
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="text-center">
                <div className="inline-block p-4 bg-white rounded-3xl shadow-lg border border-border/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl} alt="QR Code" width={280} height={280} className="w-[280px] h-[280px] rounded-2xl" />
                </div>
                <p className="text-sm text-muted-foreground mt-4">Mở app ngân hàng → Quét mã QR</p>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-wider">
                  Thông tin chuyển khoản
                </div>
                <div className="space-y-3">
                  <BankRow label="Ngân hàng" value={BANK.name} />
                  <BankRow
                    label="Số tài khoản"
                    value={BANK.account}
                    onCopy={() => copyText(BANK.account, "account")}
                    copied={copied === "account"}
                  />
                  <BankRow label="Chủ tài khoản" value={BANK.holder} />
                  {invoice?.giam_gia > 0 && (
                    <div className="flex items-center justify-between py-3 border-b border-border border-dashed">
                      <div className="text-sm text-muted-foreground italic">Giảm giá thành viên VIP</div>
                      <div className="text-sm font-bold text-primary">-{formatVND(invoice.giam_gia)}</div>
                    </div>
                  )}
                  <BankRow
                    label="Số tiền"
                    value={formatVND(amount)}
                    big
                    onCopy={() => copyText(String(amount), "amount")}
                    copied={copied === "amount"}
                  />
                  <BankRow
                    label="Nội dung"
                    value={desc}
                    onCopy={() => copyText(desc, "desc")}
                    copied={copied === "desc"}
                  />
                </div>
                <div className="mt-4 p-3.5 rounded-2xl bg-accent/10 border border-accent/20 text-xs text-accent">
                  <strong>Mẹo:</strong> Quét QR sẽ tự động điền đúng Số tài khoản, Số tiền và Nội dung.
                </div>
              </div>
            </div>

            {/* KHỐI TẢI ẢNH XÁC NHẬN CHUYỂN KHOẢN BẰNG AI VISION */}
            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                  <h3 className="font-display font-bold text-foreground text-lg">
                    Xác nhận tự động tức thì bằng AI
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold w-fit">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Đối soát tự động • Kích hoạt trong 3s
                </span>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                Chuyển khoản xong, bạn chỉ cần tải ảnh chụp màn hình biên lai từ app ngân hàng. Hệ thống AI sẽ tự
                động kiểm tra <strong>Tên người nhận (SAN BONG UIT)</strong>, <strong>Số tiền ({formatVND(amount)})</strong>{" "}
                và <strong>Mã đặt sân ({booking.ma_dat_san})</strong> để kích hoạt đơn ngay lập tức!
              </p>

              <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileSelect} className="hidden" />

              {!receiptPreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-primary/30 hover:border-primary/70 bg-primary/5 hover:bg-primary/10 rounded-3xl p-6 text-center cursor-pointer transition-all duration-200 group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div className="font-semibold text-foreground text-sm mb-1">
                    Nhấn để chọn ảnh biên lai chuyển khoản (hoặc chụp ảnh từ điện thoại)
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hỗ trợ định dạng JPG, PNG, WEBP (chụp rõ màn hình chuyển tiền thành công)
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-3xl bg-secondary/40 border border-border">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative w-28 h-28 rounded-2xl overflow-hidden border border-border shadow-md shrink-0 bg-black/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={receiptPreview} alt="Biên lai chuyển khoản" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={handleClearFile}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                        title="Đổi ảnh khác"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex-1 w-full text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-2 font-semibold text-foreground text-sm mb-1">
                        <FileImage className="w-4 h-4 text-primary" />
                        <span className="truncate max-w-[240px]">{receiptFile?.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Kích thước: {Math.round((receiptFile?.size || 0) / 1024)} KB • Đã sẵn sàng đối soát
                      </p>

                      <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                        <button
                          type="button"
                          onClick={handleVerifyReceipt}
                          disabled={verifying}
                          className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl shadow-md shadow-primary/20 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                          {verifying ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>AI đang đọc biên lai & đối soát...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>Xác thực hóa đơn & Kích hoạt đơn</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={verifying}
                          className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors"
                        >
                          Chọn ảnh khác
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {verifyFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-4 p-4 rounded-2xl border ${
                    verifyFeedback.success
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-destructive/10 border-destructive/20 text-destructive"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {verifyFeedback.success ? (
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 text-sm">
                      <div className="font-bold mb-1">
                        {verifyFeedback.success ? "Đối soát thành công!" : "Đối soát chưa khớp thông tin"}
                      </div>
                      <p className="opacity-90 mb-2">{verifyFeedback.message}</p>

                      {verifyFeedback.checks && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-current/10 text-xs">
                          <div className="flex items-center gap-1.5">
                            {verifyFeedback.checks.name_ok ? "✅" : "❌"}
                            <span>Người nhận: {verifyFeedback.checks.name_ok ? "Đúng SAN BONG UIT" : "Chưa khớp"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {verifyFeedback.checks.amount_ok ? "✅" : "❌"}
                            <span>
                              Số tiền:{" "}
                              {verifyFeedback.checks.amount_ok
                                ? "Đủ số tiền"
                                : `Chỉ nhận ${formatVND(verifyFeedback.details?.transferred_amount || 0)}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {verifyFeedback.checks.content_ok ? "✅" : "❌"}
                            <span>Nội dung: {verifyFeedback.checks.content_ok ? "Đúng mã đặt sân" : "Thiếu mã đặt sân"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {!claimed ? (
              <div className="mt-8 pt-6 border-t border-border flex flex-col items-center">
                <div className="text-xs text-muted-foreground mb-3 text-center">
                  Nếu không thể gửi ảnh biên lai, bạn vẫn có thể báo đã chuyển khoản thủ công để nhân viên kiểm tra:
                </div>
                <button
                  type="button"
                  onClick={confirmPaid}
                  disabled={submitting || verifying}
                  className="px-6 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground text-sm font-semibold rounded-xl border border-border disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang xử lý...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                      <span>Tôi đã chuyển khoản (Chờ nhân viên duyệt tay)</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="mt-6 p-4 rounded-2xl bg-accent/10 border border-accent/20 text-center">
                <p className="text-sm font-semibold text-accent mb-1">Đã ghi nhận thông báo chuyển khoản thủ công</p>
                <p className="text-xs text-muted-foreground">
                  Nhân viên đang tiến hành kiểm tra giao dịch của bạn. Bạn cũng có thể tải ảnh biên lai ở trên để
                  kích hoạt sân ngay tức thì mà không cần đợi.
                </p>
              </div>
            )}
          </motion.div>
        )}

        {!isConfirmed && (
          <p className="text-xs text-center text-muted-foreground mt-6">
            Sau khi bấm <strong>Đã thanh toán</strong>, đơn sẽ chuyển sang trạng thái <em>chờ nhân viên xác nhận</em>.
          </p>
        )}
      </div>
    </>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
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

function BankRow({
  label,
  value,
  big,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  big?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <div
          className={
            big ? "text-xl font-display font-bold text-primary" : "font-semibold text-foreground text-right"
          }
        >
          {value}
        </div>
        {onCopy && (
          <button onClick={onCopy} className="p-2 rounded-xl hover:bg-secondary transition-colors" title="Copy">
            {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
          </button>
        )}
      </div>
    </div>
  );
}
