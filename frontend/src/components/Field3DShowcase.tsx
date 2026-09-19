"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  RotateCw, Play, Pause, ChevronLeft, ChevronRight, 
  Sparkles, Check, Users, MapPin, Grid, Layers, Eye
} from "lucide-react";
import { formatVND } from "@/lib/api";

export type Field = {
  id: number;
  ten_san: string;
  loai_san: string;
  suc_chua: number;
  gia_tieu_chuan: number;
  gia_cao_diem: number;
  mo_ta: string | null;
  trang_thai: string;
};

interface Field3DShowcaseProps {
  fields: Field[];
  activeField: Field;
  onSelectField: (field: Field) => void;
}

export default function Field3DShowcase({
  fields,
  activeField,
  onSelectField,
}: Field3DShowcaseProps) {
  const [viewMode, setViewMode] = useState<"3d" | "grid">("3d");
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = fields.findIndex((f) => f.id === activeField?.id);
    return idx >= 0 ? idx : 0;
  });
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  // Sync currentIndex when activeField changes externally (e.g. from URL params or Chatbot)
  useEffect(() => {
    const idx = fields.findIndex((f) => f.id === activeField?.id);
    if (idx >= 0 && idx !== currentIndex) {
      setCurrentIndex(idx);
    }
  }, [activeField, fields]);

  // Auto-rotation timer
  useEffect(() => {
    if (!isAutoRotating || fields.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % fields.length;
        onSelectField(fields[next]);
        return next;
      });
    }, 3200);
    return () => clearInterval(interval);
  }, [isAutoRotating, fields, onSelectField]);

  const goToNext = () => {
    if (fields.length === 0) return;
    const next = (currentIndex + 1) % fields.length;
    setCurrentIndex(next);
    onSelectField(fields[next]);
  };

  const goToPrev = () => {
    if (fields.length === 0) return;
    const prev = (currentIndex - 1 + fields.length) % fields.length;
    setCurrentIndex(prev);
    onSelectField(fields[prev]);
  };

  const selectByIndex = (idx: number) => {
    setCurrentIndex(idx);
    onSelectField(fields[idx]);
  };

  // Touch swipe support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartXRef.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) goToPrev();
      else goToNext();
    }
    touchStartXRef.current = null;
  };

  if (fields.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header controls: Title & View Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/70">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
            1
          </span>
          <h2 className="text-xl font-display font-bold text-foreground">
            Chọn sân bóng
          </h2>
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            3D Orbit
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-rotation toggle */}
          {viewMode === "3d" && (
            <button
              onClick={() => setIsAutoRotating(!isAutoRotating)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                isAutoRotating
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-secondary/70 hover:bg-secondary text-muted-foreground border-border"
              }`}
              title={isAutoRotating ? "Tạm dừng tự động quay" : "Bật tự động quay 360°"}
            >
              {isAutoRotating ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dừng quay</span>
                </>
              ) : (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin-slow" />
                  <span className="hidden sm:inline">Quay 360°</span>
                </>
              )}
            </button>
          )}

          {/* Toggle 3D vs Grid */}
          <div className="flex items-center p-1 bg-secondary rounded-xl border border-border">
            <button
              onClick={() => setViewMode("3d")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "3d"
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>3D Xoay</span>
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "grid"
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Dạng lưới</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === "3d" ? (
        /* 3D Orbit Carousel Showcase */
        <div
          className="relative w-full py-8 overflow-hidden rounded-3xl bg-gradient-to-b from-card/80 via-secondary/20 to-card/80 border border-border/80 select-none perspective-1000"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Spotlight aura at the center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

          {/* 3D Carousel Stage */}
          <div className="relative h-[320px] sm:h-[350px] flex items-center justify-center preserve-3d">
            {fields.map((f, idx) => {
              // Calculate relative offset from current center index
              let offset = idx - currentIndex;
              // Wrap around shortest path
              if (offset > fields.length / 2) offset -= fields.length;
              if (offset < -fields.length / 2) offset += fields.length;

              const isCenter = offset === 0;
              const absOffset = Math.abs(offset);

              // Don't render items that are too far in the back if many fields
              if (absOffset > 3) return null;

              // 3D positioning
              const translateX = offset * 210; // horizontal spread
              const translateZ = -absOffset * 110; // depth push
              const rotateY = offset * -25; // 3D yaw angle
              const scale = isCenter ? 1 : Math.max(0.72, 1 - absOffset * 0.14);
              const opacity = isCenter ? 1 : Math.max(0.35, 1 - absOffset * 0.3);
              const zIndex = 30 - Math.round(absOffset * 5);

              return (
                <div
                  key={f.id}
                  onClick={() => selectByIndex(idx)}
                  style={{
                    transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                    opacity,
                    zIndex,
                    transition: "all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)",
                  }}
                  className={`absolute w-[240px] sm:w-[270px] rounded-2xl cursor-pointer overflow-hidden border-2 bg-card shadow-xl ${
                    isCenter
                      ? "border-primary glow-primary ring-4 ring-primary/20"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  {/* Field Image with badge */}
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={`/fields/img-${(idx % 6) + 1}.jpg`}
                      alt={f.ten_san}
                      className={`w-full h-full object-cover ${isCenter ? "ken-burns" : ""}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    
                    {/* Active Selected Badge */}
                    {isCenter && (
                      <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center gap-1 shadow-md">
                        <Check className="w-3 h-3" />
                        <span>Đang chọn</span>
                      </div>
                    )}

                    {/* Field Type Tag */}
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold">
                      {f.loai_san === "SAN_5" ? "Sân 5vs5" : "Sân 7vs7"}
                    </div>

                    <div className="absolute bottom-2 left-3 right-3 text-white">
                      <div className="font-display font-bold text-base leading-tight drop-shadow truncate">
                        {f.ten_san}
                      </div>
                      <div className="text-[11px] text-white/80 flex items-center gap-1 mt-0.5">
                        <Users className="w-3 h-3" />
                        <span>Sức chứa: {f.suc_chua} người</span>
                      </div>
                    </div>
                  </div>

                  {/* Pricing and Details */}
                  <div className="p-3 bg-card flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Giá thường</div>
                      <div className="text-sm font-bold text-primary">
                        {formatVND(f.gia_tieu_chuan)}/h
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-muted-foreground">Cao điểm</div>
                      <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {formatVND(f.gia_cao_diem)}/h
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Navigation Arrows */}
          <button
            onClick={goToPrev}
            aria-label="Sân trước"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-40 w-11 h-11 rounded-full bg-card/90 hover:bg-card border border-border shadow-lg flex items-center justify-center text-foreground hover:text-primary transition-all active:scale-90"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={goToNext}
            aria-label="Sân tiếp theo"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-40 w-11 h-11 rounded-full bg-card/90 hover:bg-card border border-border shadow-lg flex items-center justify-center text-foreground hover:text-primary transition-all active:scale-90"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {fields.map((f, idx) => (
              <button
                key={f.id}
                onClick={() => selectByIndex(idx)}
                className={`transition-all rounded-full ${
                  idx === currentIndex
                    ? "w-7 h-2 bg-primary"
                    : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                }`}
                title={f.ten_san}
              />
            ))}
          </div>
          
          <div className="text-center text-xs text-muted-foreground mt-2">
            Vuốt hoặc bấm mũi tên để xoay chọn sân quanh trục 3D
          </div>
        </div>
      ) : (
        /* Classic Grid View */
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {fields.map((f, idx) => (
            <button
              key={f.id}
              onClick={() => onSelectField(f)}
              className={`rounded-2xl border-2 text-left overflow-hidden transition-all duration-200 ${
                activeField.id === f.id
                  ? "border-primary shadow-lg scale-[1.02] ring-2 ring-primary/20"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="relative aspect-[4/3]">
                <img
                  src={`/fields/img-${(idx % 6) + 1}.jpg`}
                  alt={f.ten_san}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-2 left-2 right-2 text-white">
                  <div className="font-bold text-sm drop-shadow truncate">{f.ten_san}</div>
                </div>
                {activeField.id === f.id && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs shadow-md">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
              <div className="p-3 bg-card">
                <div className="text-xs text-muted-foreground mb-0.5">
                  {f.loai_san === "SAN_5" ? "5 vs 5" : "7 vs 7"} · {f.suc_chua} người
                </div>
                <div className="text-sm font-semibold text-primary">
                  {formatVND(f.gia_tieu_chuan)}/h
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
