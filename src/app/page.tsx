"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coffee, Disc3, FastForward, Gift, Pause, Pencil, Play, Repeat, RotateCcw, Sparkles, Store, Zap } from "lucide-react";
import { PhysicsCanvas, type PhysicsCanvasHandle } from "@/components/PhysicsCanvas";
import { AdContainer } from "@/components/AdContainer";
import { ShopModal } from "@/components/ShopModal";
import { useTimer } from "@/hooks/useTimer";
import { saveLocalStorage, useGameStorage } from "@/hooks/useGameStorage";
import { CONFIG, type TomatoCounts, type TimerMode } from "@/lib/config";
import type { ActiveBuffs, BuffKey, BuffRemaining, UnlockedItems } from "@/types/game";
import {
  BUFF_DURATION_SECONDS,
  BONUS_BREAK_GOLDEN_CHANCE,
  INITIAL_BUFF_REMAINING,
  INITIAL_BUFFS,
  INITIAL_UNLOCKED_ITEMS,
  SUPPLY_GOLDEN_CHANCE,
} from "@/constants/assets";

const button = "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0";
const quiet = `${button} bg-zinc-800 text-zinc-100 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700`;

export default function Home() {
  const physics = useRef<PhysicsCanvasHandle>(null);
  const [counts, setCounts] = useState<TomatoCounts>({ normal: 0, gold: 0 });
  const [goldenTomatoes, setGoldenTomatoes] = useState(0);
  const [activeBuffs, setActiveBuffs] = useState<ActiveBuffs>(INITIAL_BUFFS);
  const [buffRemaining, setBuffRemaining] = useState<BuffRemaining>(INITIAL_BUFF_REMAINING);
  const [unlockedItems, setUnlockedItems] = useState<UnlockedItems>(INITIAL_UNLOCKED_ITEMS);
  const [shopOpen, setShopOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [altitude, setAltitude] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(0);
  const [totalGoldTomatoes, setTotalGoldTomatoes] = useState(0);
  const [debugUfoMode, setDebugUfoMode] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardWatching, setRewardWatching] = useState(false);
  const [rewardSeconds, setRewardSeconds] = useState(5);
  const [isBonusBreakMode, setIsBonusBreakMode] = useState(false);
  const timerModeRef = useRef<TimerMode>("focus");
  useGameStorage({
    setCounts,
    goldenTomatoes,
    setGoldenTomatoes,
    activeBuffs,
    setActiveBuffs,
    buffRemaining,
    setBuffRemaining,
    unlockedItems,
    setUnlockedItems,
    hydrated,
    setHydrated,
    maxAltitude,
    setMaxAltitude,
    totalGoldTomatoes,
    setTotalGoldTomatoes,
  });
  const awardTomato = useCallback(() => {
    if (document.hidden) return;
    if (debugUfoMode) return;
    const baseGoldenChance = isBonusBreakMode ? BONUS_BREAK_GOLDEN_CHANCE : SUPPLY_GOLDEN_CHANCE;
    const goldenChance = activeBuffs.goldBoost ? baseGoldenChance * 2 : baseGoldenChance;
    const golden = Math.random() < goldenChance;
    setCounts((current) => {
      const key = golden ? "gold" : "normal";
      const next = { ...current, [key]: current[key] + 1 };
      saveLocalStorage(CONFIG.storageKey, next);
      return next;
    });
    physics.current?.drop(golden);
  }, [activeBuffs.goldBoost, debugUfoMode, isBonusBreakMode]);
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
    setTotalGoldTomatoes((current) => current + 1);
  }, []);
  const recordAltitude = useCallback((nextAltitude: number) => {
    setAltitude(nextAltitude);
    setMaxAltitude((current) => Math.max(current, nextAltitude));
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
  const unlockOctopus = () => {
    const cost = 1000;
    if (unlockedItems.octopus || goldenTomatoes < cost) return;
    physics.current?.removeGolden(cost);
    setGoldenTomatoes((current) => current - cost);
    setUnlockedItems((current) => ({ ...current, octopus: true }));
    setCounts((current) => {
      const next = { ...current, gold: Math.max(0, current.gold - cost) };
      saveLocalStorage(CONFIG.storageKey, next);
      return next;
    });
  };
  const clearBonusBreakState = useCallback(() => {
    setIsBonusBreakMode(false);
    setRewardOpen(false);
    setRewardWatching(false);
    setRewardSeconds(5);
  }, []);
  const handleSessionComplete = useCallback(() => {
    if (timerModeRef.current === "break") {
      clearBonusBreakState();
      return;
    }
    clearBonusBreakState();
    setRewardOpen(true);
  }, [clearBonusBreakState]);
  const timer = useTimer(awardTomato, handleSessionComplete);
  const pauseTomatoCycle = useCallback(() => {
    timer.pause();
  }, [timer.pause]);
  const resumeTomatoCycle = useCallback(() => {
    timer.start();
  }, [timer.start]);
  useEffect(() => {
    const handleSpaceToggle = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || rewardOpen || rewardWatching) return;
      const target = event.target;
      if (target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      event.preventDefault();
      if (timer.running) pauseTomatoCycle();
      else resumeTomatoCycle();
    };
    window.addEventListener("keydown", handleSpaceToggle);
    return () => window.removeEventListener("keydown", handleSpaceToggle);
  }, [pauseTomatoCycle, resumeTomatoCycle, rewardOpen, rewardWatching, timer.running]);
  const selectTimerMode = (mode: TimerMode) => {
    clearBonusBreakState();
    timer.selectMode(mode);
  };
  const resetTimer = () => {
    clearBonusBreakState();
    timer.reset();
  };
  useEffect(() => {
    timerModeRef.current = timer.mode;
    if (timer.mode !== "break") clearBonusBreakState();
  }, [clearBonusBreakState, timer.mode]);
  useEffect(() => {
    if (timer.mode === "break" && timer.remaining === 0) clearBonusBreakState();
  }, [clearBonusBreakState, timer.mode, timer.remaining]);
  useEffect(() => {
    if (!rewardOpen || timer.mode !== "break" || !timer.running) return;
    timer.pause();
  }, [rewardOpen, timer.mode, timer.pause, timer.running]);
  useEffect(() => {
    if (!rewardWatching) return;
    const rewardTimer = window.setInterval(() => {
      setRewardSeconds((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(rewardTimer);
  }, [rewardWatching]);
  useEffect(() => {
    if (!rewardWatching || rewardSeconds > 0) return;
    setRewardWatching(false);
    setRewardOpen(false);
    setIsBonusBreakMode(true);
    timer.start();
  }, [rewardSeconds, rewardWatching, timer.start]);
  useEffect(() => {
    if (!isBonusBreakMode || timer.mode !== "break" || !timer.running) return;
    const bonusSupplyTimer = window.setInterval(() => {
      if (document.hidden) return;
      const goldenChance = activeBuffs.goldBoost
        ? BONUS_BREAK_GOLDEN_CHANCE * 2
        : BONUS_BREAK_GOLDEN_CHANCE;
      const golden = Math.random() < goldenChance;
      setCounts((current) => {
        const key = golden ? "gold" : "normal";
        const next = { ...current, [key]: current[key] + 1 };
        saveLocalStorage(CONFIG.storageKey, next);
        return next;
      });
      physics.current?.drop(golden);
    }, 1_500);
    return () => window.clearInterval(bonusSupplyTimer);
  }, [activeBuffs.goldBoost, isBonusBreakMode, timer.mode, timer.running]);
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
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <main className={`flex h-[100dvh] w-screen items-center justify-center overflow-hidden p-2 transition-colors duration-700 sm:p-4 ${isBreak ? "bg-neutral-100 text-neutral-950" : "bg-neutral-950 text-white"}`}>
      <div className="flex h-full w-full max-w-[1380px] items-center justify-center gap-4 overflow-hidden">
        <section className={`relative isolate flex h-full max-h-[100dvh] w-full max-w-5xl flex-col justify-between overflow-hidden rounded-2xl border shadow-2xl transition-colors duration-700 ${isBreak ? "border-neutral-300 bg-neutral-50 shadow-neutral-400/30" : "border-neutral-800 bg-neutral-900 shadow-black/60"}`}>
          <div className={`pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[clamp(5rem,20vw,14rem)] font-black leading-none tracking-[-0.07em] tabular-nums transition-colors duration-700 ${isBreak ? "text-neutral-900" : "text-white/90"}`}>{time}</div>
          <AdContainer
            variant="mobile"
            className="absolute inset-x-2 top-[4.5rem] z-20 h-[50px] md:hidden"
          />
          <div className="absolute inset-x-0 bottom-0 top-[7.75rem] md:top-0">
            <PhysicsCanvas
              ref={physics}
              counts={counts}
              hydrated={hydrated}
              onBonusTomato={recordBonusTomato}
              onGoldenTomatoDrop={recordGoldenTomatoDrop}
              activeBuffs={activeBuffs}
              isUfoUnlocked={unlockedItems.ufo}
              isOctopusUnlocked={unlockedItems.octopus}
              debugUfoMode={debugUfoMode}
              isBonusBreakMode={isBonusBreakMode}
              timerMode={timer.mode}
              isTimerRunning={timer.running}
              initialMaxAltitude={maxAltitude}
              onAltitudeChange={recordAltitude}
            />
          </div>
          <div className={`pointer-events-none absolute bottom-3 right-3 z-20 rounded-full border px-3 py-1.5 text-xs font-black tabular-nums backdrop-blur sm:bottom-5 sm:right-5 ${isBreak ? "border-neutral-300 bg-white/75 text-neutral-800" : "border-white/15 bg-neutral-950/60 text-white/80"}`}>
            {altitude.toLocaleString("ja-JP")} m
          </div>
          <div data-control-toolbar className={`absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-3 overflow-x-auto rounded-full border p-2 backdrop-blur transition-colors duration-700 sm:inset-x-6 sm:top-5 ${isBreak ? "border-neutral-300 bg-white/75" : "border-neutral-800/80 bg-neutral-950/65"}`}>
            <div className="flex shrink-0 items-center gap-2">
              <button className={modeClass("focus")} aria-label="集中 25分" title="集中 25分" onClick={() => selectTimerMode("focus")}><Pencil size={17} />25m</button>
              <button className={modeClass("break")} aria-label="休憩 5分" title="休憩 5分" onClick={() => selectTimerMode("break")}><Coffee size={17} />5m</button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button className={`${button} ${isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950"}`} aria-label="開始" title="開始" disabled={timer.running} onClick={resumeTomatoCycle}><Play size={18} fill="currentColor" /></button>
              <button className={quietClass} aria-label="一時停止" title="一時停止" disabled={!timer.running} onClick={pauseTomatoCycle}><Pause size={18} /></button>
              <button className={quietClass} aria-label="リセット" title="リセット" onClick={resetTimer}><RotateCcw size={18} /></button>
              <button className={`${button} border ${isBreak ? "border-emerald-500/60" : "border-red-500/60"} ${timer.autoLoopEnabled ? isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950" : isBreak ? "bg-white/80 text-neutral-900" : "bg-neutral-900"}`} aria-label={`自動切り替え ${timer.autoLoopEnabled ? "ON" : "OFF"}`} title="自動切り替え" aria-pressed={timer.autoLoopEnabled} onClick={timer.toggleAutoLoop}><Repeat size={18} /></button>
              <button className={`${button} border ${isBreak ? "border-emerald-500/60" : "border-red-500/60"} ${timer.debugEnabled ? isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950" : isBreak ? "bg-white/80 text-neutral-900" : "bg-neutral-900"}`} aria-label={`デバッグ ${timer.debugEnabled ? "ON" : "OFF"}`} title="デバッグ" aria-pressed={timer.debugEnabled} onClick={timer.toggleDebug}><Zap size={18} fill={timer.debugEnabled ? "currentColor" : "none"} /></button>
              <button className={quietClass} aria-label="ショップを開く" title="ショップ" onClick={() => setShopOpen(true)}><Store size={18} /></button>
              <span className={`inline-flex items-center gap-1 rounded-full border border-amber-400/30 px-3 py-2 text-sm font-bold ${isBreak ? "bg-white/80 text-amber-700" : "bg-neutral-950/80 text-amber-300"}`} title="所持している金のトマト"><Sparkles size={16} />× {goldenTomatoes}</span>
              <button
                className={`${button} border ${debugUfoMode
                  ? isBreak
                    ? "border-cyan-500/70 bg-cyan-100 text-cyan-800"
                    : "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                  : isBreak
                    ? "border-neutral-300 bg-white/80 text-neutral-700"
                    : "border-neutral-700 bg-neutral-900 text-neutral-300"}`}
                aria-label={`UFOデバッグモード ${debugUfoMode ? "ON" : "OFF"}`}
                title="UFOデバッグモード"
                aria-pressed={debugUfoMode}
                onClick={() => setDebugUfoMode((enabled) => !enabled)}
              >
                <Disc3 aria-hidden="true" className="text-sky-400" size={18} />
              </button>
              {isDevelopment && (
                <button
                  className={`${button} border ${isBreak ? "border-violet-400/50 bg-violet-100 text-violet-700" : "border-violet-400/40 bg-violet-400/10 text-violet-300"}`}
                  aria-label="残り時間を10秒に短縮"
                  title="残り10秒にする"
                  onClick={() => timer.setRemainingSeconds(10)}
                >
                  <FastForward aria-hidden="true" size={18} />
                  <span className="text-[10px] tabular-nums">10s</span>
                </button>
              )}
            </div>
          </div>

          <ShopModal
            isOpen={shopOpen}
            onClose={() => setShopOpen(false)}
            goldTomatoCount={goldenTomatoes}
            isUfoUnlocked={unlockedItems.ufo}
            isOctopusUnlocked={unlockedItems.octopus}
            currentAltitude={altitude}
            activeBuffs={activeBuffs}
            buffRemaining={buffRemaining}
            onPurchaseItem={activateBuff}
            onUnlockUfo={unlockUfo}
            onUnlockOctopus={unlockOctopus}
            isBreak={isBreak}
          />
          {rewardOpen && (
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
                    <button className={`${button} w-full bg-amber-400 text-neutral-950`} onClick={() => { setRewardSeconds(5); setRewardWatching(true); }}>
                      <Play size={18} fill="currentColor" />動画を見てボーナス獲得
                    </button>
                    <button className={`${button} w-full ${isBreak ? "bg-neutral-200 text-neutral-800" : "bg-neutral-800 text-neutral-200"}`} onClick={() => { clearBonusBreakState(); timer.start(); }}>
                      スキップして通常休憩
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
        <AdContainer
          variant="desktop"
          className="hidden h-[min(600px,calc(100dvh-2rem))] w-[300px] shrink-0 md:flex xl:w-[336px]"
        />
      </div>
    </main>
  );
}
