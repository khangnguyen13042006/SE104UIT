"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { 
  ArrowRight, Calendar, Clock, Shield, Star, 
  Zap, Users, MapPin, Sparkles, ChevronRight
} from "lucide-react";

const FEATURES = [
  { icon: Calendar, title: "Đặt Online 24/7", desc: "Xem lịch trống và đặt sân bất kỳ lúc nào, mọi nơi.", color: "from-primary to-primary/60" },
  { icon: Shield, title: "Thanh Toán An Toàn", desc: "QR ngân hàng, hóa đơn rõ ràng minh bạch.", color: "from-accent to-accent/60" },
  { icon: Clock, title: "Khung Giờ Linh Hoạt", desc: "Slot từ 30 phút đến 3 giờ, dễ chọn theo lịch.", color: "from-chart-3 to-chart-3/60" },
  { icon: Star, title: "Thẻ Thành Viên", desc: "Ưu đãi 5-15% cho thành viên thân thiết.", color: "from-chart-4 to-chart-4/60" },
];

const STATS = [
  { value: "50+", label: "Sân bóng" },
  { value: "10K+", label: "Lượt đặt" },
  { value: "4.8", label: "Đánh giá" },
  { value: "24/7", label: "Hỗ trợ" },
];

export default function HomePage() {
  return (
    <>
      <Navbar />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-accent/20 to-transparent rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4" /><span>Ứng dụng đặt sân #1 Việt Nam</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-foreground leading-[1.1] mb-6 text-balance">
                Đặt sân bóng<br />
                <span className="gradient-text">nhanh & tiện lợi</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-lg">
                Xem lịch trống real-time, chọn khung giờ, thanh toán QR — chỉ trong 3 bước. Không gọi điện, không chờ xác nhận.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/booking" className="group inline-flex items-center gap-2 px-6 py-4 bg-primary text-primary-foreground rounded-2xl font-semibold shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:scale-105 transition-all duration-300">
                  <span>Đặt sân ngay</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/register" className="inline-flex items-center gap-2 px-6 py-4 border-2 border-border text-foreground rounded-2xl font-semibold hover:bg-secondary hover:border-primary/20 transition-all duration-300">
                  Đăng ký thành viên
                </Link>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-12 pt-8 border-t border-border">
                {STATS.map((stat, i) => (
                  <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}>
                    <div className="font-display text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="relative">
              <div className="relative aspect-square lg:aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl shadow-primary/20">
                <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/80">
                  <div className="absolute inset-4 border-2 border-white/30 rounded-xl" />
                  <div className="absolute inset-y-4 left-1/2 w-px bg-white/30" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white/30 rounded-full" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/50 rounded-full" />
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-32 h-12 border-2 border-white/30 border-t-0 rounded-b-xl" />
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-32 h-12 border-2 border-white/30 border-b-0 rounded-t-xl" />
                </div>
                <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute top-8 right-8 text-6xl">⚽</motion.div>
                <div className="absolute bottom-4 left-4 right-4 p-4 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary rounded-full pulse-dot" />
                      <span className="text-sm font-medium text-primary">Đang có sẵn</span>
                    </div>
                    <div className="flex items-center gap-1 text-accent">
                      <Star className="w-4 h-4 fill-accent" /><span className="text-sm font-semibold">4.8</span>
                    </div>
                  </div>
                  <div className="font-display font-bold text-lg text-foreground mb-1">Sân Bóng Đá Premium</div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />TP.HCM</span>
                    <span className="flex items-center gap-1"><Users className="w-4 h-4" />5v5, 7v7</span>
                  </div>
                </div>
              </div>
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-accent/20 rounded-full blur-2xl" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-primary/20 rounded-full blur-2xl" />
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-background to-secondary/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Vì sao chọn <span className="gradient-text">KICKOFF</span>?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Trải nghiệm đặt sân hiện đại, nhanh chóng và tiện lợi nhất</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div key={feature.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }} className="group p-6 bg-card rounded-2xl border border-border card-hover cursor-pointer">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-display font-bold text-lg text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sidebar via-sidebar to-sidebar/90 p-8 md:p-12 lg:p-16">
            <div className="absolute inset-0">
              <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            </div>
            <div className="relative flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="text-center lg:text-left">
                <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">Sẵn sàng ra sân?</h2>
                <p className="text-white/70 max-w-lg">Đăng ký ngay để nhận ưu đãi 10% cho lần đặt sân đầu tiên. Chỉ mất 30 giây!</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/booking" className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-sidebar rounded-2xl font-semibold hover:bg-white/90 transition-colors">
                  <Zap className="w-5 h-5" /><span>Đặt sân ngay</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/register" className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-white/30 text-white rounded-2xl font-semibold hover:bg-white/10 transition-colors">
                  Tạo tài khoản
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border py-8 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-display font-bold text-foreground">KICKOFF</div>
                <div className="text-xs text-muted-foreground">Sân Bóng Đá Online</div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">© 2024 KICKOFF. Made with ❤️ for football lovers.</div>
          </div>
        </div>
      </footer>
    </>
  );
}
