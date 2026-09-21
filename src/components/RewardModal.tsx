"use client";

import { useEffect, useState } from "react";
import { CopyPlus, Gift, Play, Rocket, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BuffKey } from "@/types/game";

type RewardModalProps = {
  rewardOpen: boolean;
  rewardWatching: boolean;
  rewardSeconds: number;
  itemRewardOpen: boolean;
  itemReward: BuffKey | null;
  isBreak: boolean;
  onStartVideo: () => void;
  onSkipVideo: () => void;
  onItemRewardDismiss: () => void;
};

type ItemRewardDetail = {
  name: string;
  description: string;
  Icon: LucideIcon;
  iconClassName: string;
};

const button = "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-2 text-xs font-bold transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0 sm:gap-1.5 sm:px-3 sm:text-sm";

const ITEM_REWARD_DETAILS: Record<BuffKey, ItemRewardDetail> = {
  doubleDrop: {
    name: "ダブルドロップ",
    description: "使用すると、30分間1回のトマト供給量が2倍になります。",
    Icon: CopyPlus,
    iconClassName: "text-red-400",
  },
  balloonBoost: {
    name: "気球・ロケットブースト",
    description: "使用すると、30分間気球・ロケットイベントの出現確率が2倍になります。",
    Icon: Rocket,
    iconClassName: "text-sky-400",
  },
  goldBoost: {
    name: "ゴールドブースト",
    description: "使用すると、30分間金トマトの出現確率が2倍になります。",
    Icon: Sparkles,
    iconClassName: "text-amber-400",
  },
};

export function RewardModal({
  rewardOpen,
  rewardWatching,
  rewardSeconds,
  itemRewardOpen,
  itemReward,
  isBreak,
  onStartVideo,
  onSkipVideo,
  onItemRewardDismiss,
}: RewardModalProps) {
  const [itemToastVisible, setItemToastVisible] = useState(false);

  useEffect(() => {
    if (!itemRewardOpen || !itemReward) {
      setItemToastVisible(false);
      return;
    }

    setItemToastVisible(false);
    const enterFrame = window.requestAnimationFrame(() => setItemToastVisible(true));
    const fadeTimer = window.setTimeout(() => setItemToastVisible(false), 1_500);
    const dismissTimer = window.setTimeout(onItemRewardDismiss, 2_000);

    return () => {
      window.cancelAnimationFrame(enterFrame);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [itemReward, itemRewardOpen, onItemRewardDismiss]);

  if (rewardOpen) {
    return (
      <div className={`absolute inset-0 z-[60] grid place-items-center p-4 backdrop-blur-md ${isBreak ? "bg-neutral-200/85" : "bg-neutral-950/85"}`}>
        <section className={`w-full max-w-md rounded-3xl border p-6 text-center shadow-2xl ${isBreak ? "border-emerald-300 bg-white text-neutral-950" : "border-neutral-700 bg-neutral-900 text-white"}`} role="dialog" aria-modal="true" aria-labelledby="reward-title">
          <Gift className="mx-auto mb-3 text-amber-400" size={40} />
          <h2 id="reward-title" className="text-xl font-black">お疲れ様でした！</h2>
          <p className={`mt-3 text-sm leading-relaxed ${isBreak ? "text-neutral-600" : "text-neutral-300"}`}>
            動画を見て、ボーナストマトモードを発動しますか？
          </p>
          {rewardWatching ? (
            <div className="mt-6 rounded-2xl border border-amber-400/40 bg-black/80 p-8 text-white">
              <p className="text-xs font-bold tracking-[0.25em] text-white/60">REWARD VIDEO</p>
              <p className="mt-3 text-5xl font-black tabular-nums">{rewardSeconds}</p>
              <p className="mt-2 text-xs text-white/60">再生完了までお待ちください</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              <button className={`${button} w-full bg-amber-400 text-neutral-950`} onClick={onStartVideo}>
                <Play size={18} fill="currentColor" />動画を見てボーナス獲得
              </button>
              <button className={`${button} w-full ${isBreak ? "bg-neutral-200 text-neutral-800" : "bg-neutral-800 text-neutral-200"}`} onClick={onSkipVideo}>
                スキップして通常休憩
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (!itemRewardOpen || !itemReward) return null;

  const reward = ITEM_REWARD_DETAILS[itemReward];
  const RewardIcon = reward.Icon;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-[60] flex justify-center px-4 sm:top-24" aria-live="polite">
      <section
        className={`w-full max-w-sm rounded-3xl border p-5 text-center shadow-[0_18px_70px_rgba(251,191,36,0.3)] transition-all duration-500 ease-out ${itemToastVisible ? "scale-100 opacity-100" : "scale-75 opacity-0"} ${isBreak ? "border-amber-300/80 bg-white/95 text-neutral-950" : "border-amber-400/50 bg-neutral-900/95 text-white"}`}
        role="status"
      >
        <p className={`text-xs font-black tracking-[0.24em] ${isBreak ? "text-amber-700" : "text-amber-300"}`}>ITEM GET!</p>
        <div className={`mx-auto mt-3 grid size-16 place-items-center rounded-2xl border shadow-[0_0_28px_rgba(251,191,36,0.35)] ${isBreak ? "border-amber-200 bg-amber-50" : "border-amber-400/30 bg-neutral-950"}`}>
          <RewardIcon className={reward.iconClassName} size={38} strokeWidth={1.8} />
        </div>
        <h2 className="mt-3 text-xl font-black">{reward.name}</h2>
        <p className={`mt-2 text-sm leading-relaxed ${isBreak ? "text-neutral-600" : "text-neutral-300"}`}>{reward.description}</p>
      </section>
    </div>
  );
}
