"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coffee, Pause, Pencil, Play, Radio, Repeat, RotateCcw, Sparkles, Store, X, Zap } from "lucide-react";
import { PhysicsCanvas, type PhysicsCanvasHandle } from "@/components/PhysicsCanvas";
import { useTimer } from "@/hooks/useTimer";
import { CONFIG, type TomatoCounts, type TimerMode } from "@/lib/config";

const button = "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0";
const quiet = `${button} bg-zinc-800 text-zinc-100 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700`;
const PROGRESS_STORAGE_KEY = "tomato-focus:progress:v1";
const UNLOCKED_ITEMS_STORAGE_KEY = "pomo_unlocked_items";
const MAX_SAFE_SAVED_TOMATOES = 50_000;
type BuffKey = "doubleDrop" | "balloonBoost" | "goldBoost";
type ActiveBuffs = Record<BuffKey, boolean>;
const INITIAL_BUFFS: ActiveBuffs = { doubleDrop: false, balloonBoost: false, goldBoost: false };
type BuffRemaining = Record<BuffKey, number>;
const BUFF_DURATION_SECONDS = 30 * 60;
const INITIAL_BUFF_REMAINING: BuffRemaining = { doubleDrop: 0, balloonBoost: 0, goldBoost: 0 };
type UnlockedItems = { ufo: boolean; bird: boolean; balloon: boolean };
const INITIAL_UNLOCKED_ITEMS: UnlockedItems = { ufo: false, bird: false, balloon: false };

const saveLocalStorage = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
};

const readStoredCounts = (): TomatoCounts => {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) ?? "null");
    const normal = Number(saved?.normal);
    const gold = Number(saved?.gold);
    const valid = Number.isSafeInteger(normal)
      && Number.isSafeInteger(gold)
      && normal >= 0
      && gold >= 0
      && normal + gold <= MAX_SAFE_SAVED_TOMATOES;
    if (valid) return { normal, gold };
    localStorage.removeItem(CONFIG.storageKey);
  } catch {
    try { localStorage.removeItem(CONFIG.storageKey); } catch { return { normal: 0, gold: 0 }; }
  }
  return { normal: 0, gold: 0 };
};

const formatBuffTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

