"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  CalendarCheck2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  MapPin,
  Ban,
  Clock,
  Calendar,
} from "lucide-react";
import { apiPost, getUser } from "@/lib/api";
import { clearApiCache } from "@/lib/useApi";

const STAFF_ROLES = ["ADMIN", "QUAN_LY", "NHAN_VIEN"];

interface BookingActionPayload {
  field_id: number;
  field_name: string;
  date: string;
  time: string;
  duration: number;
}

type ActionStatus = "idle" | "loading" | "done" | "error";

// Thẻ đề xuất do server dựng (chỉ thực hiện khi bấm xác nhận; server kiểm tra lại chữ ký + quyền)
interface Proposal {
  tool: string;
  title: string;
  lines: [string, string][];
  danger: boolean;
  confirm_label: string;
  token: string;
  status?: ActionStatus;
  resultText?: string;
}

interface Message {
  sender: "user" | "bot";
  text: string;
  booking?: BookingActionPayload | null;
  proposals?: Proposal[];
}

const CUSTOMER_GREETING =
  "Xin chào! Em là lễ tân ảo Sân Bóng UIT. Em xem được sân trống, giá, dịch vụ, ưu đãi; nếu anh/chị đăng nhập, em còn xem/đổi/hủy giúp đơn của mình. Anh/chị cần gì cứ nhắn em nhé!";
const ADMIN_GREETING =
  "Xin chào! Em là trợ lý nội bộ. Em tra cứu và thao tác được theo đúng quyền của tài khoản anh/chị: đơn đặt sân, dịch vụ, sân, ca trực, lương, báo cáo... Thao tác thay đổi dữ liệu luôn hiện thẻ để anh/chị xác nhận trước.";

