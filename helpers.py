const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  if (typeof window !== "undefined") localStorage.setItem("token", token);
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }
}

export function getUser(): any {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem("user");
  return s ? JSON.parse(s) : null;
}

export function setUser(user: any) {
  if (typeof window !== "undefined") localStorage.setItem("user", JSON.stringify(user));
}

export async function api(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: any = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (err: any) {
    throw new Error(
      `Không kết nối được tới backend (${API_URL}). Kiểm tra: 1) uvicorn đã chạy chưa? 2) cổng 8000 đúng chưa?`
    );
  }
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const detail =
      typeof body === "object" && body?.detail !== undefined ? body.detail : null;
    const msg =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && detail.message
          ? detail.message
          : detail
            ? JSON.stringify(detail)
            : `Lỗi ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return body;
}

export const apiGet = (path: string) => api(path);
export const apiPost = (path: string, data?: any) =>
  api(path, { method: "POST", body: data ? JSON.stringify(data) : undefined });
export const apiPut = (path: string, data: any) =>
  api(path, { method: "PUT", body: JSON.stringify(data) });
export const apiDelete = (path: string) => api(path, { method: "DELETE" });

export function formatVND(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat("vi-VN").format(Math.round(num)) + "đ";
}

export function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("vi-VN");
}

export function formatDateTime(s: string): string {
  return new Date(s).toLocaleString("vi-VN");
}
