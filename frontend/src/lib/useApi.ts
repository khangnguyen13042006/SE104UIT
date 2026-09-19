"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api";

/**
 * Cache "stale-while-revalidate" cho các request GET.
 *
 * Mục tiêu: khi chuyển trang trong khu quản trị, dữ liệu đã tải lần trước hiện ra NGAY
 * (không còn vòng xoay chờ), đồng thời gọi lại API ngầm để cập nhật số liệu mới.
 *
 * - `memory`: cache trong RAM, sống theo vòng đời tab.
 * - `sessionStorage`: giữ cache qua F5 / mở lại trang, xoá khi đóng tab hoặc đăng xuất.
 * - `inflight`: gộp các request trùng key đang bay (nhiều component cùng hỏi 1 endpoint).
 */
type Entry = { data: any; at: number };

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<any>>();
const listeners = new Map<string, Set<(e: Entry) => void>>();

const SS_PREFIX = "api-cache:";
// Cache cũ hơn mốc này coi như hết hạn, không hiển thị lại (tránh số liệu quá cũ gây hiểu nhầm)
const MAX_AGE_MS = 10 * 60 * 1000;

function readSession(key: string): Entry | null {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry;
    if (!e || typeof e.at !== "number" || Date.now() - e.at > MAX_AGE_MS) return null;
    return e;
  } catch {
    return null;
  }
}

function writeSession(key: string, e: Entry) {
  try {
    sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(e));
  } catch {
    /* hết quota hoặc chế độ riêng tư — bỏ qua, vẫn còn cache RAM */
  }
}

function getCached(key: string): Entry | null {
  const hit = memory.get(key);
  if (hit) return Date.now() - hit.at > MAX_AGE_MS ? null : hit;
  if (typeof window === "undefined") return null;
  const fromSession = readSession(key);
  if (fromSession) memory.set(key, fromSession);
  return fromSession;
}

function publish(key: string, entry: Entry) {
  memory.set(key, entry);
  if (typeof window !== "undefined") writeSession(key, entry);
  listeners.get(key)?.forEach((fn) => fn(entry));
}

/** Gọi API (gộp request trùng) rồi phát dữ liệu mới cho mọi component đang nghe key này. */
export function fetchKey(key: string, force = false): Promise<any> {
  if (!force) {
    const existing = inflight.get(key);
    if (existing) return existing;
  }
  const p = apiGet(key)
    .then((data) => {
      publish(key, { data, at: Date.now() });
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** Tải trước dữ liệu (dùng khi rê chuột vào menu) — lỗi thì bỏ qua, chỉ là tối ưu. */
export function prefetch(key: string) {
  if (getCached(key) || inflight.has(key)) return;
  fetchKey(key).catch(() => {});
}

/** Xoá cache theo tiền tố đường dẫn, gọi sau khi thêm/sửa/xoá để lần sau lấy dữ liệu mới. */
export function invalidate(prefix: string) {
  for (const key of Array.from(memory.keys())) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  if (typeof window === "undefined") return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SS_PREFIX + prefix)) sessionStorage.removeItem(k);
    }
  } catch {
    /* bỏ qua */
  }
}

/** Xoá toàn bộ cache (đăng xuất / đổi tài khoản). */
export function clearApiCache() {
  memory.clear();
  inflight.clear();
  if (typeof window === "undefined") return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SS_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* bỏ qua */
  }
}

export interface UseApiResult<T> {
  data: T | null;
  /** true chỉ khi CHƯA có dữ liệu nào để hiển thị (lần đầu vào, chưa có cache) */
  loading: boolean;
  /** đang tải lại ngầm trong khi vẫn hiển thị dữ liệu cũ */
  refreshing: boolean;
  error: string;
  reload: () => Promise<void>;
  setData: (updater: (prev: any) => any) => void;
}

/**
 * @param key   đường dẫn API, hoặc null để tạm không gọi (ví dụ chờ biết vai trò người dùng)
 * @param refreshMs  tự động tải lại theo chu kỳ (0 = không)
 */
export function useApi<T = any>(key: string | null, refreshMs = 0): UseApiResult<T> {
  const cached = key ? getCached(key) : null;
  const [data, setDataState] = useState<T | null>(cached ? cached.data : null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(key);
  keyRef.current = key;

  const run = useCallback(
    async (k: string, silent: boolean) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        await fetchKey(k, true);
        if (keyRef.current === k) setError("");
      } catch (e: any) {
        if (keyRef.current === k) setError(e?.message || "Không tải được dữ liệu");
      } finally {
        if (keyRef.current === k) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!key) {
      setLoading(false);
      return;
    }
    const hit = getCached(key);
    setDataState(hit ? hit.data : null);
    setLoading(!hit);

    const onUpdate = (e: Entry) => setDataState(e.data);
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(onUpdate);

    run(key, !!hit);

    let timer: any;
    if (refreshMs > 0) {
      timer = setInterval(() => {
        // Tab đang ẩn thì không cần poll, đỡ tốn request
        if (typeof document === "undefined" || !document.hidden) run(key, true);
      }, refreshMs);
    }
    return () => {
      listeners.get(key)?.delete(onUpdate);
      if (timer) clearInterval(timer);
    };
  }, [key, refreshMs, run]);

  const reload = useCallback(async () => {
    if (keyRef.current) await run(keyRef.current, true);
  }, [run]);

  const setData = useCallback((updater: (prev: any) => any) => {
    const k = keyRef.current;
    if (!k) return;
    const prev = getCached(k)?.data ?? null;
    publish(k, { data: updater(prev), at: Date.now() });
  }, []);

  return { data, loading, refreshing, error, reload, setData };
}

/** Lấy dữ liệu đã cache mà không gọi mạng; `undefined` nghĩa là chưa có cache. */
export function peek(key: string): any {
  const hit = getCached(key);
  return hit ? hit.data : undefined;
}

/**
 * Nạp ngay dữ liệu đã cache cho một trang (nếu đủ mọi key), trả về true nếu đã nạp được.
 * Dùng ở đầu hàm load() để trang hiện nội dung tức thì rồi mới tải lại ngầm.
 */
export function primeFromCache(keys: string[], apply: (...vals: any[]) => void): boolean {
  const vals = keys.map(peek);
  if (vals.some((v) => v === undefined)) return false;
  apply(...vals);
  return true;
}

/** Như apiGet nhưng kết quả được lưu vào cache để lần sau vào trang là có ngay. */
export const cachedGet = (key: string) => fetchKey(key, true);
