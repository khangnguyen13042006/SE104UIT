"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageCircle,
  X,
  Send,
  Bot,
  Loader2,
  Sparkles,
  CalendarCheck2,
  RotateCcw,
  ShoppingCart,
  PackagePlus,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  MapPin,
  Settings2,
  Ban,
} from "lucide-react";
import { apiPost, apiPut, formatVND, getUser } from "@/lib/api";

const STAFF_ROLES = ["ADMIN", "QUAN_LY", "NHAN_VIEN"];

interface BookingActionPayload {
  field_id: number;
  field_name: string;
  date: string;
  time: string;
  duration: number;
}

interface AddServiceActionPayload {
  booking_id: number;
  ma_dat_san: string;
  dich_vu_id: number;
  dich_vu_ten: string;
  don_gia: number;
  so_luong: number;
}

interface CreateServiceActionPayload {
  ten_dich_vu: string;
  don_gia: number;
  don_vi_tinh: string;
  ton_kho: number;
  la_cho_thue: boolean;
}

interface ConfirmBookingActionPayload {
  booking_id: number;
  ma_dat_san: string;
  ten_san: string;
}

interface CancelBookingActionPayload {
  booking_id: number;
  ma_dat_san: string;
  ten_san: string;
  ly_do_huy: string;
  hoan_tien: boolean | null;
}

interface CreateFieldActionPayload {
  ten_san: string;
  loai_san: string;
  suc_chua: number;
  gia_tieu_chuan: number;
  gia_cao_diem: number;
  mo_ta: string | null;
}

interface UpdateFieldActionPayload {
  field_id: number;
  ten_san: string;
  gia_tieu_chuan?: number;
  gia_cao_diem?: number;
  trang_thai?: string;
}

type ActionStatus = "idle" | "loading" | "done" | "error";

type ChatAction =
  | { type: "booking"; payload: BookingActionPayload }
  | { type: "add_service"; payload: AddServiceActionPayload; status?: ActionStatus; resultText?: string }
  | { type: "create_service"; payload: CreateServiceActionPayload; status?: ActionStatus; resultText?: string }
  | { type: "confirm_booking"; payload: ConfirmBookingActionPayload; status?: ActionStatus; resultText?: string }
  | { type: "cancel_booking"; payload: CancelBookingActionPayload; status?: ActionStatus; resultText?: string }
  | { type: "create_field"; payload: CreateFieldActionPayload; status?: ActionStatus; resultText?: string }
  | { type: "update_field"; payload: UpdateFieldActionPayload; status?: ActionStatus; resultText?: string };

interface Message {
  sender: "user" | "bot";
  text: string;
  action?: ChatAction | null;
}

const CUSTOMER_GREETING =
  "Xin chào! Em là lễ tân ảo Sân Bóng UIT. Anh/chị cần kiểm tra lịch trống, bảng giá hay cần tư vấn chọn sân nào cứ nhắn em nhé!";
const ADMIN_GREETING =
  "Xin chào! Em là trợ lý nội bộ. Anh/chị có thể hỏi booking đang chờ xác nhận, dịch vụ sắp hết hàng, đánh giá thấp gần đây, hoặc nhờ em xác nhận/hủy booking, thêm dịch vụ vào bill, tạo dịch vụ mới, thêm sân, sửa giá sân.";

const CHAT_STORAGE_KEY = { customer: "kickoff_chat_customer_v1", admin: "kickoff_chat_admin_v1" } as const;

function defaultMessages(mode: "customer" | "admin"): Message[] {
  return [{ sender: "bot", text: mode === "admin" ? ADMIN_GREETING : CUSTOMER_GREETING }];
}

// Lưu hội thoại vào sessionStorage: giữ nguyên cho tới khi tab/trình duyệt bị đóng, mất khi đóng tab.
function loadMessages(mode: "customer" | "admin"): Message[] {
  if (typeof window === "undefined") return defaultMessages(mode);
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY[mode]);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return defaultMessages(mode);
}

