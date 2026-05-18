"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { apiGet, formatVND, getUser } from "@/lib/api";
import { Loader2, Check, Sparkles, TrendingUp } from "lucide-react";

type TierInfo = {
  code: "THUONG" | "BAC" | "VANG" | "KIM_CUONG";
  name: string;
  discount_percent: number;
  threshold: number;
  achieved: boolean;
};

type Status = {
  tier: string;
  tier_name: string;
  discount_percent: number;
  lifetime_spend: number;
  current_threshold: number;
  next_tier: string | null;
  next_tier_name: string | null;
  next_threshold: number | null;
  remaining_to_next: number;
  progress_percent: number;
  all_tiers: TierInfo[];
};

const TIER_STYLE: Record<string, { card: string; ring: string; chip: string }> = {
  THUONG: {
    card: "from-neutral-200 via-neutral-100 to-neutral-300 text-ink-900",
    ring: "ring-neutral-400",
    chip: "bg-neutral-700 text-white",
  },
  BAC: {
    card: "from-slate-300 via-slate-100 to-slate-400 text-slate-900",
    ring: "ring-slate-500",
    chip: "bg-slate-700 text-white",
  },
  VANG: {
    card: "from-amber-300 via-yellow-200 to-amber-500 text-amber-950",
    ring: "ring-amber-500",
    chip: "bg-amber-800 text-white",
  },
  KIM_CUONG: {
    card: "from-cyan-200 via-blue-200 to-indigo-300 text-indigo-950",
    ring: "ring-indigo-500",
    chip: "bg-indigo-800 text-white",
  },
};

export default function MembershipPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.push("/login");
      return;
    }
    setUserName(u.ho_ten);
    apiGet("/api/memberships/me/status")
      .then(setStatus)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="p-16 text-center text-ink-400">
          <Loader2 className="animate-spin mx-auto mb-2" /> Đang tải...
        </div>
      </>
    );
  }

  if (err || !status) {
    return (
      <>
        <Navbar />
        <div className="max-w-md mx-auto p-6 mt-8 bg-red-50 border border-red-200 rounded text-red-700">
          {err || "Không tải được dữ liệu"}
        </div>
      </>
    );
  }

  const tierStyle = TIER_STYLE[status.tier] || TIER_STYLE.THUONG;

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-ink-900 mb-1">Thẻ thành viên của bạn</h1>
        <p className="text-ink-400 mb-6">Tier tự động cập nhật theo tổng chi tiêu — không cần đăng ký thẻ</p>

        {/* Membership Card */}
        <div className={`relative bg-gradient-to-br ${tierStyle.card} rounded-2xl p-6 md:p-8 shadow-lg overflow-hidden mb-6`}>
          {/* Decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-24 -mb-24" />

          <div className="relative">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-xs font-semibold opacity-80 mb-1">SÂN BÓNG UIT • MEMBERSHIP</div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl md:text-4xl font-bold">{status.tier_name}</span>
                  {status.tier === "KIM_CUONG" && <Sparkles size={28} className="text-indigo-700" />}
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold ${tierStyle.chip}`}>
                -{status.discount_percent}% mỗi lần đặt
              </div>
            </div>

            <div className="mb-5">
              <div className="text-xs font-semibold opacity-75 mb-1">CHỦ THẺ</div>
              <div className="text-xl font-bold">{userName.toUpperCase()}</div>
            </div>

            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs font-semibold opacity-75 mb-1">TỔNG ĐÃ CHI</div>
                <div className="text-2xl md:text-3xl font-bold">{formatVND(status.lifetime_spend)}</div>
              </div>
              <div className="text-right">
                <TrendingUp size={32} className="opacity-50 ml-auto" />
              </div>
            </div>
          </div>
        </div>

        {/* Progress to next tier */}
        {status.next_tier ? (
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 md:p-6 mb-6">
            <div className="flex items-end justify-between mb-2 flex-wrap gap-2">
              <div>
                <div className="text-sm text-ink-400">Tiến độ lên tier kế tiếp</div>
                <div className="text-xl font-bold text-ink-900">
                  Còn <span className="text-red-700">{formatVND(status.remaining_to_next)}</span> nữa lên {status.next_tier_name}
                </div>
              </div>
              <div className="text-3xl font-bold text-ink-900">{status.progress_percent}%</div>
            </div>

            {/* Progress bar */}
            <div className="relative h-3 bg-neutral-100 rounded-full overflow-hidden mb-3">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 to-red-800 rounded-full transition-all duration-500"
                style={{ width: `${status.progress_percent}%` }} />
            </div>
            <div className="flex justify-between text-xs text-ink-400">
              <span>{formatVND(status.current_threshold)}</span>
              <span>{formatVND(status.next_threshold || 0)}</span>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-indigo-50 to-cyan-50 rounded-2xl border border-indigo-200 p-6 mb-6 text-center">
            <Sparkles className="mx-auto text-indigo-600 mb-2" size={32} />
            <h3 className="text-xl font-bold text-indigo-900">Bạn đã đạt tier cao nhất!</h3>
            <p className="text-sm text-indigo-700 mt-1">Cảm ơn bạn đã đồng hành cùng chúng tôi.</p>
          </div>
        )}

        {/* All tiers milestones */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 md:p-6">
          <h2 className="text-xl font-bold text-ink-900 mb-4">Các mốc thành viên</h2>

          <div className="relative">
            {/* Track */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-neutral-200" />

            <div className="space-y-4">
              {status.all_tiers.map((tier) => {
                const isCurrent = tier.code === status.tier;
                return (
                  <div key={tier.code} className="relative flex items-start gap-4">
                    {/* Milestone dot */}
                    <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      tier.achieved
                        ? `bg-red-700 text-white ${isCurrent ? `ring-4 ${tierStyle.ring}` : ""}`
                        : "bg-neutral-200 text-neutral-400"
                    }`}>
                      {tier.achieved ? <Check size={18} /> : <span className="text-sm font-bold">{tier.discount_percent}%</span>}
                    </div>

                    <div className="flex-1 pt-1.5">
                      <div className="flex items-baseline justify-between flex-wrap gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ink-900">{tier.name}</span>
                          {isCurrent && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Hiện tại</span>}
                        </div>
                        <div className="text-sm text-ink-400">
                          {tier.threshold > 0 ? `> ${formatVND(tier.threshold)}` : "Mặc định"}
                        </div>
                      </div>
                      <div className="text-xs text-ink-400 mt-0.5">
                        {tier.discount_percent > 0 ? `Giảm ${tier.discount_percent}% mỗi lần đặt sân` : "Chưa có ưu đãi"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="text-xs text-ink-400 text-center mt-6">
          * Tier được tính dựa trên tổng tiền sân đã chi từ các booking hoàn thành (lifetime spend).
        </p>
      </div>
    </>
  );
}
