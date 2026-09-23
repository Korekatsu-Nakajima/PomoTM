"use client";

import { Cloud, CopyPlus, Disc3, Radio, Rocket, Sparkles, Store, X } from "lucide-react";
import { PremiumPlanCard } from "@/components/PremiumPlanCard";
import type { ShopItemProps, ShopModalProps } from "@/types/game";
import { formatBuffTime } from "@/utils/gameUtils";
import { translations, type Language } from "@/utils/translations";

const button = "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0";
const unlockControl = "inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1.5 text-[9px] font-black tracking-tight transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0 sm:gap-1.5 sm:px-3 sm:text-xs";

type LocalizedShopModalProps = ShopModalProps & { language: Language };
type ShopItemLabels = Pick<typeof translations.ja.shop, "activeRemaining" | "notOwned" | "use">;
type LocalizedShopItemProps = ShopItemProps & { labels: ShopItemLabels };

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
  language,
}: LocalizedShopModalProps) {
  if (!isOpen) return null;
  const t = translations[language];
  const quietClass = isBreak
    ? `${button} bg-white/80 text-neutral-900 ring-1 ring-inset ring-neutral-300 hover:bg-white`
    : `${button} bg-zinc-800 text-zinc-100 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700`;

  return (
    <div className={`absolute inset-0 z-50 grid place-items-center p-4 backdrop-blur-sm ${isBreak ? "bg-neutral-200/75" : "bg-neutral-950/75"}`} role="presentation" onMouseDown={onClose}>
      <section className={`max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border p-6 shadow-2xl ${isBreak ? "border-neutral-300 bg-white text-neutral-950" : "border-neutral-700 bg-neutral-900"}`} role="dialog" aria-modal="true" aria-labelledby="shop-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 id="shop-title" className="flex items-center gap-2 text-xl font-black"><Store className={isBreak ? "text-emerald-500" : "text-red-500"} />{t.shop.title}</h2>
            <p className={`mt-1 text-sm ${isBreak ? "text-neutral-600" : "text-neutral-400"}`}>{t.shop.description}</p>
          </div>
          <button className={quietClass} aria-label={t.shop.close} title={t.shop.close} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mb-5 flex flex-row items-stretch gap-2.5">
          {isUfoUnlocked ? (
            <span className={`${unlockControl} border border-emerald-400/70 bg-emerald-400/15 text-emerald-300`}><Radio className="shrink-0" size={17} />{t.shop.ufoUnlocked}</span>
          ) : (
            <button className={`${unlockControl} bg-sky-400 text-zinc-950`} disabled={goldTomatoCount < 100} onClick={onUnlockUfo}><Radio className="shrink-0" size={17} />{t.shop.unlockUfo} <Sparkles className="shrink-0" size={15} />× 100</button>
          )}
          {isOctopusUnlocked ? (
            <span className={`${unlockControl} border border-violet-400/70 bg-violet-400/15 text-violet-300 shadow-[0_0_18px_rgba(167,139,250,0.24)]`}><Disc3 className="shrink-0" size={17} />{t.shop.octopusUnlocked}</span>
          ) : (
            <button className={`${unlockControl} bg-violet-500 text-white`} disabled={goldTomatoCount < 1000} onClick={onUnlockOctopus}><Disc3 className="shrink-0" size={17} />{t.shop.unlockOctopus} <Sparkles className="shrink-0" size={15} />× 1000</button>
          )}
        </div>
        <div className="grid gap-3">
          <ShopItem title={t.shop.doubleDrop} description={t.shop.doubleDropDescription} icon={<CopyPlus size={16} />} count={itemCounts.doubleDrop} active={activeBuffs.doubleDrop} remainingSeconds={buffRemaining.doubleDrop} onActivate={() => onUseItem("doubleDrop")} light={isBreak} labels={t.shop} />
          <ShopItem
            title={currentAltitude >= 3_000 ? t.shop.rocketBoost : t.shop.balloonBoost}
            description={currentAltitude >= 3_000
              ? t.shop.rocketBoostDescription
              : t.shop.balloonBoostDescription}
            icon={currentAltitude >= 3_000 ? <Rocket size={16} /> : <Cloud size={16} />}
            count={itemCounts.balloonBoost}
            active={activeBuffs.balloonBoost}
            remainingSeconds={buffRemaining.balloonBoost}
            onActivate={() => onUseItem("balloonBoost")}
            light={isBreak}
            labels={t.shop}
          />
          <ShopItem title={t.shop.goldBoost} description={t.shop.goldBoostDescription} icon={<Sparkles size={16} />} count={itemCounts.goldBoost} active={activeBuffs.goldBoost} remainingSeconds={buffRemaining.goldBoost} onActivate={() => onUseItem("goldBoost")} light={isBreak} labels={t.shop} />
        </div>
        <p className={`mt-4 text-xs opacity-75 ${isBreak ? "text-neutral-600" : "text-neutral-400"}`}>{t.shop.breakNote}</p>
        <PremiumPlanCard isBreak={isBreak} language={language} />
      </section>
    </div>
  );
}

function ShopItem({ title, description, icon, count, active, remainingSeconds, onActivate, light, labels }: LocalizedShopItemProps) {
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
            aria-label={labels.activeRemaining.replace("{time}", formatBuffTime(remainingSeconds))}
          >
            <span className="tabular-nums">{formatBuffTime(remainingSeconds)}</span>
          </button>
        ) : (
          <button className={`${button} w-full ${light ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950"}`} disabled={count < 1} onClick={onActivate}>{count < 1 ? labels.notOwned : labels.use}</button>
        )}
      </div>
    </article>
  );
}
