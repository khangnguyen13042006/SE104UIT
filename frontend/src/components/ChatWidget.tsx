"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, X, Send, Bot, Loader2, Sparkles, CalendarCheck2 } from "lucide-react";

interface BookingAction {
  field_id: number;
  field_name: string;
  date: string;
  time: string;
  duration: number;
}

interface Message {
  sender: "user" | "bot";
  text: string;
  bookingAction?: BookingAction | null;
}

export default function ChatWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "bot",
      text: "Xin chào! Em là lễ tân ảo Sân Bóng UIT. Anh/chị cần kiểm tra lịch trống, bảng giá hay cần tư vấn chọn sân nào cứ nhắn em nhé!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (pathname.startsWith("/admin")) return null;

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setLoading(true);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const res = await fetch(`${apiUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: userText }),
      });

      if (!res.ok) throw new Error("Lỗi kết nối");

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: data.reply,
          bookingAction: data.booking_action,
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

  const handleAutoFill = (action: BookingAction) => {
    setIsOpen(false);
    const query = new URLSearchParams({
      field_id: String(action.field_id),
      date: action.date,
      time: action.time,
      duration: String(action.duration || 1.5),
      focus: "phone",
    }).toString();

    router.push(`/booking?${query}`);
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
        <div className="flex flex-col w-80 sm:w-96 h-[520px] bg-card border border-border rounded-3xl shadow-2xl overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-white/20 rounded-xl">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                  Lễ tân ảo UIT
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
                  <span className="text-[11px] text-white/80 font-normal">Trực tuyến 24/7</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Chat box */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-secondary/30 text-sm">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] px-4 py-2.5 rounded-2xl whitespace-pre-line text-sm leading-relaxed ${
                    m.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none shadow-md shadow-primary/15"
                      : "bg-card text-foreground border border-border rounded-bl-none shadow-sm"
                  }`}
                >
                  <p>{m.text}</p>

                  {/* Nút đặt sân tự động */}
                  {m.bookingAction && (
                    <div className="mt-3 pt-2.5 border-t border-border/70">
                      <p className="text-[11px] text-muted-foreground mb-2">
                        💡 Bạn có muốn tạo đơn giữ sân ngay bây giờ không?
                      </p>
                      <button
                        onClick={() => handleAutoFill(m.bookingAction!)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-[0.98]"
                      >
                        <CalendarCheck2 className="w-4 h-4" />
                        <span>Đặt sân này giúp tôi</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2 bg-card text-muted-foreground border border-border rounded-2xl text-xs flex items-center gap-2 shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>Đang tra cứu lịch sân...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border bg-card flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Hỏi giờ trống, bảng giá, chọn sân..."
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