"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG, type TimerMode } from "@/lib/config";

export function useTimer(onTomato: () => void, onSessionComplete?: () => void) {
  const [mode, setMode] = useState<TimerMode>("focus");
  const [remaining, setRemaining] = useState(CONFIG.durations.focus);
  const [running, setRunning] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [autoLoopEnabled, setAutoLoopEnabled] = useState(false);
  const deadline = useRef(0), timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const focusDrop = useRef<ReturnType<typeof setTimeout> | null>(null), debugDrop = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef<TimerMode>(mode), runningRef = useRef(false), debugRef = useRef(false);
  const autoLoopRef = useRef(false), tomatoRef = useRef(onTomato);
  const sessionCompleteRef = useRef(onSessionComplete);
  useEffect(() => { tomatoRef.current = onTomato; }, [onTomato]);
  useEffect(() => { sessionCompleteRef.current = onSessionComplete; }, [onSessionComplete]);

  const stopDrops = useCallback(() => {
    if (focusDrop.current) clearTimeout(focusDrop.current);
    if (debugDrop.current) clearInterval(debugDrop.current);
    focusDrop.current = null; debugDrop.current = null;
  }, []);
  const scheduleFocus = useCallback(function schedule() {
    if (!runningRef.current || modeRef.current !== "focus") return;
    const { min, max } = CONFIG.focusDropDelay;
    focusDrop.current = setTimeout(() => {
      focusDrop.current = null;
      if (!runningRef.current || modeRef.current !== "focus") return;
      tomatoRef.current(); schedule();
    }, min + Math.random() * (max - min));
  }, []);
  const pause = useCallback(() => {
    if (runningRef.current) setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    runningRef.current = false; setRunning(false);
    if (timer.current) clearInterval(timer.current); timer.current = null; stopDrops();
  }, [stopDrops]);
  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true; setRunning(true);
    setRemaining((value) => { deadline.current = Date.now() + value * 1000; return value; });
    timer.current = setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(next);
      if (!next) {
        const completed = modeRef.current;
        stopDrops();
        sessionCompleteRef.current?.();
        if (completed === "focus") tomatoRef.current();
        const nextMode: TimerMode = completed === "focus" ? "break" : "focus";
        modeRef.current = nextMode; setMode(nextMode); setRemaining(CONFIG.durations[nextMode]);
        if (autoLoopRef.current) {
          deadline.current = Date.now() + CONFIG.durations[nextMode] * 1000;
          if (nextMode === "focus") scheduleFocus();
          if (debugRef.current) debugDrop.current = setInterval(() => tomatoRef.current(), CONFIG.debugDropInterval);
        } else {
          runningRef.current = false; setRunning(false);
          if (timer.current) clearInterval(timer.current); timer.current = null;
        }
      }
    }, 250);
    scheduleFocus();
    if (debugRef.current) debugDrop.current = setInterval(() => tomatoRef.current(), CONFIG.debugDropInterval);
  }, [scheduleFocus, stopDrops]);
  const selectMode = useCallback((next: TimerMode) => { pause(); modeRef.current = next; setMode(next); setRemaining(CONFIG.durations[next]); }, [pause]);
  const reset = useCallback(() => { pause(); setRemaining(CONFIG.durations[modeRef.current]); }, [pause]);
  const toggleDebug = useCallback(() => {
    const enabled = !debugRef.current; debugRef.current = enabled; setDebugEnabled(enabled);
    if (debugDrop.current) clearInterval(debugDrop.current); debugDrop.current = null;
    if (enabled && runningRef.current) debugDrop.current = setInterval(() => tomatoRef.current(), CONFIG.debugDropInterval);
  }, []);
  const toggleAutoLoop = useCallback(() => {
    autoLoopRef.current = !autoLoopRef.current;
    setAutoLoopEnabled(autoLoopRef.current);
  }, []);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); stopDrops(); }, [stopDrops]);
  return {
    mode, remaining, running, debugEnabled, autoLoopEnabled,
    start, pause, reset, selectMode, toggleDebug, toggleAutoLoop,
  };
}
