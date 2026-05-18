"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, User, Mail, Phone, Lock, ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { apiPost, setToken, setUser } from "@/lib/api";

const BENEFITS = [
  "Đặt sân online 24/7",
  "Tích lũy điểm thưởng",
  "Ưu đãi thành viên VIP",
  "Quản lý lịch đặt dễ dàng",
];

export default function RegisterPage() {
  const [form, setForm] = useState({ ho_ten: "", email: "", sdt: "", mat_khau: "" });
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function up(k: string, v: string) { setForm((s) => ({ ...s, [k]: v })); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.email.toLowerCase().endsWith("@gmail.com")) {
      setErr("Vui lòng dùng email Gmail (@gmail.com)");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/api/auth/register", form);
      setToken(res.access_token);
      setUser(res.user);
      router.push("/booking");
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-background">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-md">
          <Link href="/" className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="font-display font-bold text-2xl text-foreground">KICKOFF</div>
          </Link>
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground mb-2">Tạo tài khoản</h2>
          <p className="text-muted-foreground mb-8">Đăng ký miễn phí để đặt sân online 24/7</p>

          <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
            <FormField label="Họ và tên" icon={<User className="w-5 h-5" />}>
              <input type="text" required value={form.ho_ten} onChange={(e) => up("ho_ten", e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-input bg-background text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                placeholder="Nguyễn Văn A" />
            </FormField>

            <FormField label="Email (Gmail)" icon={<Mail className="w-5 h-5" />}>
              <input type="email" required value={form.email} onChange={(e) => up("email", e.target.value)} pattern=".+@gmail\.com"
                className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-input bg-background text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                placeholder="ban@gmail.com" />
            </FormField>

            <FormField label="Số điện thoại" icon={<Phone className="w-5 h-5" />}>
              <input type="tel" required value={form.sdt} onChange={(e) => up("sdt", e.target.value)} pattern="0\d{9}" maxLength={10}
                className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-input bg-background text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                placeholder="0901234567" />
            </FormField>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Mật khẩu (≥8 ký tự, có chữ và số) <span className="text-destructive">*</span></label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input type={showPw ? "text" : "password"} required minLength={8} value={form.mat_khau} onChange={(e) => up("mat_khau", e.target.value)}
                  className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-input bg-background text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {err && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{err}</motion.div>
            )}

            <button type="submit" disabled={loading} className="w-full py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
              {loading ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Đang tạo...</span></>
              ) : (
                <><span>Đăng ký</span><ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          <p className="text-center text-muted-foreground mt-8">
            Đã có tài khoản?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">Đăng nhập</Link>
          </p>
        </motion.div>
      </div>

      <div className="hidden lg:flex flex-1 bg-sidebar relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-40 left-20 w-72 h-72 bg-primary/30 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="font-display font-bold text-2xl text-white">KICKOFF</div>
          </Link>
          <div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h1 className="text-5xl lg:text-6xl font-display font-bold text-white leading-tight mb-6">
                Tham gia<br /><span className="text-primary">cộng đồng</span> ⚽
              </h1>
              <p className="text-white/60 text-lg max-w-md leading-relaxed mb-8">
                Hơn 10,000 người chơi đã tin tưởng KICKOFF để đặt sân mỗi ngày.
              </p>
              <div className="space-y-3">
                {BENEFITS.map((benefit, i) => (
                  <motion.div key={benefit} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1 }} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-white/80">{benefit}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
          <div className="text-sm text-white/40">Hệ thống đặt sân bóng đá thông minh</div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground mb-2">
        {label} <span className="text-destructive">*</span>
      </label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</div>
        {children}
      </div>
    </div>
  );
}
