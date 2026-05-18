"use client";
import { useEffect, useState } from "react";
import { apiGet, formatVND } from "@/lib/api";
import { Loader2, Calendar, TrendingUp, Award, Clock } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";

export default function ReportsAdmin() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const end = today.toISOString().slice(0, 10);
  const [tuNgay, setTu] = useState(start);
  const [denNgay, setDen] = useState(end);
  const [nhomTheo, setNhom] = useState<"NGAY" | "TUAN" | "THANG">("NGAY");
  const [revenue, setRev] = useState<any>(null);
  const [ranking, setRank] = useState<any[]>([]);
  const [peak, setPeak] = useState<any>(null);
  const [summary, setSum] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const q = `tu_ngay=${tuNgay}&den_ngay=${denNgay}`;
      const [r, rk, p, s] = await Promise.all([
        apiGet(`/api/reports/revenue?${q}&nhom_theo=${nhomTheo}`),
        apiGet(`/api/reports/field-ranking?${q}`),
        apiGet(`/api/reports/peak-hours?${q}`),
        apiGet(`/api/reports/summary?${q}`),
      ]);
      setRev(r); setRank(rk); setPeak(p); setSum(s);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tuNgay, denNgay, nhomTheo]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-bold tracking-[0.25em] text-brand-600 mb-2">PHÂN TÍCH</div>
        <h1 className="font-display text-4xl">BÁO CÁO & THỐNG KÊ</h1>
      </div>

      {/* Bộ lọc */}
      <div className="bg-white rounded-2xl border border-ink-900/5 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-semibold block mb-1">Từ ngày</label>
          <input type="date" value={tuNgay} onChange={(e) => setTu(e.target.value)}
            className="px-3 py-2 rounded-lg border border-ink-900/10 outline-none text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">Đến ngày</label>
          <input type="date" value={denNgay} onChange={(e) => setDen(e.target.value)}
            className="px-3 py-2 rounded-lg border border-ink-900/10 outline-none text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">Nhóm theo</label>
          <select value={nhomTheo} onChange={(e) => setNhom(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-ink-900/10 outline-none text-sm bg-white">
            <option value="NGAY">Ngày</option>
            <option value="TUAN">Tuần</option>
            <option value="THANG">Tháng</option>
          </select>
        </div>
        <QuickRange label="7 ngày" onClick={() => {
          const d = new Date(); d.setDate(d.getDate() - 7);
          setTu(d.toISOString().slice(0, 10)); setDen(new Date().toISOString().slice(0, 10));
        }} />
        <QuickRange label="30 ngày" onClick={() => {
          const d = new Date(); d.setDate(d.getDate() - 30);
          setTu(d.toISOString().slice(0, 10)); setDen(new Date().toISOString().slice(0, 10));
        }} />
        <QuickRange label="Tháng này" onClick={() => {
          const d = new Date();
          setTu(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
          setDen(new Date().toISOString().slice(0, 10));
        }} />
      </div>

      {loading ? (
        <div className="p-12 text-center text-ink-400"><Loader2 className="animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SumCard icon={<TrendingUp />} label="Tổng doanh thu" value={formatVND(summary.tong_doanh_thu)} color="bg-brand-50 text-brand-700" />
              <SumCard icon={<Calendar />} label="Tổng lượt đặt" value={summary.tong_luot_dat} color="bg-blue-50 text-blue-700" />
              <SumCard icon={<Award />} label="Sân top" value={summary.san_dat_nhieu_nhat || "—"} color="bg-amber-50 text-amber-700" />
              <SumCard icon={<Clock />} label="Khung giờ HOT" value={summary.khung_gio_cao_diem || "—"} color="bg-purple-50 text-purple-700" />
            </div>
          )}

          {/* Revenue chart */}
          {revenue && (
            <Section title="DOANH THU THEO THỜI GIAN">
              <div className="flex flex-wrap gap-6 mb-4 text-sm">
                <Metric label="Tổng" value={formatVND(revenue.tong_doanh_thu)} />
                <Metric label="Tiền sân" value={formatVND(revenue.doanh_thu_tien_san)} />
                <Metric label="Dịch vụ" value={formatVND(revenue.doanh_thu_dich_vu)} />
                <Metric label="TB/ngày" value={formatVND(revenue.doanh_thu_tb_ngay)} />
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenue.chi_tiet}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "K"} />
                    <Tooltip formatter={(v: any) => formatVND(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="tien_san" fill="#10b981" name="Tiền sân" />
                    <Bar dataKey="tien_dich_vu" fill="#f59e0b" name="Dịch vụ" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          {/* Field ranking */}
          {ranking.length > 0 && (
            <Section title="XẾP HẠNG SÂN">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs font-bold text-ink-400">
                    <tr className="border-b border-ink-900/5">
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">SÂN</th>
                      <th className="text-right p-2">LƯỢT ĐẶT</th>
                      <th className="text-right p-2">TỔNG GIỜ</th>
                      <th className="text-right p-2">TỶ LỆ LẤP ĐẦY</th>
                      <th className="text-right p-2">DOANH THU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r) => (
                      <tr key={r.san_id} className="border-b border-ink-900/5">
                        <td className="p-2 font-bold">{r.xep_hang}</td>
                        <td className="p-2 font-semibold">{r.ten_san} <span className="text-xs text-ink-400">({r.loai_san})</span></td>
                        <td className="p-2 text-right">{r.tong_luot_dat}</td>
                        <td className="p-2 text-right">{r.tong_gio}h</td>
                        <td className="p-2 text-right">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            r.ty_le_lap_day > 50 ? "bg-brand-100 text-brand-700" :
                            r.ty_le_lap_day > 20 ? "bg-amber-100 text-amber-700" :
                            "bg-ink-900/5 text-ink-400"
                          }`}>{r.ty_le_lap_day}%</span>
                        </td>
                        <td className="p-2 text-right font-semibold">{formatVND(r.doanh_thu)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Peak hours */}
          {peak && (
            <Section title="KHUNG GIỜ CAO ĐIỂM">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={peak.chi_tiet}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="khung_gio" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="tong_luot_dat" stroke="#10b981" strokeWidth={2}
                      dot={{ fill: "#10b981", r: 4 }} name="Lượt đặt" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {peak.top_3.map((p: any, i: number) => (
                  <div key={i} className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="text-xs text-amber-700 font-bold">TOP {i + 1}</div>
                    <div className="font-display text-xl">{p.khung_gio}</div>
                    <div className="text-xs text-ink-400">{p.tong_luot_dat} lượt • {p.ty_le_lap_day}%</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function QuickRange({ label, onClick }: any) {
  return (
    <button onClick={onClick} className="px-3 py-2 rounded-lg text-xs font-semibold bg-ink-900/[0.03] hover:bg-ink-900/[0.06]">
      {label}
    </button>
  );
}

function SumCard({ icon, label, value, color }: any) {
  return (
    <div className="bg-white rounded-2xl border border-ink-900/5 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>{icon}</div>
      <div className="text-xs text-ink-400 mb-1">{label}</div>
      <div className="font-display text-xl text-ink-900 truncate">{value}</div>
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div className="bg-white rounded-2xl border border-ink-900/5 p-5">
      <h2 className="font-display text-2xl mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Metric({ label, value }: any) {
  return (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className="font-display text-2xl text-ink-900">{value}</div>
    </div>
  );
}
