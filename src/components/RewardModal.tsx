"use client";

import { CopyPlus, Gift, Play, Rocket, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BuffKey } from "@/types/game";

type RewardModalProps = {
  rewardOpen: boolean;
  rewardWatching: boolean;
  rewardSeconds: number;
  itemRewardOpen: boolean;
  itemReward: BuffKey | null;
  itemRewardRevealed: boolean;
  isBreak: boolean;
  onStartVideo: () => void;
  onSkipVideo: () => void;
  onRevealItem: () => void;
  onAcceptItem: () => void;
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
  itemRewardRevealed,
  isBreak,
  onStartVideo,
  onSkipVideo,
  onRevealItem,
  onAcceptItem,
}: RewardModalProps) {
  if (rewardOpen) {
    return (
      <div className={`absolute inset-0 z-[60] grid place-items-center p-4 backdrop-blur-md ${isBreak ? "bg-neutral-200/85" : "bg-neutral-950/85"}`}>
        <section className={`w-full max-w-md rounded-3xl border p-6 text-center shadow-2xl ${isBreak ? "border-emerald-300 bg-white text-neutral-950" : "border-neutral-700 bg-neutral-900 text-white"}`} role="dialog" aria-modal="true" aria-labelledby="reward-title">
          <Gift className="mx-auto mb-3 text-amber-400" size={40} />
          <h2 id="reward-title" className="text-xl font-black">お疲れ様でした！</h2>
          <p className={`mt-3 text-sm leading-relaxed ${isBreak ? "text-neutral-600" : "text-neutral-300"}`}>
            動画を見て休憩ボーナストマトモードを発動（5分間）
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
    <div className={`absolute inset-0 z-[60] grid place-items-center p-4 backdrop-blur-md ${isBreak ? "bg-neutral-200/85" : "bg-neutral-950/85"}`}>
      <section className={`w-full max-w-md rounded-3xl border p-6 text-center shadow-2xl ${isBreak ? "border-emerald-300 bg-white text-neutral-950" : "border-neutral-700 bg-neutral-900 text-white"}`} role="dialog" aria-modal="true" aria-labelledby="item-reward-title">
        {itemRewardRevealed ? (
          <>
            <p className={`text-xs font-black tracking-[0.24em] ${isBreak ? "text-neutral-500" : "text-neutral-400"}`}>ITEM GET!</p>
            <div className={`mx-auto mt-4 grid size-24 place-items-center rounded-3xl border shadow-xl ${isBreak ? "border-neutral-200 bg-neutral-100" : "border-neutral-700 bg-neutral-950"}`}>
              <RewardIcon className={reward.iconClassName} size={52} strokeWidth={1.8} />
            </div>
            <h2 id="item-reward-title" className="mt-5 text-2xl font-black">{reward.name}</h2>
            <p className={`mt-3 text-sm leading-relaxed ${isBreak ? "text-neutral-600" : "text-neutral-300"}`}>{reward.description}</p>
            <button className={`${button} mt-6 w-full bg-amber-400 text-neutral-950`} onClick={onAcceptItem}>
              受け取る
            </button>
          </>
        ) : (
          <button className="group w-full cursor-pointer rounded-3xl p-4 outline-none transition hover:scale-[1.03] active:scale-95" aria-label="宝箱を開ける" onClick={onRevealItem}>
            <Gift className="mx-auto animate-[pulse_1.6s_ease-in-out_infinite] text-amber-400 drop-shadow-[0_0_24px_rgba(251,191,36,0.45)] transition group-hover:rotate-3 group-hover:scale-110" size={92} strokeWidth={1.6} />
            <h2 id="item-reward-title" className="mt-5 text-2xl font-black">アイテムをゲット！</h2>
            <span className={`mt-3 block animate-pulse text-sm font-black tracking-[0.25em] ${isBreak ? "text-neutral-600" : "text-white/70"}`}>Touch!</span>
          </button>
        )}
      </section>
    </div>
  );
}
