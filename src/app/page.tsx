"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cat, Coffee, Disc3, FastForward, Pause, Pencil, Play, Repeat, RotateCcw, Sparkles, Store, Zap } from "lucide-react";
import { PhysicsCanvas, type PhysicsCanvasHandle } from "@/components/PhysicsCanvas";
import { AdContainer } from "@/components/AdContainer";
import { RewardModal } from "@/components/RewardModal";
import { ShopModal } from "@/components/ShopModal";
import { useDebugMode } from "@/hooks/useDebugMode";
import { useTimer } from "@/hooks/useTimer";
import { saveLocalStorage, useGameStorage } from "@/hooks/useGameStorage";
import { CONFIG, type TomatoCounts, type TimerMode } from "@/lib/config";
import type { ActiveBuffs, BuffKey, BuffRemaining, ItemCounts, UnlockedItems } from "@/types/game";
import {
  BUFF_DURATION_SECONDS,
  BONUS_BREAK_GOLDEN_CHANCE,
  INITIAL_BUFF_REMAINING,
  INITIAL_BUFFS,
  INITIAL_UNLOCKED_ITEMS,
  SUPPLY_GOLDEN_CHANCE,
} from "@/constants/assets";

const button = "inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-2 text-xs font-bold transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0 sm:gap-1.5 sm:px-3 sm:text-sm";
const quiet = `${button} bg-zinc-800 text-zinc-100 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700`;
const INITIAL_ITEM_COUNTS: ItemCounts = { doubleDrop: 0, balloonBoost: 0, goldBoost: 0 };

