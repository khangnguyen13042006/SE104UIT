import { useEffect, useState } from "react";

/** Backend lưu/trả datetime UTC dạng naive ("2026-09-19T10:00:00") — thêm "Z" để trình duyệt hiểu là UTC. */
export function parseUtc(iso?: string | null): number | null {
  if (!iso) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const t = new Date(hasZone ? iso : iso + "Z").getTime();
  return isNaN(t) ? null : t;
}

/** Đếm ngược tới hạn thanh toán. `expired` = true khi hết giờ; `text` dạng mm:ss. */
export function useCountdown(deadlineIso?: string | null) {
  const target = parseUtc(deadlineIso);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (target === null) return { active: false, expired: false, remainingMs: 0, text: "" };
  const remainingMs = Math.max(0, target - now);
  const totalSec = Math.floor(remainingMs / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return { active: true, expired: remainingMs <= 0, remainingMs, text: `${mm}:${ss}` };
}
