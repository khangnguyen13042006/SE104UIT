"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { apiPost, setToken, setUser } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [matKhau, setMK] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const isStaffEmail = email.toLowerCase().endsWith("@sanbong.vn");
    if (!isStaffEmail && !email.toLowerCase().endsWith("@gmail.com")) {
      setErr("Vui lòng dùng email Gmail (@gmail.com)");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/api/auth/login", { email, mat_khau: matKhau });
      setToken(res.access_token);
      setUser(res.user);
      if (["ADMIN", "QUAN_LY", "NHAN_VIEN"].includes(res.user.vai_tro)) router.push("/admin");
      else router.push("/booking");
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex flex-1 bg-sidebar relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-20 right-20 w-72 h-72 bg-primary/30 rounded-full blur-3xl" />
          <div className="absolute bottom-40 left-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
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
                Chào mừng<br /><span className="text-primary">trở lại</span> ⚽
              </h1>
              <p className="text-white/60 text-lg max-w-md leading-relaxed">
                Đăng nhập để xem lịch đặt, quản lý booking và nhận ưu đãi từ thẻ thành viên.
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="mt-12 p-6 bg-white/10 backdrop-blur-xl rounded-3xl border border-white/10 max-w-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Ưu đãi hôm nay</div>
                  <div className="text-xs text-white/60">Giảm 15% cho thành viên VIP</div>
                </div>
              </div>
              <div className="text-2xl font-display font-bold text-primary">-15%</div>
            </motion.div>
          </div>
          <div className="text-sm text-white/40">Hệ thống đặt sân bóng đá thông minh</div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-background">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-md">
          <Link href="/" className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="font-display font-bold text-2xl text-foreground">KICKOFF</div>
          </Link>
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground mb-2">Đăng nhập</h2>
          <p className="text-muted-foreground mb-8">Sử dụng tài khoản của bạn để tiếp tục</p>

          <form onSubmit={onSubmit} className="space-y-5" autoComplete="off">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Email (Gmail)</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off"
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-input bg-background text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                  placeholder="ban@gmail.com" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input type={showPw ? "text" : "password"} required value={matKhau} onChange={(e) => setMK(e.target.value)} autoComplete="new-password"
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
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Đang xử lý...</span></>
              ) : (
                <><span>Đăng nhập</span><ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          <p className="text-center text-muted-foreground mt-8">
            Chưa có tài khoản?{" "}
            <Link href="/register" className="text-primary font-semibold hover:underline">Đăng ký ngay</Link>
          </p>
          <p className="text-center text-xs text-muted-foreground mt-4">Email phải có đuôi <strong>@gmail.com</strong></p>
        </motion.div>
      </div>
    </div>
  );
}
