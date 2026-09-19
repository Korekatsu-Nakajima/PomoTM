"use client";

import { useEffect, useState } from "react";
import type { AdBannerSlotProps } from "@/types/game";

export function AdContainer({ variant, className }: AdBannerSlotProps) {
  const [refreshCount, setRefreshCount] = useState(0);
  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      setRefreshCount((current) => current + 1);
    }, 30_000);
    return () => window.clearInterval(refreshTimer);
  }, []);
  return (
    <aside
      className={`${className} items-center justify-center overflow-hidden rounded-2xl border border-dashed border-neutral-500/30 bg-neutral-500/10 text-center backdrop-blur-sm`}
      aria-label={variant === "desktop" ? "サイドバー広告" : "モバイルバナー広告"}
      data-ad-refresh={refreshCount}
    >
      <div className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-current opacity-40">
        {variant === "desktop" ? "Sidebar Ad · 300 × 600" : "Banner Ad · Responsive"}
      </div>
    </aside>
  );
}