const CHAT_STORAGE_KEY = { customer: "kickoff_chat_customer_v2", admin: "kickoff_chat_admin_v2" } as const;

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
  "🔁 Đổi lịch / hủy đơn",
  "⭐ Ưu đãi thành viên",
  "🤖 Chatbot làm được gì?",
];
const ADMIN_QUICK_PROMPTS = [
  "🔔 Có việc gì đang chờ xử lý?",
  "📊 Tổng quan hôm nay",
  "📋 Đơn nào đang chờ xác nhận?",
  "📦 Dịch vụ nào sắp hết hàng?",
  "💸 Đơn chờ hoàn tiền",
  "🤖 Chatbot làm được gì?",
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
      const data = await apiPost("/api/chat", {
        message: userText,
        history: messages.slice(-6).map((m) => ({ sender: m.sender, text: m.text })),
      });

      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: data.reply,
          booking: data.booking_action || null,
          proposals: (data.proposals || []).map((p: Proposal) => ({ ...p, status: "idle" as ActionStatus })),
        },
      ]);
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

  function updateProposal(idx: number, pi: number, patch: Partial<Proposal>) {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === idx && m.proposals ? { ...m, proposals: m.proposals.map((p, j) => (j === pi ? { ...p, ...patch } : p)) } : m
      )
    );
  }

  const handleConfirm = async (idx: number, pi: number, p: Proposal) => {
    updateProposal(idx, pi, { status: "loading" });
    try {
      const res = await apiPost("/api/chat/confirm", { token: p.token });
      clearApiCache(); // dữ liệu đã đổi: các trang quản trị sẽ tải lại thay vì hiện cache cũ
      updateProposal(idx, pi, { status: "done", resultText: res.message || "Đã thực hiện." });
    } catch (e: any) {
      updateProposal(idx, pi, { status: "error", resultText: e.message || "Có lỗi xảy ra, vui lòng thử lại." });
    }
  };

  return (
    <div className="z-50">
      {/* Floating launcher with inviting bubble when closed */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex items-end gap-3">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() => setIsOpen(true)}
            className="hidden sm:flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-card/95 backdrop-blur-xl border border-primary/30 shadow-2xl text-xs font-semibold text-foreground cursor-pointer hover:border-primary hover:shadow-primary/20 transition-all group"
          >
            <span className="text-lg">⚽</span>
            <div>
              <div className="text-[11px] text-muted-foreground">Lễ tân ảo UIT 24/7</div>
              <div className="text-foreground font-bold group-hover:text-primary transition-colors">
                Cần tìm sân nhanh? Nhắn em nhé!
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </motion.div>

          <button
            onClick={() => setIsOpen(true)}
            aria-label="Mở chat tư vấn đặt sân"
            className="relative flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-primary via-emerald-600 to-teal-500 text-white rounded-full shadow-2xl shadow-primary/40 hover:shadow-primary/60 hover:scale-105 active:scale-95 transition-all duration-300 ring-4 ring-primary/20"
          >
            <MessageCircle className="w-7 h-7" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-card flex items-center justify-center text-[9px] font-bold text-accent-foreground shadow-sm">
              1
            </span>
          </button>
        </div>
      )}

      {/* Chat Dialog: Responsive mobile bottom sheet & desktop floating card */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-x-0 bottom-0 top-12 sm:top-auto sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[410px] sm:h-[620px] flex flex-col bg-card/95 backdrop-blur-2xl border border-border sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden z-50"
          >
            {/* Mobile drag bar indicator */}
            <div className="sm:hidden w-12 h-1.5 bg-muted-foreground/30 rounded-full mx-auto my-2 shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-900 border-b border-white/10 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative p-2 bg-gradient-to-br from-primary to-emerald-500 rounded-2xl shadow-lg shadow-primary/30">
                  <Bot className="w-5 h-5 text-white" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-slate-900" />
                </div>
                <div>
                  <div className="font-bold text-sm leading-tight flex items-center gap-1.5 text-white">
                    <span>{isAdminMode ? "Trợ lý nội bộ KICKOFF" : "Lễ tân ảo KICKOFF"}</span>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* Animated sound wave bars */}
                    <div className="flex items-center gap-0.5 h-3">
                      <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="w-0.5 h-3.5 bg-emerald-400 rounded-full animate-pulse [animation-delay:0.2s]" />
                      <span className="w-0.5 h-2 bg-emerald-400 rounded-full animate-pulse [animation-delay:0.4s]" />
                    </div>
                    <span className="text-[11px] text-emerald-300 font-medium">
                      {isAdminMode ? "Chế độ quản trị" : "AI hỗ trợ 24/7"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleResetChat}
                  title="Làm mới cuộc trò chuyện"
                  aria-label="Làm mới cuộc trò chuyện"
                  className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  title="Đóng chat"
                  aria-label="Đóng chat"
                  className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Message History */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-secondary/30 text-sm">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex items-end gap-2 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  {/* Bot Avatar */}
                  {m.sender === "bot" && (
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center text-white shrink-0 mb-1 shadow-sm">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      m.sender === "user"
                        ? "bg-gradient-to-r from-primary to-emerald-600 text-primary-foreground rounded-br-none shadow-md shadow-primary/20 font-medium"
                        : "bg-card text-foreground border border-border/80 rounded-bl-none"
                    }`}
                  >
                    <div>{formatMessageText(m.text)}</div>

                    {/* Booking Action Card */}
                    {m.booking && (
                      <div className="mt-3 pt-3 border-t border-border/70">
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-3 space-y-1.5">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 text-xs">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{m.booking.field_name}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {m.booking.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {m.booking.time} ({m.booking.duration}h)
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAutoFill(m.booking!)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition active:scale-[0.98]"
                        >
                          <CalendarCheck2 className="w-4 h-4" />
                          <span>Đặt sân này giúp tôi</span>
                        </button>
                      </div>
                    )}

                    {m.proposals?.map((p, pi) => (
                      <ProposalCard key={pi} p={p} onConfirm={() => handleConfirm(idx, pi, p)} />
                    ))}
                  </div>

                  {/* User Avatar */}
                  {m.sender === "user" && (
                    <div className="w-7 h-7 rounded-xl bg-secondary border border-border flex items-center justify-center text-foreground shrink-0 mb-1 shadow-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {/* Bouncy typing wave indicator when loading */}
              {loading && (
                <div className="flex items-end gap-2 justify-start">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center text-white shrink-0 mb-1">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="px-4 py-3 bg-card border border-border rounded-2xl rounded-bl-none shadow-sm flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {isAdminMode ? "Đang tra cứu hệ thống..." : "Đang tìm sân trống real-time..."}
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestion Chips */}
            <div className="px-3 py-2 border-t border-border/80 bg-card/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickSend(qp)}
                  disabled={loading}
                  className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold rounded-full bg-secondary/80 hover:bg-primary/10 hover:text-primary hover:border-primary/40 border border-border transition active:scale-95 shrink-0 disabled:opacity-50 shadow-xs"
                >
                  {qp}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-border bg-card flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  isAdminMode
                    ? "Hỏi hoặc ra lệnh: đơn, dịch vụ, sân, ca, lương..."
                    : "Hỏi lịch trống, giá, đơn của tôi, đổi/hủy lịch..."
                }
                className="flex-1 px-4 py-2.5 bg-background border border-border rounded-full text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition placeholder:text-muted-foreground/70"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center hover:opacity-90 active:scale-95 disabled:opacity-40 transition shadow-md shadow-primary/20 shrink-0"
                aria-label="Gửi tin nhắn"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProposalCard({ p, onConfirm }: { p: Proposal; onConfirm: () => void }) {
  const finished = p.status === "done" || p.status === "error";
  return (
    <div className={`mt-3 p-3 rounded-xl border ${p.danger ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
      <div className="text-xs font-bold mb-1.5 flex items-center gap-1.5">
        {p.danger && <Ban className="w-3.5 h-3.5 text-destructive shrink-0" />}
        <span>{p.title}</span>
      </div>
      <dl className="text-[11px] text-muted-foreground space-y-0.5 mb-2.5">
        {p.lines.map(([k, v], i) => (
          <div key={i} className="flex gap-2">
            <dt className="shrink-0 font-medium">{k}:</dt>
            <dd className="text-foreground break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {finished ? (
        <div
          className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl ${
            p.status === "done" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"
          }`}
        >
          {p.status === "done" ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
          <span>{p.resultText}</span>
        </div>
      ) : (
        <button
          onClick={onConfirm}
          disabled={p.status === "loading"}
          className={`w-full flex items-center justify-center gap-2 py-2 px-3 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-60 ${
            p.danger ? "bg-destructive hover:bg-destructive/90" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {p.status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{p.status === "loading" ? "Đang xử lý..." : p.confirm_label}</span>
        </button>
      )}
    </div>
  );
}
