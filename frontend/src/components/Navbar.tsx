"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getUser, clearToken } from "@/lib/api";
import { LogOut, User, Menu, X, Zap } from "lucide-react";

export default function Navbar() {
  const [user, setU] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { setU(getUser()); }, [pathname]);

  function logout() { clearToken(); setU(null); router.push("/"); }

  const isAdmin = user && ["ADMIN", "QUAN_LY", "NHAN_VIEN"].includes(user.vai_tro);

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-xl text-foreground">KICKOFF</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink href="/" current={pathname}>Trang chủ</NavLink>
          <NavLink href="/booking" current={pathname}>Đặt sân</NavLink>
          <NavLink href="/feedback" current={pathname}>Đánh giá</NavLink>
          {user && <NavLink href="/my-bookings" current={pathname}>Lịch của tôi</NavLink>}
          {user && <NavLink href="/membership" current={pathname}>Thẻ thành viên</NavLink>}
          {isAdmin && <NavLink href="/admin" current={pathname}>Quản trị</NavLink>}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-secondary">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <span className="text-white font-bold text-xs">{user.ho_ten?.charAt(0)?.toUpperCase() || "U"}</span>
                </div>
                <span className="text-sm font-medium text-foreground">{user.ho_ten}</span>
              </div>
              <button onClick={logout} className="p-2 rounded-xl hover:bg-secondary transition-colors" title="Đăng xuất">
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary rounded-2xl transition-colors">Đăng nhập</Link>
              <Link href="/register" className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-2xl hover:bg-primary/90 transition-colors">Đăng ký</Link>
            </>
          )}
        </div>

        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 rounded-xl hover:bg-secondary transition-colors">
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border bg-background p-3 space-y-1 overflow-hidden">
            <Link href="/" className="block px-4 py-3 rounded-2xl hover:bg-secondary text-foreground">Trang chủ</Link>
            <Link href="/booking" className="block px-4 py-3 rounded-2xl hover:bg-secondary text-foreground">Đặt sân</Link>
            <Link href="/feedback" className="block px-4 py-3 rounded-2xl hover:bg-secondary text-foreground">Đánh giá</Link>
            {user && <Link href="/my-bookings" className="block px-4 py-3 rounded-2xl hover:bg-secondary text-foreground">Lịch của tôi</Link>}
            {user && <Link href="/membership" className="block px-4 py-3 rounded-2xl hover:bg-secondary text-foreground">Thẻ thành viên</Link>}
            {isAdmin && <Link href="/admin" className="block px-4 py-3 rounded-2xl hover:bg-secondary text-foreground">Quản trị</Link>}
            {user ? (
              <button onClick={logout} className="w-full text-left px-4 py-3 rounded-2xl hover:bg-destructive/10 text-destructive">
                Đăng xuất ({user.ho_ten})
              </button>
            ) : (
              <>
                <Link href="/login" className="block px-4 py-3 rounded-2xl hover:bg-secondary text-foreground">Đăng nhập</Link>
                <Link href="/register" className="block px-4 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">Đăng ký</Link>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function NavLink({ href, current, children }: { href: string; current: string; children: React.ReactNode }) {
  const active = current === href || (href !== "/" && current.startsWith(href));
  return (
    <Link href={href} className={`px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
    }`}>{children}</Link>
  );
}
