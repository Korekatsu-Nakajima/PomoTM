"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Cat, Coffee, Disc3, FastForward, Gem, Pause, Pencil, Play, Repeat, RotateCcw, Settings, Sparkles, Store, X, Zap } from "lucide-react";
import { PhysicsCanvas, type PhysicsCanvasHandle } from "@/components/PhysicsCanvas";
import { AdContainer } from "@/components/AdContainer";
import { AuthModal } from "@/components/AuthModal";
import { RewardModal } from "@/components/RewardModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ShopModal } from "@/components/ShopModal";
import { useDebugMode } from "@/hooks/useDebugMode";
import { useTimer } from "@/hooks/useTimer";
import { saveLocalStorage, useGameStorage } from "@/hooks/useGameStorage";
import { CONFIG, type TomatoCounts, type TimerMode } from "@/lib/config";
import { auth } from "@/lib/firebase";
import { fetchPremiumStatus } from "@/lib/premium";
import type { ActiveBuffs, BuffKey, BuffRemaining, ItemCounts, UnlockedItems } from "@/types/game";
import { isLanguage, LANGUAGE_STORAGE_KEY, translations, type Language } from "@/utils/translations";
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
const SOUND_ENABLED_STORAGE_KEY = "pomotm_sound_enabled";
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
type DevPremiumState = "standard" | "premium";

function detectBrowserLanguage(): Language {
  if (typeof navigator === "undefined") return "ja";

  try {
    const browserLanguages = Array.isArray(navigator.languages) ? navigator.languages : [];
    const candidates = [...browserLanguages, navigator.language].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    if (candidates.length === 0) return "ja";

    const supportedLanguage = candidates.find((value) => {
      const primaryLanguage = value.toLowerCase().split("-")[0];
      return primaryLanguage === "ja" || primaryLanguage === "en";
    });
    if (!supportedLanguage) return "en";

    return supportedLanguage.toLowerCase().split("-")[0] === "ja" ? "ja" : "en";
  } catch {
    return "ja";
  }
}