export default function Home() {
  const physics = useRef<PhysicsCanvasHandle>(null);
  const [counts, setCounts] = useState<TomatoCounts>({ normal: 0, gold: 0 });
  const [goldenTomatoes, setGoldenTomatoes] = useState(0);
  const [activeBuffs, setActiveBuffs] = useState<ActiveBuffs>(INITIAL_BUFFS);
  const [buffRemaining, setBuffRemaining] = useState<BuffRemaining>(INITIAL_BUFF_REMAINING);
  const [unlockedItems, setUnlockedItems] = useState<UnlockedItems>(INITIAL_UNLOCKED_ITEMS);
  const [shopOpen, setShopOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setCounts(readStoredCounts());
    try {
      const progress = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) ?? "null");
      const storedGoldenTomatoes = Number(progress?.goldenTomatoes);
      setGoldenTomatoes(Number.isSafeInteger(storedGoldenTomatoes)
        && storedGoldenTomatoes >= 0
        && storedGoldenTomatoes <= MAX_SAFE_SAVED_TOMATOES
        ? storedGoldenTomatoes
        : 0);
      const storedDoubleDropActive = Boolean(progress?.activeBuffs?.doubleDrop);
      const storedBalloonBoostActive = Boolean(progress?.activeBuffs?.balloonBoost);
      const storedGoldBoostActive = Boolean(progress?.activeBuffs?.goldBoost);
      const storedDoubleDropRemaining = Number(progress?.buffRemaining?.doubleDrop);
      const storedBalloonBoostRemaining = Number(progress?.buffRemaining?.balloonBoost);
      const storedGoldBoostRemaining = Number(progress?.buffRemaining?.goldBoost);
      const doubleDropRemaining = storedDoubleDropActive
        ? Number.isSafeInteger(storedDoubleDropRemaining) && storedDoubleDropRemaining >= 0 && storedDoubleDropRemaining <= BUFF_DURATION_SECONDS
          ? storedDoubleDropRemaining
          : BUFF_DURATION_SECONDS
        : 0;
      const balloonBoostRemaining = storedBalloonBoostActive
        ? Number.isSafeInteger(storedBalloonBoostRemaining) && storedBalloonBoostRemaining >= 0 && storedBalloonBoostRemaining <= BUFF_DURATION_SECONDS
          ? storedBalloonBoostRemaining
          : BUFF_DURATION_SECONDS
        : 0;
      const goldBoostRemaining = storedGoldBoostActive
        ? Number.isSafeInteger(storedGoldBoostRemaining) && storedGoldBoostRemaining >= 0 && storedGoldBoostRemaining <= BUFF_DURATION_SECONDS
          ? storedGoldBoostRemaining
          : BUFF_DURATION_SECONDS
        : 0;
      setActiveBuffs({
        doubleDrop: storedDoubleDropActive && doubleDropRemaining > 0,
        balloonBoost: storedBalloonBoostActive && balloonBoostRemaining > 0,
        goldBoost: storedGoldBoostActive && goldBoostRemaining > 0,
      });
      setBuffRemaining({
        doubleDrop: doubleDropRemaining,
        balloonBoost: balloonBoostRemaining,
        goldBoost: goldBoostRemaining,
      });
      setUnlockedItems({
        ufo: progress?.unlockedItems?.ufo === true,
        bird: progress?.unlockedItems?.bird === true,
        balloon: progress?.unlockedItems?.balloon === true,
      });
      try {
        const storedUnlockedItems = JSON.parse(localStorage.getItem(UNLOCKED_ITEMS_STORAGE_KEY) ?? "null");
        if (storedUnlockedItems && typeof storedUnlockedItems === "object") {
          setUnlockedItems((current) => ({ ...current, ufo: storedUnlockedItems.ufo === true }));
        }
      } catch {
        localStorage.removeItem(UNLOCKED_ITEMS_STORAGE_KEY);
      }
    } catch {
      setGoldenTomatoes(0);
      setActiveBuffs(INITIAL_BUFFS);
      setBuffRemaining(INITIAL_BUFF_REMAINING);
      setUnlockedItems(INITIAL_UNLOCKED_ITEMS);
      try { localStorage.removeItem(PROGRESS_STORAGE_KEY); } catch { /* Storage is unavailable. */ }
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    saveLocalStorage(PROGRESS_STORAGE_KEY, { goldenTomatoes, activeBuffs, buffRemaining, unlockedItems });
  }, [activeBuffs, buffRemaining, goldenTomatoes, hydrated, unlockedItems]);
  useEffect(() => {
    if (!hydrated) return;
    saveLocalStorage(UNLOCKED_ITEMS_STORAGE_KEY, { ufo: unlockedItems.ufo });
  }, [hydrated, unlockedItems.ufo]);
  const awardTomato = useCallback(() => {
    const goldenChance = activeBuffs.goldBoost ? CONFIG.goldenChance * 2 : CONFIG.goldenChance;
    const golden = Math.random() < goldenChance;
    setCounts((current) => {
      const key = golden ? "gold" : "normal";
      const next = { ...current, [key]: current[key] + 1 };
      saveLocalStorage(CONFIG.storageKey, next);
      return next;
    });
    physics.current?.drop(golden);
  }, [activeBuffs.goldBoost]);
  const recordBonusTomato = useCallback((golden: boolean) => {
    setCounts((current) => {
      const key = golden ? "gold" : "normal";
      const next = { ...current, [key]: current[key] + 1 };
      saveLocalStorage(CONFIG.storageKey, next);
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
    setBuffRemaining((current) => ({ ...current, [key]: BUFF_DURATION_SECONDS }));
    setCounts((current) => {
      const next = { ...current, gold: Math.max(0, current.gold - cost) };
      saveLocalStorage(CONFIG.storageKey, next);
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
      saveLocalStorage(CONFIG.storageKey, next);
      return next;
    });
  };
  const timer = useTimer(awardTomato);
  useEffect(() => {
    if (!hydrated || !timer.running || timer.mode !== "focus") return;
    const buffTimer = window.setInterval(() => {
      setBuffRemaining((current) => {
        if (current.doubleDrop <= 0 && current.balloonBoost <= 0 && current.goldBoost <= 0) return current;
        const next = {
          doubleDrop: Math.max(0, current.doubleDrop - 1),
          balloonBoost: Math.max(0, current.balloonBoost - 1),
          goldBoost: Math.max(0, current.goldBoost - 1),
        };
        if ((current.doubleDrop > 0 && next.doubleDrop === 0)
          || (current.balloonBoost > 0 && next.balloonBoost === 0)
          || (current.goldBoost > 0 && next.goldBoost === 0)) {
          setActiveBuffs((active) => ({
            doubleDrop: next.doubleDrop > 0 ? active.doubleDrop : false,
            balloonBoost: next.balloonBoost > 0 ? active.balloonBoost : false,
            goldBoost: next.goldBoost > 0 ? active.goldBoost : false,
          }));
        }
        return next;
      });
    }, 1_000);
    return () => window.clearInterval(buffTimer);
  }, [hydrated, timer.mode, timer.running]);
  const time = `${String(Math.floor(timer.remaining / 60)).padStart(2, "0")}:${String(timer.remaining % 60).padStart(2, "0")}`;
  const isBreak = timer.mode === "break";
  useEffect(() => { document.title = `${time} · ${timer.mode === "focus" ? "集中" : "休憩"}`; }, [time, timer.mode]);
  const quietClass = isBreak
    ? `${button} bg-white/80 text-neutral-900 ring-1 ring-inset ring-neutral-300 hover:bg-white`
    : quiet;
  const modeClass = (mode: TimerMode) => `${button} ${timer.mode === mode
    ? mode === "break" ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950"
    : isBreak ? "bg-white/80 text-neutral-800 ring-1 ring-inset ring-neutral-300" : "bg-neutral-800 text-neutral-300 ring-1 ring-inset ring-neutral-700"}`;

  return (
    <main className={`flex h-[100dvh] w-screen items-center justify-center overflow-hidden p-2 transition-colors duration-700 sm:p-4 ${isBreak ? "bg-neutral-100 text-neutral-950" : "bg-neutral-950 text-white"}`}>
      <section className={`relative isolate flex h-full max-h-[100dvh] w-full max-w-5xl flex-col justify-between overflow-hidden rounded-2xl border shadow-2xl transition-colors duration-700 ${isBreak ? "border-neutral-300 bg-neutral-50 shadow-neutral-400/30" : "border-neutral-800 bg-neutral-900 shadow-black/60"}`}>
        <div className={`pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[clamp(5rem,20vw,14rem)] font-black leading-none tracking-[-0.07em] tabular-nums transition-colors duration-700 ${isBreak ? "text-neutral-900" : "text-white/90"}`}>{time}</div>
        <PhysicsCanvas
          ref={physics}
          counts={counts}
          hydrated={hydrated}
          onBonusTomato={recordBonusTomato}
          onGoldenTomatoDrop={recordGoldenTomatoDrop}
          activeBuffs={activeBuffs}
          isUfoUnlocked={unlockedItems.ufo}
          timerMode={timer.mode}
          isTimerRunning={timer.running}
        />
        <div data-control-toolbar className={`absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-3 overflow-x-auto rounded-full border p-2 backdrop-blur transition-colors duration-700 sm:inset-x-6 sm:top-5 ${isBreak ? "border-neutral-300 bg-white/75" : "border-neutral-800/80 bg-neutral-950/65"}`}>
          <div className="flex shrink-0 items-center gap-2">
            <button className={modeClass("focus")} aria-label="集中 25分" title="集中 25分" onClick={() => timer.selectMode("focus")}><Pencil size={17} />25m</button>
            <button className={modeClass("break")} aria-label="休憩 5分" title="休憩 5分" onClick={() => timer.selectMode("break")}><Coffee size={17} />5m</button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className={`${button} ${isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950"}`} aria-label="開始" title="開始" disabled={timer.running} onClick={timer.start}><Play size={18} fill="currentColor" /></button>
            <button className={quietClass} aria-label="一時停止" title="一時停止" disabled={!timer.running} onClick={timer.pause}><Pause size={18} /></button>
            <button className={quietClass} aria-label="リセット" title="リセット" onClick={timer.reset}><RotateCcw size={18} /></button>
            <button className={`${button} border ${isBreak ? "border-emerald-500/60" : "border-red-500/60"} ${timer.autoLoopEnabled ? isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950" : isBreak ? "bg-white/80 text-neutral-900" : "bg-neutral-900"}`} aria-label={`自動切り替え ${timer.autoLoopEnabled ? "ON" : "OFF"}`} title="自動切り替え" aria-pressed={timer.autoLoopEnabled} onClick={timer.toggleAutoLoop}><Repeat size={18} /></button>
            <button className={`${button} border ${isBreak ? "border-emerald-500/60" : "border-red-500/60"} ${timer.debugEnabled ? isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950" : isBreak ? "bg-white/80 text-neutral-900" : "bg-neutral-900"}`} aria-label={`デバッグ ${timer.debugEnabled ? "ON" : "OFF"}`} title="デバッグ" aria-pressed={timer.debugEnabled} onClick={timer.toggleDebug}><Zap size={18} fill={timer.debugEnabled ? "currentColor" : "none"} /></button>
            <button className={quietClass} aria-label="ショップを開く" title="ショップ" onClick={() => setShopOpen(true)}><Store size={18} /></button>
            <span className={`inline-flex items-center gap-1 rounded-full border border-amber-400/30 px-3 py-2 text-sm font-bold ${isBreak ? "bg-white/80 text-amber-700" : "bg-neutral-950/80 text-amber-300"}`} title="所持している金のトマト"><Sparkles size={16} />× {goldenTomatoes}</span>
          </div>
        </div>

        {shopOpen && (
          <div className={`absolute inset-0 z-50 grid place-items-center p-4 backdrop-blur-sm ${isBreak ? "bg-neutral-200/75" : "bg-neutral-950/75"}`} role="presentation" onMouseDown={() => setShopOpen(false)}>
            <section className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl ${isBreak ? "border-neutral-300 bg-white text-neutral-950" : "border-neutral-700 bg-neutral-900"}`} role="dialog" aria-modal="true" aria-labelledby="shop-title" onMouseDown={(event) => event.stopPropagation()}>
              <header className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 id="shop-title" className="flex items-center gap-2 text-xl font-black"><Store className={isBreak ? "text-emerald-500" : "text-red-500"} />アイテム交換所</h2>
                  <p className={`mt-1 text-sm ${isBreak ? "text-neutral-600" : "text-neutral-400"}`}>金のトマトをバフと交換できます</p>
                </div>
                <button className={quietClass} aria-label="ショップを閉じる" onClick={() => setShopOpen(false)}><X size={18} /></button>
              </header>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <div className={`inline-flex items-center gap-2 rounded-full border border-amber-400/30 px-4 py-2 font-bold ${isBreak ? "bg-neutral-100 text-amber-700" : "bg-neutral-950 text-amber-300"}`}><Sparkles size={18} />所持 × {goldenTomatoes}</div>
                {unlockedItems.ufo ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/70 bg-emerald-400/15 px-4 py-2 text-xs font-black tracking-wide text-emerald-300"><Radio size={17} />UFO UNLOCKED</span>
                ) : (
                  <button className={`${button} bg-sky-400 text-zinc-950`} disabled={goldenTomatoes < 100} onClick={unlockUfo}><Radio size={17} />UFO解除 <Sparkles size={15} />× 100</button>
                )}
              </div>
              <div className="grid gap-3">
                <ShopItem title="ダブルドロップ" description="今後、1回の供給量を増やすためのバフです。" cost={3} active={activeBuffs.doubleDrop} remainingSeconds={buffRemaining.doubleDrop} affordable={goldenTomatoes >= 3} onActivate={() => activateBuff("doubleDrop", 3)} light={isBreak} />
                <ShopItem title="気球ブースト" description="気球イベントを強化するためのバフです。" cost={5} active={activeBuffs.balloonBoost} remainingSeconds={buffRemaining.balloonBoost} affordable={goldenTomatoes >= 5} onActivate={() => activateBuff("balloonBoost", 5)} light={isBreak} />
                <ShopItem title="ゴールドブースト" description="金トマトの出現確率をアップさせるバフです。" cost={10} active={activeBuffs.goldBoost} remainingSeconds={buffRemaining.goldBoost} affordable={goldenTomatoes >= 10} onActivate={() => activateBuff("goldBoost", 10)} light={isBreak} />
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function ShopItem({ title, description, cost, active, remainingSeconds, affordable, onActivate, light }: {
  title: string; description: string; cost: number; active: boolean; remainingSeconds: number; affordable: boolean; onActivate: () => void; light: boolean;
}) {
  return (
    <article className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${light ? "border-neutral-300 bg-neutral-100" : "border-neutral-800 bg-neutral-950/70"}`}>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p className={`mt-1 text-sm ${light ? "text-neutral-600" : "text-neutral-400"}`}>{description}</p>
        <p className={`mt-2 text-xs font-medium ${light ? "text-neutral-500" : "text-neutral-500"}`}>※集中タイマー実行中に合計30分間有効（休憩中は減算されません）</p>
      </div>
      {active ? (
        <div className="shrink-0 text-center">
          <span className="block rounded-full border border-emerald-400/70 bg-emerald-400/15 px-3 py-2 text-xs font-black tracking-wide text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.24)]">ACTIVE</span>
          <span className="mt-1 block text-[11px] font-bold tabular-nums text-emerald-300">{formatBuffTime(remainingSeconds)}</span>
        </div>
      ) : (
        <button className={`${button} shrink-0 ${light ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950"}`} disabled={!affordable} onClick={onActivate}>交換 <Sparkles size={15} />× {cost}</button>
      )}
    </article>
  );
}
