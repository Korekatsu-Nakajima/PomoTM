"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CONFIG, type TomatoCounts } from "@/lib/config";
import type { ActiveBuffs, BuffRemaining, ItemCounts, SavedCameraState, UnlockedItems } from "@/types/game";
import {
  BUFF_DURATION_SECONDS,
  INITIAL_BUFF_REMAINING,
  INITIAL_BUFFS,
  INITIAL_UNLOCKED_ITEMS,
  MAX_ALTITUDE_STORAGE_KEY,
  MAX_SAFE_SAVED_TOMATOES,
  MIN_DYNAMIC_CAMERA_SCALE,
  PROGRESS_STORAGE_KEY,
  SAVED_CAMERA_STORAGE_KEY,
  TOTAL_GOLD_TOMATOES_STORAGE_KEY,
  UNLOCKED_EVENTS_STORAGE_KEY,
  UNLOCKED_ITEMS_STORAGE_KEY,
} from "@/constants/assets";

type UseGameStorageOptions = {
  setCounts: Dispatch<SetStateAction<TomatoCounts>>;
  goldenTomatoes: number;
  setGoldenTomatoes: Dispatch<SetStateAction<number>>;
  activeBuffs: ActiveBuffs;
  setActiveBuffs: Dispatch<SetStateAction<ActiveBuffs>>;
  buffRemaining: BuffRemaining;
  setBuffRemaining: Dispatch<SetStateAction<BuffRemaining>>;
  itemCounts: ItemCounts;
  setItemCounts: Dispatch<SetStateAction<ItemCounts>>;
  unlockedItems: UnlockedItems;
  setUnlockedItems: Dispatch<SetStateAction<UnlockedItems>>;
  hydrated: boolean;
  setHydrated: Dispatch<SetStateAction<boolean>>;
  maxAltitude: number;
  setMaxAltitude: Dispatch<SetStateAction<number>>;
  totalGoldTomatoes: number;
  setTotalGoldTomatoes: Dispatch<SetStateAction<number>>;
};

export const saveLocalStorage = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
};

const readStoredItemCount = (value: unknown) => {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 && count <= MAX_SAFE_SAVED_TOMATOES ? count : 0;
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

export const saveSavedCameraState = (savedCamera: SavedCameraState) => {
  try {
    localStorage.setItem(SAVED_CAMERA_STORAGE_KEY, JSON.stringify(savedCamera));
  } catch {
    return;
  }
};

export const loadSavedCameraState = (): SavedCameraState | null => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_CAMERA_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<SavedCameraState>;
    if (!Number.isFinite(value.scale) || !Number.isFinite(value.offsetY)) return null;
    return {
      scale: Math.min(1, Math.max(MIN_DYNAMIC_CAMERA_SCALE, Number(value.scale))),
      offsetY: Math.max(0, Number(value.offsetY)),
    };
  } catch {
    return null;
  }
};

export function useGameStorage({
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
}: UseGameStorageOptions) {
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
      setItemCounts({
        doubleDrop: readStoredItemCount(progress?.itemCounts?.doubleDrop),
        balloonBoost: readStoredItemCount(progress?.itemCounts?.balloonBoost),
        goldBoost: readStoredItemCount(progress?.itemCounts?.goldBoost),
      });
      setUnlockedItems({
        ufo: progress?.unlockedItems?.ufo === true,
        bird: progress?.unlockedItems?.bird === true,
        balloon: progress?.unlockedItems?.balloon === true,
        octopus: progress?.unlockedItems?.octopus === true,
      });
      try {
        const storedUnlockedItems = JSON.parse(localStorage.getItem(UNLOCKED_ITEMS_STORAGE_KEY) ?? "null");
        if (storedUnlockedItems && typeof storedUnlockedItems === "object") {
          setUnlockedItems((current) => ({
            ...current,
            ufo: storedUnlockedItems.ufo === true || current.ufo,
            octopus: storedUnlockedItems.octopus === true || current.octopus,
          }));
        }
      } catch {
        localStorage.removeItem(UNLOCKED_ITEMS_STORAGE_KEY);
      }
      const storedMaxAltitude = Number(localStorage.getItem(MAX_ALTITUDE_STORAGE_KEY));
      setMaxAltitude(Number.isFinite(storedMaxAltitude) && storedMaxAltitude >= 0 ? storedMaxAltitude : 0);
      const storedTotalGoldTomatoes = Number(localStorage.getItem(TOTAL_GOLD_TOMATOES_STORAGE_KEY));
      setTotalGoldTomatoes(Number.isSafeInteger(storedTotalGoldTomatoes) && storedTotalGoldTomatoes >= 0
        ? storedTotalGoldTomatoes
        : 0);
      try {
        const storedUnlockedEvents = JSON.parse(localStorage.getItem(UNLOCKED_EVENTS_STORAGE_KEY) ?? "null");
        if (storedUnlockedEvents && typeof storedUnlockedEvents === "object") {
          setUnlockedItems((current) => ({
            ...current,
            ufo: storedUnlockedEvents.ufo === true || current.ufo,
            bird: storedUnlockedEvents.bird === true || current.bird,
            balloon: storedUnlockedEvents.balloon === true || current.balloon,
            octopus: storedUnlockedEvents.octopus === true || current.octopus,
          }));
        }
      } catch {
        localStorage.removeItem(UNLOCKED_EVENTS_STORAGE_KEY);
      }
    } catch {
      setGoldenTomatoes(0);
      setActiveBuffs(INITIAL_BUFFS);
      setBuffRemaining(INITIAL_BUFF_REMAINING);
      setItemCounts({ doubleDrop: 0, balloonBoost: 0, goldBoost: 0 });
      setUnlockedItems(INITIAL_UNLOCKED_ITEMS);
      try { localStorage.removeItem(PROGRESS_STORAGE_KEY); } catch { /* Storage is unavailable. */ }
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    saveLocalStorage(PROGRESS_STORAGE_KEY, { goldenTomatoes, activeBuffs, buffRemaining, itemCounts, unlockedItems });
  }, [activeBuffs, buffRemaining, goldenTomatoes, hydrated, itemCounts, unlockedItems]);
  useEffect(() => {
    if (!hydrated) return;
    saveLocalStorage(UNLOCKED_ITEMS_STORAGE_KEY, {
      ufo: unlockedItems.ufo,
      octopus: unlockedItems.octopus,
    });
  }, [hydrated, unlockedItems.octopus, unlockedItems.ufo]);
  useEffect(() => {
    if (!hydrated) return;
    saveLocalStorage(MAX_ALTITUDE_STORAGE_KEY, maxAltitude);
  }, [hydrated, maxAltitude]);
  useEffect(() => {
    if (!hydrated) return;
    saveLocalStorage(TOTAL_GOLD_TOMATOES_STORAGE_KEY, totalGoldTomatoes);
  }, [hydrated, totalGoldTomatoes]);
  useEffect(() => {
    if (!hydrated) return;
    saveLocalStorage(UNLOCKED_EVENTS_STORAGE_KEY, unlockedItems);
  }, [hydrated, unlockedItems]);
}