export default function Home() {
  const isDebugMode = useDebugMode();
  const physics = useRef<PhysicsCanvasHandle>(null);
  const [counts, setCounts] = useState<TomatoCounts>({ normal: 0, gold: 0 });
  const [goldenTomatoes, setGoldenTomatoes] = useState(0);
  const [activeBuffs, setActiveBuffs] = useState<ActiveBuffs>(INITIAL_BUFFS);
  const [buffRemaining, setBuffRemaining] = useState<BuffRemaining>(INITIAL_BUFF_REMAINING);
  const [itemCounts, setItemCounts] = useState<ItemCounts>(INITIAL_ITEM_COUNTS);
  const [unlockedItems, setUnlockedItems] = useState<UnlockedItems>(INITIAL_UNLOCKED_ITEMS);
  const [shopOpen, setShopOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [altitude, setAltitude] = useState(0);
  const [maxAltitude, setMaxAltitude] = useState(0);
  const [totalGoldTomatoes, setTotalGoldTomatoes] = useState(0);
  const [debugUfoMode, setDebugUfoMode] = useState(false);
  const [debugCatMode, setDebugCatMode] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardWatching, setRewardWatching] = useState(false);
  const [rewardSeconds, setRewardSeconds] = useState(5);
  const [itemRewardOpen, setItemRewardOpen] = useState(false);
  const [itemRewardRevealed, setItemRewardRevealed] = useState(false);
  const [pendingItemReward, setPendingItemReward] = useState<BuffKey | null>(null);
  const [isBonusBreakMode, setIsBonusBreakMode] = useState(false);
  const timerModeRef = useRef<TimerMode>("focus");
  const pendingItemRewardRef = useRef<BuffKey | null>(null);
  const itemRewardGrantedRef = useRef(false);
  useGameStorage({
    setCounts,
    goldenTomatoes,
    setGoldenTomatoes,
    activeBuffs,
    setActiveBuffs,
    buffRemaining,
    setBuffRemaining,
    itemCounts,
    setItemCounts,
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
    if (isDebugMode && debugUfoMode) return;
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
  }, [activeBuffs.goldBoost, debugUfoMode, isBonusBreakMode, isDebugMode]);
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
  const useBuffItem = (key: BuffKey) => {
    if (activeBuffs[key] || itemCounts[key] < 1) return;
    setItemCounts((current) => ({ ...current, [key]: Math.max(0, current[key] - 1) }));
    setActiveBuffs((current) => ({ ...current, [key]: true }));
    setBuffRemaining((current) => ({ ...current, [key]: BUFF_DURATION_SECONDS }));
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
  const drawRandomItem = useCallback((): BuffKey => {
    const roll = Math.random();
    return roll < 0.4
      ? "doubleDrop"
      : roll < 0.8
        ? "balloonBoost"
        : "goldBoost";
  }, []);
  const openPendingItemReward = useCallback((bonusBreak: boolean) => {
    const reward = pendingItemRewardRef.current;
    setRewardWatching(false);
    setRewardOpen(false);
    setRewardSeconds(5);
    setIsBonusBreakMode(bonusBreak);
    setItemRewardRevealed(false);
    if (!reward) {
      setItemRewardOpen(false);
      return;
    }
    if (!itemRewardGrantedRef.current) {
      itemRewardGrantedRef.current = true;
      setItemCounts((current) => ({ ...current, [reward]: current[reward] + 1 }));
    }
    setItemRewardOpen(true);
  }, []);
  const handleSessionComplete = useCallback(() => {
    if (timerModeRef.current === "break") {
      clearBonusBreakState();
      return;
    }
    const reward = drawRandomItem();
    pendingItemRewardRef.current = reward;
    itemRewardGrantedRef.current = false;
    setPendingItemReward(reward);
    setItemRewardOpen(false);
    setItemRewardRevealed(false);
    clearBonusBreakState();
    setRewardOpen(true);
  }, [clearBonusBreakState, drawRandomItem]);
  const timer = useTimer(awardTomato, handleSessionComplete, isDebugMode);
  const pauseTomatoCycle = useCallback(() => {
    timer.pause();
  }, [timer.pause]);
  const resumeTomatoCycle = useCallback(() => {
    timer.start();
  }, [timer.start]);
  useEffect(() => {
    const handleSpaceToggle = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || rewardOpen || rewardWatching || itemRewardOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      event.preventDefault();
      if (timer.running) pauseTomatoCycle();
      else resumeTomatoCycle();
    };
    window.addEventListener("keydown", handleSpaceToggle);
    return () => window.removeEventListener("keydown", handleSpaceToggle);
  }, [itemRewardOpen, pauseTomatoCycle, resumeTomatoCycle, rewardOpen, rewardWatching, timer.running]);
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
    if (!isDebugMode) {
      setDebugUfoMode(false);
      setDebugCatMode(false);
    }
  }, [isDebugMode]);
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
    openPendingItemReward(true);
  }, [openPendingItemReward, rewardSeconds, rewardWatching]);
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
  return (
    <main className={`flex h-[100dvh] w-screen max-w-full items-center justify-center overflow-hidden p-2 transition-colors duration-700 sm:p-4 ${isBreak ? "bg-neutral-100 text-neutral-950" : "bg-neutral-950 text-white"}`}>
      <div className="flex h-full min-w-0 w-full max-w-[1380px] items-center justify-center gap-4 overflow-hidden">
        <section className={`relative isolate flex h-full min-w-0 w-full max-w-full max-h-[100dvh] sm:max-w-5xl flex-col justify-between overflow-hidden rounded-2xl border shadow-2xl transition-colors duration-700 ${isBreak ? "border-neutral-300 bg-neutral-50 shadow-neutral-400/30" : "border-neutral-800 bg-neutral-900 shadow-black/60"}`}>
          <div className={`pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[clamp(5rem,20vw,14rem)] font-black leading-none tracking-[-0.07em] tabular-nums transition-colors duration-700 ${isBreak ? "text-neutral-900" : "text-white/90"}`}>{time}</div>
          <AdContainer
            variant="mobile"
            className="absolute inset-x-2 top-[4.5rem] z-20 h-[50px] md:hidden"
          />
          <div className="absolute inset-x-0 bottom-0 top-[7.75rem] min-w-0 max-w-full overflow-hidden md:top-0">
            <PhysicsCanvas
              ref={physics}
              counts={counts}
              hydrated={hydrated}
              onBonusTomato={recordBonusTomato}
              onGoldenTomatoDrop={recordGoldenTomatoDrop}
              activeBuffs={activeBuffs}
              isUfoUnlocked={unlockedItems.ufo}
              isOctopusUnlocked={unlockedItems.octopus}
              isDebugMode={isDebugMode}
              debugUfoMode={isDebugMode && debugUfoMode}
              debugCatMode={isDebugMode && debugCatMode}
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
          <div data-control-toolbar className={`no-scrollbar absolute inset-x-3 top-3 z-30 flex min-w-0 max-w-full touch-pan-x items-center justify-start gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-full border p-1.5 backdrop-blur transition-colors duration-700 sm:inset-x-6 sm:top-5 sm:gap-2 sm:p-2 md:justify-between md:gap-3 ${isBreak ? "border-neutral-300 bg-white/75" : "border-neutral-800/80 bg-neutral-950/65"}`}>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button className={modeClass("focus")} aria-label="集中 25分" title="集中 25分" onClick={() => selectTimerMode("focus")}><Pencil size={17} />25m</button>
              <button className={modeClass("break")} aria-label="休憩 5分" title="休憩 5分" onClick={() => selectTimerMode("break")}><Coffee size={17} />5m</button>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button className={`${button} ${isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950"}`} aria-label="開始" title="開始" disabled={timer.running} onClick={resumeTomatoCycle}><Play size={18} fill="currentColor" /></button>
              <button className={quietClass} aria-label="一時停止" title="一時停止" disabled={!timer.running} onClick={pauseTomatoCycle}><Pause size={18} /></button>
              <button className={quietClass} aria-label="リセット" title="リセット" onClick={resetTimer}><RotateCcw size={18} /></button>
              <button className={`${button} border ${isBreak ? "border-emerald-500/60" : "border-red-500/60"} ${timer.autoLoopEnabled ? isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950" : isBreak ? "bg-white/80 text-neutral-900" : "bg-neutral-900"}`} aria-label={`自動切り替え ${timer.autoLoopEnabled ? "ON" : "OFF"}`} title="自動切り替え" aria-pressed={timer.autoLoopEnabled} onClick={timer.toggleAutoLoop}><Repeat size={18} /></button>
              {isDebugMode && (
                <button className={`${button} border ${isBreak ? "border-emerald-500/60" : "border-red-500/60"} ${timer.debugEnabled ? isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950" : isBreak ? "bg-white/80 text-neutral-900" : "bg-neutral-900"}`} aria-label={`デバッグ ${timer.debugEnabled ? "ON" : "OFF"}`} title="デバッグ" aria-pressed={timer.debugEnabled} onClick={timer.toggleDebug}><Zap size={18} fill={timer.debugEnabled ? "currentColor" : "none"} /></button>
              )}
              <button className={quietClass} aria-label="ショップを開く" title="ショップ" onClick={() => setShopOpen(true)}><Store size={18} /></button>
              <span className={`inline-flex items-center gap-1 rounded-full border border-amber-400/30 px-3 py-2 text-sm font-bold ${isBreak ? "bg-white/80 text-amber-700" : "bg-neutral-950/80 text-amber-300"}`} title="所持している金のトマト"><Sparkles size={16} />× {goldenTomatoes}</span>
              {isDebugMode && (
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
                  onClick={() => {
                    const next = !debugUfoMode;
                    setDebugUfoMode(next);
                    if (next) setDebugCatMode(false);
                  }}
                >
                  <Disc3 aria-hidden="true" className="text-sky-400" size={18} />
                </button>
              )}
              {isDebugMode && (
                <button
                  className={`${button} border ${debugCatMode
                    ? isBreak
                      ? "border-cyan-500/70 bg-cyan-100 text-cyan-800"
                      : "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                    : isBreak
                      ? "border-neutral-300 bg-white/80 text-neutral-700"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300"}`}
                  aria-label={`猫デバッグモード ${debugCatMode ? "ON" : "OFF"}`}
                  title="猫デバッグモード"
                  aria-pressed={debugCatMode}
                  onClick={() => {
                    const next = !debugCatMode;
                    setDebugCatMode(next);
                    if (next) setDebugUfoMode(false);
                  }}
                >
                  <Cat aria-hidden="true" className="text-sky-400" size={18} />
                </button>
              )}
              {isDebugMode && (
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
            itemCounts={itemCounts}
            onUseItem={useBuffItem}
            onUnlockUfo={unlockUfo}
            onUnlockOctopus={unlockOctopus}
            isBreak={isBreak}
          />
          <RewardModal
            rewardOpen={rewardOpen}
            rewardWatching={rewardWatching}
            rewardSeconds={rewardSeconds}
            itemRewardOpen={itemRewardOpen}
            itemReward={pendingItemReward}
            itemRewardRevealed={itemRewardRevealed}
            isBreak={isBreak}
            onStartVideo={() => { setRewardSeconds(5); setRewardWatching(true); }}
            onSkipVideo={() => openPendingItemReward(false)}
            onRevealItem={() => setItemRewardRevealed(true)}
            onAcceptItem={() => {
              setItemRewardOpen(false);
              setItemRewardRevealed(false);
              setPendingItemReward(null);
              pendingItemRewardRef.current = null;
              itemRewardGrantedRef.current = false;
              timer.start();
            }}
          />
        </section>
        <AdContainer
          variant="desktop"
          className="hidden h-[min(600px,calc(100dvh-2rem))] w-[300px] shrink-0 md:flex xl:w-[336px]"
        />
      </div>
    </main>
  );
}
