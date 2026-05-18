"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, getUser, clearToken, formatVND } from "@/lib/api";
import {
  LayoutDashboard, Calendar, MapPin, Package, Users, ClipboardList,
  Star, FileBarChart, LogOut, Menu, X, Zap, ChevronRight, Bell,
  CheckCircle2, Clock, AlertCircle
} from "lucide-react";

const MENU = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard", roles: ["ADMIN", "QUAN_LY", "NHAN_VIEN"] },
  { href: "/admin/bookings", icon: Calendar, label: "Lịch Đặt Sân", roles: ["ADMIN", "QUAN_LY", "NHAN_VIEN"] },
  { href: "/admin/fields", icon: MapPin, label: "Quản Lý Sân", roles: ["ADMIN", "QUAN_LY"] },
  { href: "/admin/services", icon: Package, label: "Dịch Vụ", roles: ["ADMIN", "QUAN_LY"] },
  { href: "/admin/users", icon: Users, label: "Tài Khoản", roles: ["ADMIN"] },
  { href: "/admin/shifts", icon: ClipboardList, label: "Phân Ca", roles: ["ADMIN", "QUAN_LY", "NHAN_VIEN"] },
  { href: "/admin/feedbacks", icon: Star, label: "Đánh Giá", roles: ["ADMIN", "QUAN_LY"] },
  { href: "/admin/reports", icon: FileBarChart, label: "Báo Cáo", roles: ["ADMIN", "QUAN_LY"] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setU] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getUser();
    if (!u || !["ADMIN", "QUAN_LY", "NHAN_VIEN"].includes(u.vai_tro)) {
      router.push("/login");
      return;
    }
    setU(u);
  }, [router]);

  // Load notifications: bookings CHO_XAC_NHAN + feedbacks dưới 3 sao
  async function loadNotifs() {
    if (!user) return;
    try {
      const tasks: any[] = [
        apiGet("/api/bookings?trang_thai=CHO_XAC_NHAN").catch(() => []),
      ];
      if (["ADMIN", "QUAN_LY"].includes(user.vai_tro)) {
        tasks.push(apiGet("/api/feedbacks?max_star=2").catch(() => []));
      }
      const [pendingBookings, badFeedbacks] = await Promise.all(tasks);

      const items: any[] = [];
      (pendingBookings || []).slice(0, 10).forEach((b: any) => {
        items.push({
          id: `b-${b.id}`,
          type: "booking",
          icon: "📅",
          title: `Booking chờ xác nhận`,
          desc: `${b.ten_san} • ${b.ten_khach || "khách"} • ${formatVND(b.tien_san)}`,
          time: b.ngay_tao,
          href: "/admin/bookings",
          urgent: false,
        });
      });
      (badFeedbacks || []).slice(0, 5).forEach((f: any) => {
        items.push({
          id: `f-${f.id}`,
          type: "feedback",
          icon: "⚠️",
          title: `Đánh giá thấp (${f.danh_gia_tong}/5)`,
          desc: `${f.ten_khach || "Khách"} đánh giá ${f.ten_san}`,
          time: f.ngay_tao,
          href: "/admin/feedbacks",
          urgent: true,
        });
      });

      items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setNotifs(items);
      setUnreadCount(items.length);
    } catch {}
  }

  useEffect(() => {
    if (user) {
      loadNotifs();
      const interval = setInterval(loadNotifs, 60000); // refresh every 60s
      return () => clearInterval(interval);
    }
  }, [user]);

  // Close notif dropdown when click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen]);

  function logout() { clearToken(); router.push("/"); }

  if (!user) return null;
  const items = MENU.filter((m) => m.roles.includes(user.vai_tro));

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-40 w-72 h-screen bg-sidebar text-sidebar-foreground flex flex-col
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} 
        lg:translate-x-0 transition-transform duration-300
      `}>
        <div className="p-6 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-xl leading-none">KICKOFF</div>
              <div className="text-xs text-sidebar-foreground/50 mt-0.5">Admin Panel</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {items.map((m) => {
            const active = pathname === m.href || (m.href !== "/admin" && pathname.startsWith(m.href));
            const Icon = m.icon;
            return (
              <Link key={m.href} href={m.href} onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-primary/20"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}>
                <Icon className="w-5 h-5" />
                <span className="flex-1">{m.label}</span>
                {active && <ChevronRight className="w-4 h-4" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="p-4 rounded-2xl bg-sidebar-accent mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <span className="text-white font-bold text-sm">{user.ho_ten?.charAt(0)?.toUpperCase() || "U"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sidebar-foreground truncate">{user.ho_ten}</div>
                <div className="text-xs text-sidebar-foreground/50">{user.vai_tro}</div>
              </div>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-all">
            <LogOut className="w-5 h-5" /><span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden" />
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex-1 lg:ml-72 flex flex-col min-h-screen min-w-0">
        {/* Mobile Header */}
        <div className="lg:hidden bg-sidebar text-sidebar-foreground p-4 flex items-center justify-between sticky top-0 z-30">
          <Link href="/admin" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-none">KICKOFF</div>
              <div className="text-[10px] text-sidebar-foreground/50">Admin</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {/* Notification (mobile) */}
            <button onClick={() => setNotifOpen(!notifOpen)} className="relative p-2 rounded-xl hover:bg-sidebar-accent">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-xl hover:bg-sidebar-accent">
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Desktop Top Bar */}
        <div className="hidden lg:flex items-center justify-between p-6 border-b border-border bg-card sticky top-0 z-20">
          <div className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative" ref={notifRef}>
              <button onClick={() => setNotifOpen(!notifOpen)} className="relative p-2 rounded-xl hover:bg-secondary transition-colors">
                <Bell className="w-5 h-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <NotifDropdown open={notifOpen} notifs={notifs} onClose={() => setNotifOpen(false)} />
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-secondary">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <span className="text-white font-bold text-xs">{user.ho_ten?.charAt(0)?.toUpperCase() || "U"}</span>
              </div>
              <span className="text-sm font-medium text-foreground">{user.ho_ten}</span>
            </div>
          </div>
        </div>

        {/* Mobile notification dropdown overlay */}
        <AnimatePresence>
          {notifOpen && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="lg:hidden mx-4 mt-2 z-30">
              <NotifList notifs={notifs} onClose={() => setNotifOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function NotifDropdown({ open, notifs, onClose }: any) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] z-50">
          <NotifList notifs={notifs} onClose={onClose} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NotifList({ notifs, onClose }: any) {
  return (
    <div className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-foreground">Thông báo</h3>
          <p className="text-xs text-muted-foreground">{notifs.length} mục cần chú ý</p>
        </div>
        <Bell className="w-5 h-5 text-primary" />
      </div>
      <div className="max-h-96 overflow-y-auto">
        {notifs.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Không có thông báo mới</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifs.map((n: any) => (
              <Link key={n.id} href={n.href} onClick={onClose}
                className="block p-4 hover:bg-secondary/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center text-lg ${
                    n.urgent ? "bg-destructive/10" : "bg-primary/10"
                  }`}>
                    {n.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-foreground text-sm">{n.title}</span>
                      {n.urgent && <AlertCircle className="w-3 h-3 text-destructive" />}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.desc}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(n.time).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