function saveMessages(mode: "customer" | "admin", messages: Message[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHAT_STORAGE_KEY[mode], JSON.stringify(messages));
  } catch {}
}

const CUSTOMER_QUICK_PROMPTS = [
  "⚽ Xem sân trống hôm nay",
  "💰 Bảng giá & Giờ cao điểm",
  "📋 Lịch đá sắp tới của tôi",
  "💳 Thông tin chuyển khoản STK",
  "⭐ Ưu đãi thẻ thành viên",
];
const ADMIN_QUICK_PROMPTS = [
  "📋 Booking nào đang chờ xác nhận?",
  "📦 Dịch vụ nào sắp hết hàng?",
  "⭐ Có đánh giá thấp gần đây không?",
  "➕ Tạo dịch vụ mới",
];

function formatMessageText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lIdx) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return (
      <span key={lIdx} className="block min-h-[1.25em]">
        {parts.map((part, pIdx) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={pIdx} className="font-semibold text-foreground">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return part;
        })}
      </span>
    );
  });
}

export default function ChatWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const isAdminMode = pathname.startsWith("/admin");

  const [user, setUser] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(isAdminMode ? "admin" : "customer"));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef(isAdminMode);

  useEffect(() => {
    setUser(getUser());
  }, [pathname]);

  // Chuyển qua lại giữa chế độ khách hàng <-> nội bộ: nạp đúng lịch sử đã lưu của chế độ đó (2 ngữ cảnh tách biệt).
  // Không đóng khung chat lại — giữ nguyên trạng thái đang mở/đóng khi điều hướng trang.
  useEffect(() => {
    if (prevModeRef.current !== isAdminMode) {
      prevModeRef.current = isAdminMode;
      setMessages(loadMessages(isAdminMode ? "admin" : "customer"));
    }
  }, [isAdminMode]);

  // Lưu hội thoại mỗi khi thay đổi, giữ tới khi đóng tab (sessionStorage)
  useEffect(() => {
    saveMessages(isAdminMode ? "admin" : "customer", messages);
  }, [messages, isAdminMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const isStaff = user && STAFF_ROLES.includes(user.vai_tro);
  if (isAdminMode && !isStaff) return null;

  const quickPrompts = isAdminMode ? ADMIN_QUICK_PROMPTS : CUSTOMER_QUICK_PROMPTS;

  const sendMessage = async (userText: string) => {
    if (!userText.trim() || loading) return;

    setMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setLoading(true);

    try {
      const endpoint = isAdminMode ? "/api/chat/admin" : "/api/chat";
      const data = await apiPost(endpoint, {
        message: userText,
        history: messages.slice(-6).map((m) => ({ sender: m.sender, text: m.text })),
      });

      let action: ChatAction | null = null;
      if (data.booking_action) {
        action = { type: "booking", payload: data.booking_action };
      } else if (data.add_service_action) {
        action = { type: "add_service", payload: data.add_service_action, status: "idle" };
      } else if (data.create_service_action) {
        action = { type: "create_service", payload: data.create_service_action, status: "idle" };
      } else if (data.confirm_booking_action) {
        action = { type: "confirm_booking", payload: data.confirm_booking_action, status: "idle" };
      } else if (data.cancel_booking_action) {
        action = { type: "cancel_booking", payload: data.cancel_booking_action, status: "idle" };
      } else if (data.create_field_action) {
        action = { type: "create_field", payload: data.create_field_action, status: "idle" };
      } else if (data.update_field_action) {
        action = { type: "update_field", payload: data.update_field_action, status: "idle" };
      }

      setMessages((prev) => [...prev, { sender: "bot", text: data.reply, action }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "Hệ thống AI đang bận xử lý, anh/chị vui lòng thử gửi lại sau giây lát nhé!",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
  };

  const handleQuickSend = (promptText: string) => {
    if (loading) return;
    sendMessage(promptText);
  };

  const handleResetChat = () => {
    setMessages(defaultMessages(isAdminMode ? "admin" : "customer"));
  };

  const handleAutoFill = (action: BookingActionPayload) => {
    const query = new URLSearchParams({
      field_id: String(action.field_id),
      date: action.date,
      time: action.time,
      duration: String(action.duration || 1.5),
      focus: "phone",
    }).toString();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("chatbot-autofill", { detail: action }));
    }

    router.push(`/booking?${query}`);
  };

  function updateActionAt(idx: number, patch: Partial<Extract<ChatAction, { status?: ActionStatus }>>) {
    setMessages((prev) =>
      prev.map((m, i) => (i === idx && m.action ? { ...m, action: { ...m.action, ...patch } as ChatAction } : m))
    );
  }

  const handleAddService = async (idx: number, payload: AddServiceActionPayload) => {
    updateActionAt(idx, { status: "loading" });
    try {
      await apiPost(`/api/bookings/${payload.booking_id}/services`, {
        dich_vu_id: payload.dich_vu_id,
        so_luong: payload.so_luong,
      });
      updateActionAt(idx, {
        status: "done",
        resultText: `Đã thêm ${payload.so_luong} × ${payload.dich_vu_ten} vào bill đơn ${payload.ma_dat_san}.`,
      });
    } catch (e: any) {
      updateActionAt(idx, { status: "error", resultText: e.message || "Có lỗi xảy ra, vui lòng thử lại." });
    }
  };

  const handleCreateService = async (idx: number, payload: CreateServiceActionPayload) => {
    updateActionAt(idx, { status: "loading" });
    try {
      await apiPost("/api/services", payload);
      updateActionAt(idx, { status: "done", resultText: `Đã tạo dịch vụ "${payload.ten_dich_vu}" thành công.` });
    } catch (e: any) {
      updateActionAt(idx, { status: "error", resultText: e.message || "Có lỗi xảy ra, vui lòng thử lại." });
    }
  };

  const handleConfirmBooking = async (idx: number, payload: ConfirmBookingActionPayload) => {
    updateActionAt(idx, { status: "loading" });
    try {
      await apiPost(`/api/bookings/${payload.booking_id}/confirm`);
      updateActionAt(idx, {
        status: "done",
        resultText: `Đã xác nhận đơn ${payload.ma_dat_san} (${payload.ten_san}).`,
      });
    } catch (e: any) {
      updateActionAt(idx, { status: "error", resultText: e.message || "Có lỗi xảy ra, vui lòng thử lại." });
    }
  };

  const handleCancelBooking = async (idx: number, payload: CancelBookingActionPayload) => {
    updateActionAt(idx, { status: "loading" });
    try {
      await apiPost(`/api/bookings/${payload.booking_id}/cancel`, {
        ly_do_huy: payload.ly_do_huy,
        hoan_tien: payload.hoan_tien,
      });
      updateActionAt(idx, {
        status: "done",
        resultText: `Đã hủy đơn ${payload.ma_dat_san} (${payload.ten_san}).`,
      });
    } catch (e: any) {
      updateActionAt(idx, { status: "error", resultText: e.message || "Có lỗi xảy ra, vui lòng thử lại." });
    }
  };

  const handleCreateField = async (idx: number, payload: CreateFieldActionPayload) => {
    updateActionAt(idx, { status: "loading" });
    try {
      await apiPost("/api/fields", payload);
      updateActionAt(idx, { status: "done", resultText: `Đã tạo sân "${payload.ten_san}" thành công.` });
    } catch (e: any) {
      updateActionAt(idx, { status: "error", resultText: e.message || "Có lỗi xảy ra, vui lòng thử lại." });
    }
  };

  const handleUpdateField = async (idx: number, payload: UpdateFieldActionPayload) => {
    updateActionAt(idx, { status: "loading" });
    try {
      const { field_id, ten_san, ...changes } = payload;
      await apiPut(`/api/fields/${field_id}`, changes);
      updateActionAt(idx, { status: "done", resultText: `Đã cập nhật sân "${ten_san}".` });
    } catch (e: any) {
      updateActionAt(idx, { status: "error", resultText: e.message || "Có lỗi xảy ra, vui lòng thử lại." });
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Mở chat tư vấn"
          className="flex items-center justify-center w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-105 active:scale-95 transition-all duration-300"
        >
          <MessageCircle className="w-7 h-7" />
        </button>
      )}

      {isOpen && (
        <div className="flex flex-col w-80 sm:w-96 h-[560px] bg-card border border-border rounded-3xl shadow-2xl overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-white/20 rounded-xl">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                  {isAdminMode ? "Trợ lý nội bộ" : "Lễ tân ảo UIT"}
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
                  <span className="text-[11px] text-white/80 font-normal">
                    {isAdminMode ? "Chỉ dành cho nhân viên" : "Trực tuyến 24/7"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleResetChat}
                title="Làm mới cuộc trò chuyện"
                aria-label="Làm mới cuộc trò chuyện"
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Đóng chat"
                aria-label="Đóng chat"
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Chat box */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-secondary/30 text-sm">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    m.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none shadow-md shadow-primary/15"
                      : "bg-card text-foreground border border-border rounded-bl-none shadow-sm"
                  }`}
                >
                  <div>{formatMessageText(m.text)}</div>

                  {m.action?.type === "booking" && (
                    <div className="mt-3 pt-2.5 border-t border-border/70">
                      <p className="text-[11px] text-muted-foreground mb-2">
                        💡 Bạn có muốn tạo đơn giữ sân ngay bây giờ không?
                      </p>
                      <button
                        onClick={() => handleAutoFill(m.action!.payload as BookingActionPayload)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-[0.98]"
                      >
                        <CalendarCheck2 className="w-4 h-4" />
                        <span>Đặt sân này giúp tôi</span>
                      </button>
                    </div>
                  )}

                  {m.action?.type === "add_service" && (
                    <ActionCard
                      icon={<ShoppingCart className="w-3.5 h-3.5" />}
                      description={`Thêm ${m.action.payload.so_luong} × ${m.action.payload.dich_vu_ten} vào bill đơn ${m.action.payload.ma_dat_san}?`}
                      buttonLabel="Thêm vào bill"
                      status={m.action.status}
                      resultText={m.action.resultText}
                      onConfirm={() => handleAddService(idx, m.action!.payload as AddServiceActionPayload)}
                    />
                  )}

                  {m.action?.type === "create_service" && (
                    <ActionCard
                      icon={<PackagePlus className="w-3.5 h-3.5" />}
                      description={`Tạo dịch vụ mới "${m.action.payload.ten_dich_vu}" — giá ${formatVND(
                        m.action.payload.don_gia
                      )}/${m.action.payload.don_vi_tinh}, tồn kho ${m.action.payload.ton_kho}${
                        m.action.payload.la_cho_thue ? " (đồ cho thuê)" : ""
                      }?`}
                      buttonLabel="Tạo dịch vụ"
                      status={m.action.status}
                      resultText={m.action.resultText}
                      onConfirm={() => handleCreateService(idx, m.action!.payload as CreateServiceActionPayload)}
                    />
                  )}

                  {m.action?.type === "confirm_booking" && (
                    <ActionCard
                      icon={<ClipboardCheck className="w-3.5 h-3.5" />}
                      description={`Xác nhận đơn ${m.action.payload.ma_dat_san} (${m.action.payload.ten_san})?`}
                      buttonLabel="Xác nhận đơn"
                      status={m.action.status}
                      resultText={m.action.resultText}
                      onConfirm={() => handleConfirmBooking(idx, m.action!.payload as ConfirmBookingActionPayload)}
                    />
                  )}

                  {m.action?.type === "cancel_booking" && (
                    <ActionCard
                      icon={<Ban className="w-3.5 h-3.5" />}
                      description={`Hủy đơn ${m.action.payload.ma_dat_san} (${m.action.payload.ten_san})? Lý do: ${m.action.payload.ly_do_huy}`}
                      buttonLabel="Hủy đơn"
                      status={m.action.status}
                      resultText={m.action.resultText}
                      onConfirm={() => handleCancelBooking(idx, m.action!.payload as CancelBookingActionPayload)}
                    />
                  )}

                  {m.action?.type === "create_field" && (
                    <ActionCard
                      icon={<MapPin className="w-3.5 h-3.5" />}
                      description={`Tạo sân mới "${m.action.payload.ten_san}" — loại ${m.action.payload.loai_san}, sức chứa ${m.action.payload.suc_chua}, giá thường ${formatVND(
                        m.action.payload.gia_tieu_chuan
                      )}/h, giá cao điểm ${formatVND(m.action.payload.gia_cao_diem)}/h?`}
                      buttonLabel="Tạo sân"
                      status={m.action.status}
                      resultText={m.action.resultText}
                      onConfirm={() => handleCreateField(idx, m.action!.payload as CreateFieldActionPayload)}
                    />
                  )}

                  {m.action?.type === "update_field" && (
                    <ActionCard
                      icon={<Settings2 className="w-3.5 h-3.5" />}
                      description={`Cập nhật sân "${m.action.payload.ten_san}": ${[
                        m.action.payload.gia_tieu_chuan !== undefined
                          ? `giá thường → ${formatVND(m.action.payload.gia_tieu_chuan)}/h`
                          : null,
                        m.action.payload.gia_cao_diem !== undefined
                          ? `giá cao điểm → ${formatVND(m.action.payload.gia_cao_diem)}/h`
                          : null,
                        m.action.payload.trang_thai ? `trạng thái → ${m.action.payload.trang_thai}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}?`}
                      buttonLabel="Cập nhật sân"
                      status={m.action.status}
                      resultText={m.action.resultText}
                      onConfirm={() => handleUpdateField(idx, m.action!.payload as UpdateFieldActionPayload)}
                    />
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2 bg-card text-muted-foreground border border-border rounded-2xl text-xs flex items-center gap-2 shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>{isAdminMode ? "Đang tra cứu dữ liệu vận hành..." : "Đang tra cứu lịch sân..."}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick suggestion chips */}
          <div className="px-3 py-2 border-t border-border/60 bg-card/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickSend(qp)}
                disabled={loading}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] font-medium rounded-full bg-secondary/80 hover:bg-primary/10 hover:text-primary border border-border transition shrink-0 disabled:opacity-50"
              >
                {qp}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border bg-card flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={isAdminMode ? "Hỏi booking, tồn kho, hoặc nhờ thêm dịch vụ..." : "Hỏi giờ trống, bảng giá, chọn sân..."}
              className="flex-1 px-4 py-2 bg-background border border-border rounded-full text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="p-2.5 bg-primary text-primary-foreground rounded-full hover:opacity-90 disabled:opacity-40 transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionCard({
  icon,
  description,
  buttonLabel,
  status,
  resultText,
  onConfirm,
}: {
  icon: React.ReactNode;
  description: string;
  buttonLabel: string;
  status?: ActionStatus;
  resultText?: string;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-3 pt-2.5 border-t border-border/70">
      <p className="text-[11px] text-muted-foreground mb-2 flex items-start gap-1.5">
        <span className="mt-0.5 text-primary shrink-0">{icon}</span>
        <span>{description}</span>
      </p>

      {status === "done" || status === "error" ? (
        <div
          className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl ${
            status === "done"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {status === "done" ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <XCircle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{resultText}</span>
        </div>
      ) : (
        <button
          onClick={onConfirm}
          disabled={status === "loading"}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-60"
        >
          {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{status === "loading" ? "Đang xử lý..." : buttonLabel}</span>
        </button>
      )}
    </div>
  );
}
