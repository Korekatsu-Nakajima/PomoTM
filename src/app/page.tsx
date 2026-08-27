"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coffee, Orbit, Pause, Pencil, Play, Repeat, RotateCcw, Sparkles, Store, X, Zap } from "lucide-react";
import { PhysicsCanvas, type PhysicsCanvasHandle } from "@/components/PhysicsCanvas";
import { useTimer } from "@/hooks/useTimer";
import { CONFIG, type TomatoCounts, type TimerMode } from "@/lib/config";

const button = "pointer-events-auto relative z-20 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full p-2 text-sm font-bold transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0 sm:p-3";
const quiet = `${button} bg-zinc-800 text-zinc-100 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700`;
const PROGRESS_STORAGE_KEY = "tomato-focus:progress:v1";
type BuffKey = "doubleDrop" | "balloonBoost";
type ActiveBuffs = Record<BuffKey, boolean>;
const INITIAL_BUFFS: ActiveBuffs = { doubleDrop: false, balloonBoost: false };
type UnlockedItems = { ufo: boolean };
const INITIAL_UNLOCKED_ITEMS: UnlockedItems = { ufo: false };

export default function Home() {
  const physics = useRef<PhysicsCanvasHandle>(null);
  const [counts, setCounts] = useState<TomatoCounts>({ normal: 0, gold: 0 });
  const [goldenTomatoes, setGoldenTomatoes] = useState(0);
  const [activeBuffs, setActiveBuffs] = useState<ActiveBuffs>(INITIAL_BUFFS);
  const [unlockedItems, setUnlockedItems] = useState<UnlockedItems>(INITIAL_UNLOCKED_ITEMS);
  const [shopOpen, setShopOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) ?? "null");
      setCounts({ normal: Math.max(0, Number(saved?.normal) || 0), gold: Math.max(0, Number(saved?.gold) || 0) });
      const progress = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? "null");
      setGoldenTomatoes(Math.max(0, Number(progress?.goldenTomatoes) || 0));
      setActiveBuffs({
        doubleDrop: Boolean(progress?.activeBuffs?.doubleDrop),
        balloonBoost: Boolean(progress?.activeBuffs?.balloonBoost),
      });
      setUnlockedItems({ ufo: Boolean(progress?.unlockedItems?.ufo) });
    } catch { setCounts({ normal: 0, gold: 0 }); }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ goldenTomatoes, activeBuffs, unlockedItems }));
  }, [activeBuffs, goldenTomatoes, hydrated, unlockedItems]);
  const awardTomato = useCallback(() => {
    const golden = Math.random() < CONFIG.goldenChance;
    setCounts((current) => {
      const key = golden ? "gold" : "normal";
      const next = { ...current, [key]: current[key] + 1 };
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(next));
      return next;
    });
    physics.current?.drop(golden);
  }, []);
  const recordBonusTomato = useCallback((golden: boolean) => {
    setCounts((current) => {
      const key = golden ? "gold" : "normal";
      const next = { ...current, [key]: current[key] + 1 };
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(next));
      return next;
    });
  }, []);
  const recordGoldenTomatoDrop = useCallback(() => {
    setGoldenTomatoes((current) => current + 1);
  }, []);
  const activateBuff = (key: BuffKey, cost: number) => {
    if (activeBuffs[key] || goldenTomatoes < cost) return;
    physics.current?.removeGolden(cost);
    setGoldenTomatoes((current) => current - cost);
    setActiveBuffs((current) => ({ ...current, [key]: true }));
    setCounts((current) => {
      const next = { ...current, gold: Math.max(0, current.gold - cost) };
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(next));
      return next;
    });
  };
  const unlockUfo = () => {
    const cost = 100;
    if (unlockedItems.ufo || goldenTomatoes < cost) return;
    physics.current?.removeGolden(cost);
    setGoldenTomatoes((current) => current - cost);
    setUnlockedItems((current) => ({ ...current, ufo: true }));
    setCounts((current) => {
      const next = { ...current, gold: Math.max(0, current.gold - cost) };
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(next));
      return next;
    });
  };
  const expireSessionBuffs = useCallback(() => {
    setActiveBuffs(INITIAL_BUFFS);
  }, []);
  const timer = useTimer(awardTomato, expireSessionBuffs);
  const isBreak = timer.mode === "break";
  const time = `${String(Math.floor(timer.remaining / 60)).padStart(2, "0")}:${String(timer.remaining % 60).padStart(2, "0")}`;
  useEffect(() => { document.title = `${time} · ${timer.mode === "focus" ? "集中" : "休憩"}`; }, [time, timer.mode]);
  const quietClass = isBreak ? `${button} bg-white/80 text-zinc-800 ring-1 ring-inset ring-zinc-300 hover:bg-white` : quiet;
  const modeClass = (mode: TimerMode) => `${button} ${timer.mode === mode ? "bg-red-500 text-zinc-950" : isBreak ? "bg-white/80 text-zinc-700 ring-1 ring-inset ring-zinc-300" : "bg-zinc-800 text-zinc-300 ring-1 ring-inset ring-zinc-700"}`;

  return (
    <main className={`grid h-[100dvh] w-screen select-none place-items-center overflow-hidden p-2 transition-colors duration-700 sm:p-6 ${isBreak ? "bg-zinc-100 text-zinc-900" : "bg-zinc-950 text-zinc-100"}`}>
      <section className={`relative isolate h-full w-full max-w-4xl overflow-hidden rounded-3xl border shadow-2xl transition-colors duration-700 ${isBreak ? "border-zinc-300 bg-zinc-50 shadow-zinc-400/30" : "border-zinc-800 bg-zinc-900 shadow-black/60"}`}>
        <PhysicsCanvas
          ref={physics}
          counts={counts}
          hydrated={hydrated}
          onBonusTomato={recordBonusTomato}
          onGoldenTomatoDrop={recordGoldenTomatoDrop}
          ufoUnlocked={unlockedItems.ufo}
          isBreak={isBreak}
        />
        <div className={`pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-6xl font-black leading-none tracking-[-0.07em] tabular-nums transition-colors duration-700 sm:text-8xl md:text-9xl ${isBreak ? "text-zinc-900/75" : "text-white/80"}`}>{time}</div>
        {isBreak && <div className="pointer-events-none absolute left-1/2 top-[63%] z-10 -translate-x-1/2 rounded-full border border-zinc-400/60 bg-white/60 px-4 py-1 text-xs font-black tracking-[0.3em] text-zinc-600">BREAK TIME</div>}
        <div data-control-toolbar className={`pointer-events-auto absolute inset-x-2 top-2 z-20 flex flex-wrap items-center justify-center gap-1 rounded-3xl border p-1 backdrop-blur transition-colors duration-700 sm:inset-x-6 sm:top-5 sm:justify-between sm:gap-2 sm:rounded-full sm:p-2 ${isBreak ? "border-zinc-300 bg-white/70" : "border-zinc-800/80 bg-zinc-950/65"}`}>
          <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
            <button className={modeClass("focus")} aria-label="集中 30分" title="集中 30分" onClick={() => timer.selectMode("focus")}><Pencil size={17} />30m</button>
            <button className={modeClass("break")} aria-label="休憩 5分" title="休憩 5分" onClick={() => timer.selectMode("break")}><Coffee size={17} />5m</button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
            <button className={`${button} bg-red-500 text-zinc-950`} aria-label="開始" title="開始" disabled={timer.running} onClick={timer.start}><Play size={18} fill="currentColor" /></button>
            <button className={quietClass} aria-label="一時停止" title="一時停止" disabled={!timer.running} onClick={timer.pause}><Pause size={18} /></button>
            <button className={quietClass} aria-label="リセット" title="リセット" onClick={timer.reset}><RotateCcw size={18} /></button>
            <button className={`${button} border border-red-500/60 ${timer.autoLoopEnabled ? "bg-red-500 text-zinc-950" : isBreak ? "bg-white/80 text-zinc-800" : "bg-zinc-900"}`} aria-label={`自動切り替え ${timer.autoLoopEnabled ? "ON" : "OFF"}`} title="自動切り替え" aria-pressed={timer.autoLoopEnabled} onClick={timer.toggleAutoLoop}><Repeat size={18} /></button>
            <button className={`${button} border border-red-500/60 ${timer.debugEnabled ? "bg-red-500 text-zinc-950" : isBreak ? "bg-white/80 text-zinc-800" : "bg-zinc-900"}`} aria-label={`デバッグ ${timer.debugEnabled ? "ON" : "OFF"}`} title="デバッグ" aria-pressed={timer.debugEnabled} onClick={timer.toggleDebug}><Zap size={18} fill={timer.debugEnabled ? "currentColor" : "none"} /></button>
            <button className={quietClass} aria-label="ショップを開く" title="ショップ" onClick={() => setShopOpen(true)}><Store size={18} /></button>
            <span className={`inline-flex items-center gap-1 rounded-full border border-amber-400/30 px-3 py-2 text-sm font-bold ${isBreak ? "bg-white/80 text-amber-700" : "bg-zinc-950/80 text-amber-300"}`} title="所持している金のトマト"><Sparkles size={16} />× {goldenTomatoes}</span>
          </div>
        </div>

        {shopOpen && (
          <div className={`pointer-events-auto fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/50 p-4 backdrop-blur-sm ${isBreak ? "bg-zinc-200/75" : "bg-zinc-950/75"}`} role="presentation" onMouseDown={() => setShopOpen(false)}>
            <section className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl ${isBreak ? "border-zinc-300 bg-white text-zinc-900" : "border-zinc-700 bg-zinc-900"}`} role="dialog" aria-modal="true" aria-labelledby="shop-title" onMouseDown={(event) => event.stopPropagation()}>
              <header className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 id="shop-title" className="flex items-center gap-2 text-xl font-black"><Store className="text-red-500" />アイテム交換所</h2>
                  <p className="mt-1 text-sm text-zinc-400">金のトマトをバフと交換できます</p>
                </div>
                <button className={quietClass} aria-label="ショップを閉じる" onClick={() => setShopOpen(false)}><X size={18} /></button>
              </header>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-zinc-950 px-4 py-2 font-bold text-amber-300"><Sparkles size={18} />所持 × {goldenTomatoes}</div>
              <div className="grid gap-3">
                <ShopItem title="ダブルドロップ" description="今後、1回の供給量を増やすためのバフです。" cost={3} active={activeBuffs.doubleDrop} affordable={goldenTomatoes >= 3} onActivate={() => activateBuff("doubleDrop", 3)} light={isBreak} />
                <ShopItem title="気球ブースト" description="気球イベントを強化するためのバフです。" cost={5} active={activeBuffs.balloonBoost} affordable={goldenTomatoes >= 5} onActivate={() => activateBuff("balloonBoost", 5)} light={isBreak} />
                <UnlockItem unlocked={unlockedItems.ufo} affordable={goldenTomatoes >= 100} onUnlock={unlockUfo} light={isBreak} />
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function UnlockItem({ unlocked, affordable, onUnlock, light }: {
  unlocked: boolean; affordable: boolean; onUnlock: () => void; light: boolean;
}) {
  return (
    <article className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${light ? "border-zinc-300 bg-zinc-100" : "border-zinc-800 bg-zinc-950/70"}`}>
      <div>
        <h3 className="flex items-center gap-2 font-bold"><Orbit className="text-red-500" size={18} />UFO</h3>
        <p className="mt-1 text-sm text-zinc-400">巨大トマトを投下するUFOイベントを永久解放します。</p>
        <p className="mt-2 text-xs font-medium text-zinc-500">永久解放・タイマー終了後も有効</p>
      </div>
      {unlocked ? (
        <span className="shrink-0 rounded-full border border-sky-400/70 bg-sky-400/15 px-3 py-2 text-xs font-black tracking-wide text-sky-300 shadow-[0_0_18px_rgba(56,189,248,0.22)]">UNLOCKED</span>
      ) : (
        <button className={`${button} shrink-0 bg-red-500 text-zinc-950`} disabled={!affordable} onClick={onUnlock}>交換 <Sparkles size={15} />× 100</button>
      )}
    </article>
  );
}

function ShopItem({ title, description, cost, active, affordable, onActivate, light }: {
  title: string; description: string; cost: number; active: boolean; affordable: boolean; onActivate: () => void; light: boolean;
}) {
  return (
    <article className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${light ? "border-zinc-300 bg-zinc-100" : "border-zinc-800 bg-zinc-950/70"}`}>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className="mt-1 text-sm text-zinc-400">{description}</p>
        <p className="mt-2 text-xs font-medium text-zinc-500">※現在のタイマー（1セッション）終了まで有効</p>
      </div>
      {active ? (
        <span className="shrink-0 rounded-full border border-emerald-400/70 bg-emerald-400/15 px-3 py-2 text-xs font-black tracking-wide text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.24)]">ACTIVE</span>
      ) : (
        <button className={`${button} shrink-0 bg-red-500 text-zinc-950`} disabled={!affordable} onClick={onActivate}>交換 <Sparkles size={15} />× {cost}</button>
      )}
    </article>
  );
}
