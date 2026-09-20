"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getUser, clearToken } from "@/lib/api";
import { useApi, prefetch, clearApiCache } from "@/lib/useApi";
import {
  LayoutDashboard, Calendar, MapPin, Package, Users, ClipboardList,
  Star, ShieldAlert, FileBarChart, LogOut, Menu, X, Zap, ChevronRight, Bell,
  CheckCircle2, Clock, AlertCircle, UserCog, Check, CheckCheck
} from "lucide-react";

// Dữ liệu các trang quản trị hay vào — tải trước khi rê chuột vào menu để chuyển trang là có ngay
const PREFETCH: Record<string, string[]> = {
  "/admin": ["/api/reports/today"],
  "/admin/bookings": ["/api/bookings", "/api/fields", "/api/services"],
  "/admin/fields": ["/api/fields"],
  "/admin/services": ["/api/services"],
  "/admin/users": ["/api/users"],
  "/admin/staff": ["/api/shifts", "/api/fields"],
  "/admin/shifts": ["/api/shifts", "/api/users?vai_tro=NHAN_VIEN", "/api/fields"],
  "/admin/feedbacks": ["/api/feedbacks"],
};

const MENU = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard", roles: ["ADMIN", "QUAN_LY", "NHAN_VIEN"] },
  { href: "/admin/bookings", icon: Calendar, label: "Lịch Đặt Sân", roles: ["ADMIN", "QUAN_LY", "NHAN_VIEN"] },
  { href: "/admin/fields", icon: MapPin, label: "Quản Lý Sân", roles: ["ADMIN", "QUAN_LY"] },
  { href: "/admin/services", icon: Package, label: "Dịch Vụ", roles: ["ADMIN", "QUAN_LY"] },
  { href: "/admin/users", icon: Users, label: "Tài Khoản", roles: ["ADMIN"] },
  { href: "/admin/staff", icon: UserCog, label: "Nhân Viên", roles: ["ADMIN", "QUAN_LY"] },
  { href: "/admin/shifts", icon: ClipboardList, label: "Phân Ca", roles: ["ADMIN", "QUAN_LY", "NHAN_VIEN"] },
  { href: "/admin/feedbacks", icon: Star, label: "Đánh Giá", roles: ["ADMIN", "QUAN_LY"] },
  { href: "/admin/reports", icon: FileBarChart, label: "Báo Cáo", roles: ["ADMIN", "QUAN_LY"] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setU] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const pathname = usePathname();
  const notifRef = useRef<HTMLDivElement>(null);

  // 1 request duy nhất cho cả 3 nhóm thông báo, tự làm mới mỗi 60s
  const { data: groups, loading: notifLoading } = useApi<any>(user ? "/api/notifications" : null, 60000);
  const allNotifs: any[] = useMemo(
    () => [...(groups?.dat_san || []), ...(groups?.dich_vu || []), ...(groups?.danh_gia || []), ...(groups?.khac || [])],
    [groups]
  );
  const unreadCount = allNotifs.filter((n) => !readIds.has(n.id)).length;

  useEffect(() => {
    const u = getUser();
    if (!u || !["ADMIN", "QUAN_LY", "NHAN_VIEN"].includes(u.vai_tro)) {
      router.push("/login");
      return;
    }
    setU(u);
    try {
      setReadIds(new Set(JSON.parse(localStorage.getItem(`notif_read_${u.id}`) || "[]")));
    } catch {}
  }, [router]);

  // Trạng thái đã đọc lưu theo từng tài khoản trong localStorage (id thông báo có kèm phiên bản
  // nội dung nên khi nội dung đổi, thông báo sẽ hiện lại là chưa đọc)
  function persistRead(next: Set<string>) {
    setReadIds(next);
    try {
      localStorage.setItem(`notif_read_${user.id}`, JSON.stringify(Array.from(next).slice(-500)));
    } catch {}
  }
  function markRead(id: string) {
    if (readIds.has(id)) return;
    persistRead(new Set(readIds).add(id));
  }
  function markAllRead() {
    persistRead(new Set([...readIds, ...allNotifs.map((n) => n.id)]));
  }

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

  function logout() { clearToken(); clearApiCache(); router.push("/"); }

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
                onMouseEnter={() => (PREFETCH[m.href] || []).forEach(prefetch)}
                onTouchStart={() => (PREFETCH[m.href] || []).forEach(prefetch)}
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
              <NotifDropdown open={notifOpen} groups={groups || {}} loading={notifLoading} onClose={() => setNotifOpen(false)}
                readIds={readIds} onRead={markRead} onReadAll={markAllRead} unreadCount={unreadCount} />
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
              <NotifList groups={groups || {}} loading={notifLoading} onClose={() => setNotifOpen(false)}
                readIds={readIds} onRead={markRead} onReadAll={markAllRead} unreadCount={unreadCount} />
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