function isVerifiedPremiumUser(user: User | null): user is User {
  if (!user) return false;
  const usesPasswordProvider = user.providerData.some(
    (provider) => provider.providerId === "password",
  );
  return !usesPasswordProvider || user.emailVerified;
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [autoSwitchPremiumInfoOpen, setAutoSwitchPremiumInfoOpen] = useState(false);
  const [language, setLanguage] = useState<Language>("ja");
  const [soundEnabled, setSoundEnabled] = useState(true);
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
  const [pendingItemReward, setPendingItemReward] = useState<BuffKey | null>(null);
  const [isBonusBreakMode, setIsBonusBreakMode] = useState(false);
  const [verifiedPremiumAccess, setVerifiedPremiumAccess] = useState(false);
  const [premiumStatusResolved, setPremiumStatusResolved] = useState(IS_DEVELOPMENT);
  const [premiumAuthUser, setPremiumAuthUser] = useState<User | null>(() => auth?.currentUser ?? null);
  const [premiumAuthResolved, setPremiumAuthResolved] = useState(false);
  const [devPremiumState, setDevPremiumState] = useState<DevPremiumState>("standard");
  const isPremium = IS_DEVELOPMENT
    ? devPremiumState === "premium"
    : verifiedPremiumAccess;
  const shouldRenderAds = !isPremium && (IS_DEVELOPMENT || premiumStatusResolved);
  const canUseAutoSwitch = isPremium;
  const timerModeRef = useRef<TimerMode>("focus");
  const timerStartRef = useRef<() => void>(() => undefined);
  const pendingItemRewardRef = useRef<BuffKey | null>(null);
  const itemRewardGrantedRef = useRef(false);
  const initialPremiumStatusRequestRef = useRef<{
    userId: string;
    request: ReturnType<typeof fetchPremiumStatus>;
  } | null>(null);
  const checkoutPremiumRefreshKeyRef = useRef<string | null>(null);
  const t = translations[language];
  const handlePremiumStatusChange = useCallback((nextIsPremium: boolean) => {
    setVerifiedPremiumAccess(nextIsPremium);
    setPremiumStatusResolved(true);
  }, []);
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
  useEffect(() => {
    try {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isLanguage(savedLanguage)) {
        setLanguage(savedLanguage);
        return;
      }
    } catch {
      // localStorageが利用できない場合もブラウザ言語の判定を続行する。
    }
    setLanguage(detectBrowserLanguage());
  }, []);
  useEffect(() => {
    try {
      const savedSoundEnabled = window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
      if (savedSoundEnabled === "true") setSoundEnabled(true);
      else if (savedSoundEnabled === "false") setSoundEnabled(false);
      else if (savedSoundEnabled !== null) window.localStorage.removeItem(SOUND_ENABLED_STORAGE_KEY);
    } catch {
      // localStorageが利用できない環境では既定のONを維持する。
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    if (!auth) {
      setPremiumAuthUser(null);
      setVerifiedPremiumAccess(false);
      setPremiumStatusResolved(true);
      setPremiumAuthResolved(true);
      return;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setPremiumAuthUser(nextUser);
      setVerifiedPremiumAccess(false);
      setPremiumStatusResolved(!isVerifiedPremiumUser(nextUser));
      setPremiumAuthResolved(true);
    });
  }, []);
  useEffect(() => {
    if (!premiumAuthResolved) return;
    if (!isVerifiedPremiumUser(premiumAuthUser)) {
      initialPremiumStatusRequestRef.current = null;
      setPremiumStatusResolved(true);
      return;
    }
    const checkoutResult = new URLSearchParams(window.location.search).get("checkout");
    if (checkoutResult === "success") {
      setPremiumStatusResolved(false);
      return;
    }

    const currentUser = premiumAuthUser;
    setPremiumStatusResolved(false);
    let requestEntry = initialPremiumStatusRequestRef.current;
    if (!requestEntry || requestEntry.userId !== currentUser.uid) {
      requestEntry = {
        userId: currentUser.uid,
        request: fetchPremiumStatus(currentUser),
      };
      initialPremiumStatusRequestRef.current = requestEntry;
    }

    let active = true;
    void requestEntry.request
      .then((status) => {
        if (active && auth?.currentUser?.uid === currentUser.uid) {
          setVerifiedPremiumAccess(status.isPremium);
          setPremiumStatusResolved(true);
        }
      })
      .catch(() => {
        if (active && auth?.currentUser?.uid === currentUser.uid) {
          setVerifiedPremiumAccess(false);
          setPremiumStatusResolved(false);
        }
      });
    return () => { active = false; };
  }, [premiumAuthResolved, premiumAuthUser]);
  useEffect(() => {
    if (!isVerifiedPremiumUser(premiumAuthUser)) return;
    const checkoutResult = new URLSearchParams(window.location.search).get("checkout");
    if (checkoutResult !== "success") return;

    const refreshKey = `${premiumAuthUser.uid}:${window.location.href}`;
    if (checkoutPremiumRefreshKeyRef.current === refreshKey) return;
    checkoutPremiumRefreshKeyRef.current = refreshKey;
    setPremiumStatusResolved(false);

    const isCurrentRefresh = () => checkoutPremiumRefreshKeyRef.current === refreshKey
      && auth?.currentUser?.uid === premiumAuthUser.uid;
    const refreshAfterCheckout = async () => {
      let completed = false;
      let lastRequestSucceeded = false;
      try {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          if (!isCurrentRefresh()) return;
          try {
            const status = await fetchPremiumStatus(premiumAuthUser);
            if (!isCurrentRefresh()) return;
            lastRequestSucceeded = true;
            setVerifiedPremiumAccess(status.isPremium);
            if (status.isPremium) {
              setPremiumStatusResolved(true);
              completed = true;
              break;
            }
          } catch {
            if (!isCurrentRefresh()) return;
            lastRequestSucceeded = false;
            setVerifiedPremiumAccess(false);
            setPremiumStatusResolved(false);
          }
          if (attempt === 4) {
            setPremiumStatusResolved(lastRequestSucceeded);
            completed = true;
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        }
      } finally {
        if (completed && isCurrentRefresh()) {
          const url = new URL(window.location.href);
          url.searchParams.delete("checkout");
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        } else if (checkoutPremiumRefreshKeyRef.current === refreshKey) {
          checkoutPremiumRefreshKeyRef.current = null;
        }
      }
    };

    void refreshAfterCheckout();
  }, [premiumAuthUser]);
  const changeLanguage = useCallback((nextLanguage: Language) => {
    setLanguage(nextLanguage);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // 保存できない環境でも、そのセッション中の表示切り替えは維持する。
    }
  }, []);
  const changeSoundEnabled = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    try {
      window.localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(enabled));
    } catch {
      // 保存できない環境でも、そのセッション中の音量設定は維持する。
    }
  }, []);
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
  const openPendingItemReward = useCallback((bonusBreak: boolean, resumeTimer = true) => {
    const reward = pendingItemRewardRef.current;
    setRewardWatching(false);
    setRewardOpen(false);
    setRewardSeconds(5);
    setIsBonusBreakMode(bonusBreak);
    if (!reward) {
      setItemRewardOpen(false);
      if (resumeTimer) timerStartRef.current();
      return;
    }
    if (!itemRewardGrantedRef.current) {
      itemRewardGrantedRef.current = true;
      setItemCounts((current) => ({ ...current, [reward]: current[reward] + 1 }));
    }
    setItemRewardOpen(true);
    if (resumeTimer) timerStartRef.current();
  }, []);
  const dismissItemReward = useCallback(() => {
    setItemRewardOpen(false);
    setPendingItemReward(null);
    pendingItemRewardRef.current = null;
    itemRewardGrantedRef.current = false;
  }, []);
  const handleSessionComplete = useCallback((completedMode: TimerMode, shouldAutoContinue: boolean) => {
    if (completedMode === "break") {
      clearBonusBreakState();
      return;
    }
    const reward = drawRandomItem();
    pendingItemRewardRef.current = reward;
    itemRewardGrantedRef.current = false;
    setPendingItemReward(reward);
    setItemRewardOpen(false);
    clearBonusBreakState();
    if (isPremium) {
      openPendingItemReward(true, false);
    } else if (shouldAutoContinue) {
      openPendingItemReward(false, false);
    } else {
      setRewardOpen(true);
    }
  }, [clearBonusBreakState, drawRandomItem, isPremium, openPendingItemReward]);
  const timer = useTimer(awardTomato, handleSessionComplete, isDebugMode, canUseAutoSwitch);
  timerStartRef.current = timer.start;
  useEffect(() => {
    if (!isPremium || !rewardOpen) return;
    openPendingItemReward(true);
  }, [isPremium, openPendingItemReward, rewardOpen]);
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
  const confirmBreakReset = () => timer.mode !== "break" || window.confirm(
    language === "ja"
      ? "現在の休憩時間（ボーナス）がリセットされますが、よろしいですか？"
      : "Your current break time (including any bonus) will be reset. Continue?",
  );
  const selectTimerMode = (mode: TimerMode) => {
    if (timer.mode === "break" && mode === "focus" && !confirmBreakReset()) return;
    clearBonusBreakState();
    timer.selectMode(mode);
  };
  const resetTimer = () => {
    if (!confirmBreakReset()) return;
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
    if (isPremium) setAutoSwitchPremiumInfoOpen(false);
  }, [isPremium]);
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
    if (!hydrated || (timer.mode === "break" && !isBonusBreakMode)) return;
    let previousBuffTickAt = Date.now();
    const buffTimer = window.setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - previousBuffTickAt) / 1_000);
      if (elapsedSeconds < 1) return;
      previousBuffTickAt += elapsedSeconds * 1_000;
      setBuffRemaining((current) => {
        if (current.doubleDrop <= 0 && current.balloonBoost <= 0 && current.goldBoost <= 0) return current;
        const next = {
          doubleDrop: Math.max(0, current.doubleDrop - elapsedSeconds),
          balloonBoost: Math.max(0, current.balloonBoost - elapsedSeconds),
          goldBoost: Math.max(0, current.goldBoost - elapsedSeconds),
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
  }, [hydrated, isBonusBreakMode, timer.mode]);
  const time = `${String(Math.floor(timer.remaining / 60)).padStart(2, "0")}:${String(timer.remaining % 60).padStart(2, "0")}`;
  const isBreak = timer.mode === "break";
  useEffect(() => { document.title = `${time} · ${timer.mode === "focus" ? t.timer.focus : t.timer.break}`; }, [t.timer.break, t.timer.focus, time, timer.mode]);
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
          {shouldRenderAds && (
            <AdContainer
              variant="mobile"
              className="absolute inset-x-2 top-[4.5rem] z-20 h-[50px] md:hidden"
            />
          )}
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
              soundEnabled={soundEnabled}
              isBonusBreakMode={isBonusBreakMode}
              timerMode={timer.mode}
              isTimerRunning={timer.running}
              initialMaxAltitude={maxAltitude}
              onAltitudeChange={recordAltitude}
            />
          </div>
          <div className={`pointer-events-none absolute bottom-3 right-3 z-20 rounded-full border px-3 py-1.5 text-xs font-black tabular-nums backdrop-blur sm:bottom-5 sm:right-5 ${isBreak ? "border-neutral-300 bg-white/75 text-neutral-800" : "border-white/15 bg-neutral-950/60 text-white/80"}`}>
            {altitude.toLocaleString(language === "ja" ? "ja-JP" : "en-US")} m
          </div>
          {IS_DEVELOPMENT && (
            <div className={`absolute bottom-3 left-3 z-40 rounded-2xl border p-2 text-[10px] font-bold shadow-lg backdrop-blur sm:bottom-5 sm:left-5 ${isBreak ? "border-violet-300 bg-white/90 text-neutral-800" : "border-violet-400/40 bg-neutral-950/85 text-white"}`}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="font-black text-violet-500">Premium Debug</span>
                <span className="tabular-nums">{devPremiumState === "premium" ? "Premium" : "Standard"}</span>
              </div>
              <div className="flex gap-1" role="group" aria-label="Premium Debug">
                <button
                  type="button"
                  className={`rounded-full px-2.5 py-1 transition ${devPremiumState === "standard" ? "bg-violet-500 text-white" : isBreak ? "bg-neutral-200 text-neutral-700" : "bg-neutral-800 text-neutral-300"}`}
                  aria-pressed={devPremiumState === "standard"}
                  onClick={() => setDevPremiumState("standard")}
                >
                  Standard
                </button>
                <button
                  type="button"
                  className={`rounded-full px-2.5 py-1 transition ${devPremiumState === "premium" ? "bg-violet-500 text-white" : isBreak ? "bg-neutral-200 text-neutral-700" : "bg-neutral-800 text-neutral-300"}`}
                  aria-pressed={devPremiumState === "premium"}
                  onClick={() => setDevPremiumState("premium")}
                >
                  Premium
                </button>
              </div>
            </div>
          )}
          <div data-control-toolbar className={`no-scrollbar absolute inset-x-3 top-3 z-30 flex min-w-0 max-w-full touch-pan-x items-center justify-start gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-full border p-1.5 backdrop-blur transition-colors duration-700 sm:inset-x-6 sm:top-5 sm:gap-2 sm:p-2 md:justify-between md:gap-3 ${isBreak ? "border-neutral-300 bg-white/75" : "border-neutral-800/80 bg-neutral-950/65"}`}>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button className={modeClass("focus")} aria-label={t.header.focus25Minutes} title={t.header.focus25Minutes} onClick={() => selectTimerMode("focus")}><Pencil size={17} />25m</button>
              <button className={modeClass("break")} aria-label={t.header.break5Minutes} title={t.header.break5Minutes} onClick={() => selectTimerMode("break")}><Coffee size={17} />5m</button>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button className={`${button} ${isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950"}`} aria-label={t.header.start} title={t.header.start} disabled={timer.running} onClick={resumeTomatoCycle}><Play size={18} fill="currentColor" /></button>
              <button className={quietClass} aria-label={t.header.pause} title={t.header.pause} disabled={!timer.running} onClick={pauseTomatoCycle}><Pause size={18} /></button>
              <button className={quietClass} aria-label={t.header.reset} title={t.header.reset} onClick={resetTimer}><RotateCcw size={18} /></button>
              <span className="relative inline-flex shrink-0">
                <button className={`${button} relative overflow-visible border ${isBreak ? "border-emerald-500/60" : "border-red-500/60"} ${timer.autoLoopEnabled ? isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950" : isBreak ? "bg-white/80 text-neutral-900" : "bg-neutral-900"}`} aria-label={`${t.header.autoSwitch} ${timer.autoLoopEnabled ? t.header.on : t.header.off}`} title={t.header.autoSwitch} aria-pressed={timer.autoLoopEnabled} disabled={!canUseAutoSwitch} onClick={timer.toggleAutoLoop}>
                  <Repeat size={18} />
                  {!isPremium && (
                    <span className="pointer-events-none absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full border border-emerald-300/80 bg-white text-emerald-700 shadow-sm" aria-label={t.shop.premiumExclusive}>
                      <Gem size={9} aria-hidden="true" />
                    </span>
                  )}
                </button>
                {!isPremium && (
                  <button
                    type="button"
                    className="absolute inset-0 z-10 rounded-full bg-transparent"
                    aria-label={`${t.header.premiumFeatureTitle}: ${t.header.autoSwitchPremiumDescription}`}
                    aria-haspopup="dialog"
                    aria-expanded={autoSwitchPremiumInfoOpen}
                    onClick={() => setAutoSwitchPremiumInfoOpen(true)}
                  />
                )}
              </span>
              {isDebugMode && (
                <button className={`${button} border ${isBreak ? "border-emerald-500/60" : "border-red-500/60"} ${timer.debugEnabled ? isBreak ? "bg-emerald-500 text-white" : "bg-red-500 text-neutral-950" : isBreak ? "bg-white/80 text-neutral-900" : "bg-neutral-900"}`} aria-label={`${t.header.debug} ${timer.debugEnabled ? t.header.on : t.header.off}`} title={t.header.debug} aria-pressed={timer.debugEnabled} onClick={timer.toggleDebug}><Zap size={18} fill={timer.debugEnabled ? "currentColor" : "none"} /></button>
              )}
              <button className={quietClass} aria-label={t.header.openShop} title={t.header.shop} onClick={() => setShopOpen(true)}><Store size={18} /></button>
              <button className={quietClass} aria-label={t.header.openSettings} title={t.header.settings} onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
              <span className={`inline-flex items-center gap-1 rounded-full border border-amber-400/30 px-3 py-2 text-sm font-bold ${isBreak ? "bg-white/80 text-amber-700" : "bg-neutral-950/80 text-amber-300"}`} title={t.header.goldTomatoes}><Sparkles size={16} />× {goldenTomatoes}</span>
              {isDebugMode && (
                <button
                  className={`${button} border ${debugUfoMode
                    ? isBreak
                      ? "border-cyan-500/70 bg-cyan-100 text-cyan-800"
                      : "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                    : isBreak
                      ? "border-neutral-300 bg-white/80 text-neutral-700"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300"}`}
                  aria-label={`${t.header.ufoDebugMode} ${debugUfoMode ? t.header.on : t.header.off}`}
                  title={t.header.ufoDebugMode}
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
                  aria-label={`${t.header.catDebugMode} ${debugCatMode ? t.header.on : t.header.off}`}
                  title={t.header.catDebugMode}
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
                  aria-label={t.header.shortenToTenSeconds}
                  title={t.header.setTenSeconds}
                  onClick={() => timer.setRemainingSeconds(10)}
                >
                  <FastForward aria-hidden="true" size={18} />
                  <span className="text-[10px] tabular-nums">10s</span>
                </button>
              )}
            </div>
          </div>

          {autoSwitchPremiumInfoOpen && !isPremium && (
            <div
              className="absolute inset-0 z-[45]"
              role="presentation"
              onMouseDown={() => setAutoSwitchPremiumInfoOpen(false)}
            >
              <section
                className={`absolute left-4 right-4 top-[4.75rem] mx-auto max-w-xs rounded-2xl border p-4 shadow-2xl backdrop-blur-md ${isBreak ? "border-emerald-300 bg-white/95 text-neutral-950" : "border-neutral-700 bg-neutral-900/95 text-white"}`}
                role="dialog"
                aria-modal="false"
                aria-labelledby="auto-switch-premium-info-title"
                aria-describedby="auto-switch-premium-info-description"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-start gap-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full border ${isBreak ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"}`}>
                    <Gem size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id="auto-switch-premium-info-title" className="text-sm font-black">
                      {t.header.premiumFeatureTitle}
                    </h2>
                    <p id="auto-switch-premium-info-description" className={`mt-1 text-xs leading-relaxed ${isBreak ? "text-neutral-600" : "text-neutral-300"}`}>
                      {t.header.autoSwitchPremiumDescription}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`grid size-8 shrink-0 place-items-center rounded-full transition ${isBreak ? "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" : "text-neutral-400 hover:bg-neutral-800 hover:text-white"}`}
                    aria-label={t.header.close}
                    title={t.header.close}
                    onClick={() => setAutoSwitchPremiumInfoOpen(false)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              </section>
            </div>
          )}

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
            onPremiumStatusChange={handlePremiumStatusChange}
            isBreak={isBreak}
            language={language}
          />
          <SettingsModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            language={language}
            onLanguageChange={changeLanguage}
            soundEnabled={soundEnabled}
            onSoundEnabledChange={changeSoundEnabled}
            isBreak={isBreak}
            onOpenAuth={() => setAuthOpen(true)}
            onPremiumStatusChange={handlePremiumStatusChange}
          />
          <AuthModal
            isOpen={authOpen}
            onClose={() => setAuthOpen(false)}
            isBreak={isBreak}
            language={language}
          />
          <RewardModal
            rewardOpen={!isPremium && rewardOpen}
            rewardWatching={!isPremium && rewardWatching}
            rewardSeconds={rewardSeconds}
            itemRewardOpen={itemRewardOpen}
            itemReward={pendingItemReward}
            isBreak={isBreak}
            onStartVideo={() => {
              if (isPremium) return;
              setRewardSeconds(5);
              setRewardWatching(true);
            }}
            onSkipVideo={() => openPendingItemReward(false)}
            onItemRewardDismiss={dismissItemReward}
          />
        </section>
        {shouldRenderAds && (
          <AdContainer
            variant="desktop"
            className="hidden h-[min(600px,calc(100dvh-2rem))] w-[300px] shrink-0 md:flex xl:w-[336px]"
          />
        )}
      </div>
    </main>
  );
}
