"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coffee, Pause, Pencil, Play, Repeat, RotateCcw, Sparkles, Store, X, Zap } from "lucide-react";
import { PhysicsCanvas, type PhysicsCanvasHandle } from "@/components/PhysicsCanvas";
import { useTimer } from "@/hooks/useTimer";
import { CONFIG, type TomatoCounts, type TimerMode } from "@/lib/config";

const button = "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0";
const quiet = `${button} bg-zinc-800 text-zinc-100 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700`;
const PROGRESS_STORAGE_KEY = "tomato-focus:progress:v1";
type BuffKey = "doubleDrop" | "balloonBoost";
type ActiveBuffs = Record<BuffKey, boolean>;
const INITIAL_BUFFS: ActiveBuffs = { doubleDrop: false, balloonBoost: false };

export default function Home() {
  const physics = useRef<PhysicsCanvasHandle>(null);
  const [counts, setCounts] = useState<TomatoCounts>({ normal: 0, gold: 0 });
  const [goldenTomatoes, setGoldenTomatoes] = useState(0);
  const [activeBuffs, setActiveBuffs] = useState<ActiveBuffs>(INITIAL_BUFFS);
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
    } catch { setCounts({ normal: 0, gold: 0 }); }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ goldenTomatoes, activeBuffs }));
  }, [activeBuffs, goldenTomatoes, hydrated]);
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
  const expireSessionBuffs = useCallback(() => {
    setActiveBuffs(INITIAL_BUFFS);
  }, []);
  const timer = useTimer(awardTomato, expireSessionBuffs);
  const time = `${String(Math.floor(timer.remaining / 60)).padStart(2, "0")}:${String(timer.remaining % 60).padStart(2, "0")}`;
  useEffect(() => { document.title = `${time} · ${timer.mode === "focus" ? "集中" : "休憩"}`; }, [time, timer.mode]);
  const modeClass = (mode: TimerMode) => `${button} ${timer.mode === mode ? "bg-red-500 text-zinc-950" : "bg-zinc-800 text-zinc-300 ring-1 ring-inset ring-zinc-700"}`;

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 p-3 text-zinc-100 sm:p-8">
      <section className="relative isolate h-[min(780px,calc(100vh-1.5rem))] min-h-[620px] w-full max-w-5xl overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60 sm:h-[min(780px,calc(100vh-4rem))]">
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[clamp(5rem,20vw,14rem)] font-black leading-none tracking-[-0.07em] text-white/80 tabular-nums">{time}</div>
        <PhysicsCanvas
          ref={physics}
          counts={counts}
          hydrated={hydrated}
          onBonusTomato={recordBonusTomato}
          onGoldenTomatoDrop={recordGoldenTomatoDrop}
        />
        <div data-control-toolbar className="absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-3 overflow-x-auto rounded-full border border-zinc-800/80 bg-zinc-950/65 p-2 backdrop-blur sm:inset-x-6 sm:top-5">
          <div className="flex shrink-0 items-center gap-2">
            <button className={modeClass("focus")} aria-label="集中 25分" title="集中 25分" onClick={() => timer.selectMode("focus")}><Pencil size={17} />25m</button>
            <button className={modeClass("break")} aria-label="休憩 5分" title="休憩 5分" onClick={() => timer.selectMode("break")}><Coffee size={17} />5m</button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className={`${button} bg-red-500 text-zinc-950`} aria-label="開始" title="開始" disabled={timer.running} onClick={timer.start}><Play size={18} fill="currentColor" /></button>
            <button className={quiet} aria-label="一時停止" title="一時停止" disabled={!timer.running} onClick={timer.pause}><Pause size={18} /></button>
            <button className={quiet} aria-label="リセット" title="リセット" onClick={timer.reset}><RotateCcw size={18} /></button>
            <button className={`${button} border border-red-500/60 ${timer.autoLoopEnabled ? "bg-red-500 text-zinc-950" : "bg-zinc-900"}`} aria-label={`自動切り替え ${timer.autoLoopEnabled ? "ON" : "OFF"}`} title="自動切り替え" aria-pressed={timer.autoLoopEnabled} onClick={timer.toggleAutoLoop}><Repeat size={18} /></button>
            <button className={`${button} border border-red-500/60 ${timer.debugEnabled ? "bg-red-500 text-zinc-950" : "bg-zinc-900"}`} aria-label={`デバッグ ${timer.debugEnabled ? "ON" : "OFF"}`} title="デバッグ" aria-pressed={timer.debugEnabled} onClick={timer.toggleDebug}><Zap size={18} fill={timer.debugEnabled ? "currentColor" : "none"} /></button>
            <button className={quiet} aria-label="ショップを開く" title="ショップ" onClick={() => setShopOpen(true)}><Store size={18} /></button>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-zinc-950/80 px-3 py-2 text-sm font-bold text-amber-300" title="所持している金のトマト"><Sparkles size={16} />× {goldenTomatoes}</span>
          </div>
        </div>

        {shopOpen && (
          <div className="absolute inset-0 z-50 grid place-items-center bg-zinc-950/75 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => setShopOpen(false)}>
            <section className="w-full max-w-lg rounded-3xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="shop-title" onMouseDown={(event) => event.stopPropagation()}>
              <header className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 id="shop-title" className="flex items-center gap-2 text-xl font-black"><Store className="text-red-500" />アイテム交換所</h2>
                  <p className="mt-1 text-sm text-zinc-400">金のトマトをバフと交換できます</p>
                </div>
                <button className={quiet} aria-label="ショップを閉じる" onClick={() => setShopOpen(false)}><X size={18} /></button>
              </header>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-zinc-950 px-4 py-2 font-bold text-amber-300"><Sparkles size={18} />所持 × {goldenTomatoes}</div>
              <div className="grid gap-3">
                <ShopItem title="ダブルドロップ" description="今後、1回の供給量を増やすためのバフです。" cost={3} active={activeBuffs.doubleDrop} affordable={goldenTomatoes >= 3} onActivate={() => activateBuff("doubleDrop", 3)} />
                <ShopItem title="気球ブースト" description="気球イベントを強化するためのバフです。" cost={5} active={activeBuffs.balloonBoost} affordable={goldenTomatoes >= 5} onActivate={() => activateBuff("balloonBoost", 5)} />
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function ShopItem({ title, description, cost, active, affordable, onActivate }: {
  title: string; description: string; cost: number; active: boolean; affordable: boolean; onActivate: () => void;
}) {
  return (
    <article className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
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