const GROUPS = [
  { key: "dat_san", label: "Đặt sân", icon: Calendar },
  { key: "dich_vu", label: "Dịch vụ & Ca", icon: Package },
  { key: "danh_gia", label: "Đánh giá", icon: Star },
  { key: "khac", label: "Khác", icon: ShieldAlert },
] as const;

type GroupKey = (typeof GROUPS)[number]["key"];

function NotifDropdown({ open, ...rest }: any) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          className="absolute right-0 top-full mt-2 w-[420px] max-w-[calc(100vw-2rem)] z-50">
          <NotifList {...rest} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NotifList({ groups, onClose, readIds, onRead, onReadAll, unreadCount, loading }: any) {
  const [tab, setTab] = useState<GroupKey>("dat_san");
  const items: any[] = groups[tab] || [];
  const unreadOf = (key: GroupKey) => (groups[key] || []).filter((n: any) => !readIds.has(n.id)).length;

  return (
    <div className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-bold text-foreground">Thông báo</h3>
          <p className="text-xs text-muted-foreground">
            {loading ? "Đang tải..." : unreadCount > 0 ? `${unreadCount} chưa đọc` : "Đã đọc hết"}
          </p>
        </div>
        {unreadCount > 0 ? (
          <button onClick={onReadAll}
            className="flex items-center gap-1 text-xs font-semibold text-primary px-3 py-1.5 rounded-xl hover:bg-primary/10 transition-colors shrink-0">
            <CheckCheck className="w-4 h-4" /> Đã đọc hết
          </button>
        ) : (
          <Bell className="w-5 h-5 text-primary" />
        )}
      </div>

      {/* 4 nhóm: Đặt sân • Dịch vụ & Ca trực • Đánh giá thấp • Khác (vận hành, nhân sự, bảo mật) */}
      <div className="flex gap-1 p-2 bg-secondary/40 border-b border-border">
        {GROUPS.map((g) => {
          const n = unreadOf(g.key);
          const Icon = g.icon;
          const active = tab === g.key;
          return (
            <button key={g.key} onClick={() => setTab(g.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold transition-all ${
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3.5 h-3.5" />
              <span className="truncate">{g.label}</span>
              {n > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
                  {n > 9 ? "9+" : n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {tab === "dat_san" ? "Không có đơn nào cần xử lý"
                : tab === "dich_vu" ? "Dịch vụ và ca trực đều ổn"
                : tab === "khac" ? "Không có cảnh báo vận hành hay bảo mật"
                : "Không có đánh giá thấp"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((n: any) => {
              const isRead = readIds.has(n.id);
              return (
                <div key={n.id}
                  className={`flex items-start gap-1 transition-colors ${
                    isRead ? "opacity-60 hover:opacity-100" : "bg-primary/5 border-l-4 border-l-primary"
                  }`}>
                  <Link href={n.href} onClick={() => { onRead(n.id); onClose(); }}
                    className="flex-1 min-w-0 block p-4 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center text-lg ${
                        n.urgent ? "bg-destructive/10" : "bg-primary/10"
                      }`}>
                        {n.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-foreground text-sm ${isRead ? "font-medium" : "font-bold"}`}>{n.title}</span>
                          {n.urgent && <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
                          {!isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{n.desc}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(n.time + "Z").toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                  {!isRead && (
                    <button onClick={() => onRead(n.id)} title="Xác nhận đã đọc"
                      className="m-3 p-2 rounded-xl text-primary hover:bg-primary/10 transition-colors shrink-0">
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
