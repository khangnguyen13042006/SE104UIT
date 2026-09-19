"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import HeroPitch3D from "@/components/HeroPitch3D";
import { getUser } from "@/lib/api";
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
  const router = useRouter();

  // Hàm kiểm tra đăng nhập khi bấm Đặt sân
  const handleBookingClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const user = getUser();
    if (!user) {
      alert("Vui lòng đăng nhập tài khoản để tiếp tục đặt sân!");
      router.push("/login");
    } else {
      router.push("/booking");
    }
  };

  return (
    <>
      <Navbar />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-3xl opacity-60" />
          <div className="absolute bottom-0 left-0 w-[450px] h-[450px] bg-gradient-to-tr from-accent/20 to-transparent rounded-full blur-3xl opacity-60" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-6 shadow-sm">
                <Sparkles className="w-4 h-4 animate-spin-slow" /><span>Ứng dụng đặt sân bóng hiện đại #1</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-foreground leading-[1.1] mb-6 tracking-tight">
                Đặt sân bóng<br />
                <span className="gradient-text">nhanh & tiện lợi</span>
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground mb-8 leading-relaxed max-w-lg">
                Xem lịch trống real-time, chọn sân trực quan 3D, thanh toán QR siêu tốc — chỉ trong 3 bước. Không gọi điện, không chờ xác nhận.
              </p>
              <div className="flex flex-wrap gap-4">
                <button 
                  onClick={handleBookingClick} 
                  className="group inline-flex items-center gap-2.5 px-7 py-4 bg-primary text-primary-foreground rounded-2xl font-bold shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-105 active:scale-95 transition-all duration-300"
                >
                  <span>Đặt sân ngay</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                
                <Link href="/register" className="inline-flex items-center gap-2 px-6 py-4 border-2 border-border/80 bg-card/50 backdrop-blur-sm text-foreground rounded-2xl font-semibold hover:bg-secondary hover:border-primary/40 transition-all duration-300">
                  Đăng ký thành viên
                </Link>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-10 pt-8 border-t border-border/80">
                {STATS.map((stat, i) => (
                  <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}>
                    <div className="font-display text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{stat.value}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            
            {/* 3D Interactive Stadium on Homepage */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              transition={{ duration: 0.7, delay: 0.15 }} 
              className="relative w-full"
            >
              <HeroPitch3D />
              <div className="absolute -top-6 -right-6 w-32 h-32 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-6 -left-6 w-36 h-36 bg-accent/20 rounded-full blur-3xl pointer-events-none" />
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
                {/* Đã thay đổi thẻ Link thành Button gọi hàm kiểm tra */}
                <button 
                  onClick={handleBookingClick} 
                  className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-sidebar rounded-2xl font-semibold hover:bg-white/90 transition-colors"
                >
                  <Zap className="w-5 h-5" /><span>Đặt sân ngay</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                
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
