"use client";

import { Cloud, CopyPlus, Disc3, Radio, Rocket, Sparkles, Store, X } from "lucide-react";
import type { ShopItemProps, ShopModalProps } from "@/types/game";
import { formatBuffTime } from "@/utils/gameUtils";

const button = "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0";
const unlockControl = "inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[9px] font-black tracking-tight transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0 sm:gap-1.5 sm:px-3 sm:text-xs";

export function ShopModal({
  isOpen,
  onClose,
  goldTomatoCount,
  isUfoUnlocked,
  isOctopusUnlocked,
  currentAltitude,
  activeBuffs,
  buffRemaining,
  itemCounts,
  onUseItem,
  onUnlockUfo,
  onUnlockOctopus,
  isBreak,
}: ShopModalProps) {
  if (!isOpen) return null;
  const quietClass = isBreak
    ? `${button} bg-white/80 text-neutral-900 ring-1 ring-inset ring-neutral-300 hover:bg-white`
    : `${button} bg-zinc-800 text-zinc-100 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700`;

  return (
    <div className={`absolute inset-0 z-50 grid place-items-center p-4 backdrop-blur-sm ${isBreak ? "bg-neutral-200/75" : "bg-neutral-950/75"}`} role="presentation" onMouseDown={onClose}>
      <section className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl ${isBreak ? "border-neutral-300 bg-white text-neutral-950" : "border-neutral-700 bg-neutral-900"}`} role="dialog" aria-modal="true" aria-labelledby="shop-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 id="shop-title" className="flex items-center gap-2 text-xl font-black"><Store className={isBreak ? "text-emerald-500" : "text-red-500"} />アイテム管理</h2>
            <p className={`mt-1 text-sm ${isBreak ? "text-neutral-600" : "text-neutral-400"}`}>獲得したアイテムの確認と使用ができます</p>
          </div>
          <button className={quietClass} aria-label="ショップを閉じる" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mb-5 flex flex-row items-stretch gap-2.5">
          {isUfoUnlocked ? (
            <span className={`${unlockControl} border border-emerald-400/70 bg-emerald-400/15 text-emerald-300`}><Radio className="shrink-0" size={17} />UFO解除済み</span>
          ) : (
            <button className={`${unlockControl} bg-sky-400 text-zinc-950`} disabled={goldTomatoCount < 100} onClick={onUnlockUfo}><Radio className="shrink-0" size={17} />UFO解除 <Sparkles className="shrink-0" size={15} />× 100</button>
          )}
          {isOctopusUnlocked ? (
            <span className={`${unlockControl} border border-violet-400/70 bg-violet-400/15 text-violet-300 shadow-[0_0_18px_rgba(167,139,250,0.24)]`}><Disc3 className="shrink-0" size={17} />宇宙タコ解除済み</span>
          ) : (
            <button className={`${unlockControl} bg-violet-500 text-white`} disabled={goldTomatoCount < 1000} onClick={onUnlockOctopus}><Disc3 className="shrink-0" size={17} />宇宙タコ解除 <Sparkles className="shrink-0" size={15} />× 1000</button>
          )}
        </div>
        <div className="grid gap-3">
          <ShopItem title="ダブルドロップ" description="1回の供給量を増やすためのアイテムです。（有効時間: 30分）" icon={<CopyPlus size={16} />} count={itemCounts.doubleDrop} active={activeBuffs.doubleDrop} remainingSeconds={buffRemaining.doubleDrop} onActivate={() => onUseItem("doubleDrop")} light={isBreak} />
          <ShopItem
            title={currentAltitude >= 3_000 ? "ロケットブースト" : "気球ブースト"}
            description={currentAltitude >= 3_000
              ? "ロケットイベントを強化するためのアイテムです。（有効時間: 30分）"
              : "気球イベントを強化するためのアイテムです。（有効時間: 30分）"}
            icon={currentAltitude >= 3_000 ? <Rocket size={16} /> : <Cloud size={16} />}
            count={itemCounts.balloonBoost}
            active={activeBuffs.balloonBoost}
            remainingSeconds={buffRemaining.balloonBoost}
            onActivate={() => onUseItem("balloonBoost")}
            light={isBreak}
          />
          <ShopItem title="ゴールドブースト" description="金トマトの出現確率をアップさせるアイテムです。（有効時間: 30分）" icon={<Sparkles size={16} />} count={itemCounts.goldBoost} active={activeBuffs.goldBoost} remainingSeconds={buffRemaining.goldBoost} onActivate={() => onUseItem("goldBoost")} light={isBreak} />
        </div>
        <p className={`mt-4 text-xs opacity-75 ${isBreak ? "text-neutral-600" : "text-neutral-400"}`}>※休憩中はアイテムの減算は行われません。</p>
      </section>
    </div>
  );
}

function ShopItem({ title, description, icon, count, active, remainingSeconds, onActivate, light }: ShopItemProps) {
  return (
    <article className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${light ? "border-neutral-300 bg-neutral-100" : "border-neutral-800 bg-neutral-950/70"}`}>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className={`mt-1 text-sm ${light ? "text-neutral-600" : "text-neutral-400"}`}>{description}</p>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <span className={`inline-flex min-w-16 items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-xs font-black ${light ? "border-neutral-300 bg-white text-neutral-800" : "border-neutral-700 bg-zinc-900 text-zinc-100"}`}>{icon}× {count}</span>
        {active ? (
          <button
            className={`${button} pointer-events-none w-full border border-emerald-400/70 bg-emerald-400/15 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.24)] disabled:opacity-100`}
            type="button"
            disabled
            aria-label={`使用中 残り${formatBuffTime(remainingSeconds)}`}
          >
            <span className="tabular-nums">{formatBuffTime(remainingSeconds)}</span>
          </button>
        ) : (
          <button className={`${button} w-full ${light ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950"}`} disabled={count < 1} onClick={onActivate}>{count < 1 ? "未所持" : "使用"}</button>
        )}
      </div>
    </article>
  );
}
