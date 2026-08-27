"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Matter from "matter-js";
import { CONFIG, type TomatoCounts } from "@/lib/config";

export type PhysicsCanvasHandle = {
  drop: (golden: boolean) => void;
  removeGolden: (count: number) => number;
};
type Props = {
  counts: TomatoCounts;
  hydrated: boolean;
  onBonusTomato: (golden: boolean) => void;
  onGoldenTomatoDrop: () => void;
  activeBuffs: { doubleDrop: boolean; balloonBoost: boolean; goldBoost: boolean };
  isUfoUnlocked: boolean;
  timerMode: "focus" | "break";
  isTimerRunning: boolean;
};
type CameraBounds = { left: number; right: number; top: number; bottom: number };
type BirdDelivery = {
  startedAt: number;
  duration: number;
  releaseAt: number;
  direction: 1 | -1;
  golden: boolean;
  radius: number;
  released: boolean;
};
type TomatoSpec = { golden: boolean; radius: number };
type BalloonEvent = {
  startedAt: number;
  duration: number;
  direction: 1 | -1;
  initialGolden: boolean;
  initialDropPending: boolean;
  enteredViewport: boolean;
  nextDropAt: number;
};
type UfoEvent = {
  startedAt: number;
  hoverDuration: number;
  entryDuration: number;
  exitDuration: number;
  direction: 1 | -1;
  nextDropAt: number;
};
const MIN_DYNAMIC_CAMERA_SCALE = 0.08;
const UFO_CHECK_INTERVAL_MS = 45_000;
const UFO_APPEARANCE_CHANCE = 0.03;
const DEEP_CORE_BODY_THRESHOLD = 1_000;
const DEEP_CORE_INSET = 300;
const DEEP_CORE_EVALUATION_INTERVAL = 60;

export const PhysicsCanvas = forwardRef<PhysicsCanvasHandle, Props>(function PhysicsCanvas(
  {
    counts,
    hydrated,
    onBonusTomato,
    onGoldenTomatoDrop,
    activeBuffs,
    isUfoUnlocked,
    timerMode,
    isTimerRunning,
  }, ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const addRef = useRef<(golden?: boolean, settled?: boolean) => void>(() => undefined);
  const removeGoldenRef = useRef<(count: number) => number>(() => 0);
  const currentScale = useRef<number>(1);
  const targetScale = useRef<number>(1);
  const camera = useRef<CameraBounds>({ left: 0, right: 1, top: 0, bottom: 1 });
  const bonusTomatoRef = useRef(onBonusTomato);
  const goldenDropRef = useRef(onGoldenTomatoDrop);
  const activeBuffsRef = useRef(activeBuffs);
  const isUfoUnlockedRef = useRef(isUfoUnlocked);
  const isFocusRunningRef = useRef(timerMode === "focus" && isTimerRunning);
  const breakModeRef = useRef(timerMode === "break");
  const themeDirtyRef = useRef(false);

  useImperativeHandle(ref, () => ({
    drop: (golden) => addRef.current(golden),
    removeGolden: (count) => removeGoldenRef.current(count),
  }), []);
  useEffect(() => { bonusTomatoRef.current = onBonusTomato; }, [onBonusTomato]);
  useEffect(() => { goldenDropRef.current = onGoldenTomatoDrop; }, [onGoldenTomatoDrop]);
  useEffect(() => { activeBuffsRef.current = activeBuffs; }, [activeBuffs]);
  useEffect(() => { isUfoUnlockedRef.current = isUfoUnlocked; }, [isUfoUnlocked]);
  useEffect(() => {
    isFocusRunningRef.current = timerMode === "focus" && isTimerRunning;
    breakModeRef.current = timerMode === "break";
    themeDirtyRef.current = true;
  }, [isTimerRunning, timerMode]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !hydrated) return;
    const toolbar = container.parentElement?.querySelector<HTMLElement>("[data-control-toolbar]");

    const { Engine, Bodies, Body, Composite } = Matter;
    const engine = Engine.create({
      enableSleeping: true,
      positionIterations: 10,
      velocityIterations: 10,
      gravity: { x: 0, y: 1.05 },
    });
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 1, height = 1, frame = 0;
    let flightScreenY = 150;
    let settledPileTop = Number.POSITIVE_INFINITY;
    let leftWall: Matter.Body, rightWall: Matter.Body, floor: Matter.Body;
    let wallHeight = 1, floorWidth = 1;
    const activeBodies = new Set<Matter.Body>();
    const sleepingBodies = new Set<Matter.Body>();
    const pendingSleeping = new Set<Matter.Body>();
    const staticCoreBodies = new Set<Matter.Body>();
    const birdDeliveries: BirdDelivery[] = [];
    const balloonEvents: BalloonEvent[] = [];
    const ufoEvents: UfoEvent[] = [];
    const deferredDeliveries: boolean[] = [];
    let ufoEventTime = performance.now();
    let previousFrameTime = performance.now();
    let nextUfoCheckAt = ufoEventTime + UFO_CHECK_INTERVAL_MS;
    let coreEvaluationFrame = 0;
    let cachedSleeping = new Set<Matter.Body>();
    let sleepingCacheDirty = true;
    let forceCacheRefresh = false;
    let lastCacheRefresh = 0;
    let cacheScale = 1;
    const sleepingCanvas = document.createElement("canvas");
    const sleepingContext = sleepingCanvas.getContext("2d");
    const backgroundCanvas = document.createElement("canvas");
    const backgroundContext = backgroundCanvas.getContext("2d");
    const backgroundWorld = { left: 0, top: 0, width: 1, height: 1 };
    let imageReady = false;
    const image = new Image();
    if (CONFIG.tomatoImageUrl) {
      image.onload = () => { imageReady = true; };
      image.src = CONFIG.tomatoImageUrl;
    }

    const getBounds = (scale: number): CameraBounds => {
      const visibleWidth = width / scale;
      const visibleHeight = height / scale;
      return {
        left: width / 2 - visibleWidth / 2,
        right: width / 2 + visibleWidth / 2,
        top: height - visibleHeight,
        bottom: height,
      };
    };

    const syncBoundaries = (bounds: CameraBounds) => {
      const nextWallHeight = bounds.bottom - bounds.top + 80;
      const nextFloorWidth = bounds.right - bounds.left + 80;
      if (Math.abs(nextWallHeight - wallHeight) > 0.01) {
        Body.scale(leftWall, 1, nextWallHeight / wallHeight);
        Body.scale(rightWall, 1, nextWallHeight / wallHeight);
        wallHeight = nextWallHeight;
      }
      if (Math.abs(nextFloorWidth - floorWidth) > 0.01) {
        Body.scale(floor, nextFloorWidth / floorWidth, 1);
        floorWidth = nextFloorWidth;
      }
      const wallY = (bounds.top + bounds.bottom) / 2;
      const floorX = (bounds.left + bounds.right) / 2;
      if (Math.abs(leftWall.position.x - (bounds.left - 20)) > 0.01 || Math.abs(leftWall.position.y - wallY) > 0.01) {
        Body.setPosition(leftWall, { x: bounds.left - 20, y: wallY });
        Body.setPosition(rightWall, { x: bounds.right + 20, y: wallY });
      }
      if (Math.abs(floor.position.x - floorX) > 0.01 || Math.abs(floor.position.y - (bounds.bottom + 20)) > 0.01) {
        Body.setPosition(floor, { x: floorX, y: bounds.bottom + 20 });
      }
    };

    const createBoundaries = () => {
      const bounds = getBounds(currentScale.current);
      wallHeight = bounds.bottom - bounds.top + 80;
      floorWidth = bounds.right - bounds.left + 80;
      leftWall = Bodies.rectangle(bounds.left - 20, (bounds.top + bounds.bottom) / 2, 40, wallHeight, { isStatic: true });
      rightWall = Bodies.rectangle(bounds.right + 20, (bounds.top + bounds.bottom) / 2, 40, wallHeight, { isStatic: true });
      floor = Bodies.rectangle((bounds.left + bounds.right) / 2, bounds.bottom + 20, floorWidth, 40, { isStatic: true });
      Composite.add(engine.world, [leftWall, rightWall, floor]);
      camera.current = bounds;
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      if (toolbar) {
        const toolbarRect = toolbar.getBoundingClientRect();
        flightScreenY = Math.max(150, toolbarRect.bottom - rect.top + 28);
      }
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      sleepingCanvas.width = canvas.width; sleepingCanvas.height = canvas.height;
      sleepingContext?.setTransform(dpr, 0, 0, dpr, 0, 0);
      sleepingCacheDirty = true;
      forceCacheRefresh = true;
      if (leftWall) syncBoundaries(getBounds(currentScale.current));
      buildBackgroundCanvas();
    };

    const createTomato = (
      golden = false,
      settled = false,
      spawn?: { x: number; y: number },
      fixedRadius?: number,
    ) => {
      const radius = fixedRadius ?? 20 + Math.random() * 5;
      const bounds = camera.current;
      const x = spawn?.x ?? bounds.left + radius + Math.random() * Math.max(radius, bounds.right - bounds.left - radius * 2);
      const y = spawn?.y ?? (settled
        ? Math.max(bounds.top + radius, bounds.bottom - 60 - Math.random() * Math.min(230, (bounds.bottom - bounds.top) * 0.55))
        : bounds.top - radius * 2);
      const body = Bodies.circle(x, y, radius, {
        restitution: 0.05,
        friction: 0.8,
        frictionStatic: 1.0,
        frictionAir: 0.02,
        density: 0.005,
        slop: 0.05,
        sleepThreshold: 30,
        label: "tomato", plugin: { tomato: { golden, radius, createdAt: performance.now() } },
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
      Composite.add(engine.world, body);
      activeBodies.add(body);
      Matter.Events.on(body, "sleepStart", () => {
        activeBodies.delete(body);
        sleepingBodies.add(body);
        pendingSleeping.add(body);
        settledPileTop = Math.min(settledPileTop, body.bounds.min.y);
        sleepingCacheDirty = true;
      });
      Matter.Events.on(body, "sleepEnd", () => {
        sleepingBodies.delete(body);
        pendingSleeping.delete(body);
        activeBodies.add(body);
        if (cachedSleeping.has(body)) forceCacheRefresh = true;
        sleepingCacheDirty = true;
      });
    };
    const createRadius = () => {
      const baseRadius = 20 + Math.random() * 5;
      const sizeRoll = Math.random();
      if (sizeRoll < 0.01) return baseRadius * (0.3 + Math.random() * 0.1);
      if (sizeRoll < 0.02) return baseRadius * (2.5 + Math.random() * 0.5);
      return baseRadius;
    };

    const createTomatoSpec = (golden?: boolean): TomatoSpec => {
      const goldenChance = activeBuffsRef.current.goldBoost ? CONFIG.goldenChance * 2 : CONFIG.goldenChance;
      return {
        golden: golden ?? Math.random() < goldenChance,
        radius: createRadius(),
      };
    };

    const startDelivery = (golden = false) => {
      const balloonChance = activeBuffsRef.current.balloonBoost ? 0.02 : 0.01;
      if (Math.random() < balloonChance) {
        const startedAt = ufoEventTime;
        balloonEvents.push({
          startedAt,
          duration: 13_000 + Math.random() * 2_000,
          direction: Math.random() < 0.5 ? 1 : -1,
          initialGolden: golden,
          initialDropPending: true,
          enteredViewport: false,
          nextDropAt: startedAt,
        });
        return;
      }
      birdDeliveries.push({
        startedAt: ufoEventTime,
        duration: 2200 + Math.random() * 600,
        releaseAt: 0.38 + Math.random() * 0.24,
        direction: Math.random() < 0.5 ? 1 : -1,
        golden,
        radius: createTomatoSpec(golden).radius,
        released: false,
      });
    };
    const queueBirdDelivery = (golden = false) => {
      if (!isFocusRunningRef.current) return;
      if (ufoEvents.length > 0) {
        deferredDeliveries.push(golden);
        return;
      }
      startDelivery(golden);
    };
    addRef.current = queueBirdDelivery;

    const removeGoldenTomatoes = (count: number) => {
      const requested = Math.max(0, Math.floor(count));
      if (!requested) return 0;
      const goldenBodies = [...activeBodies, ...sleepingBodies]
        .filter((body) => Boolean((body.plugin.tomato as { golden?: boolean } | undefined)?.golden))
        .sort((first, second) => first.bounds.min.y - second.bounds.min.y)
        .slice(0, requested);

      let removedCachedBody = false;
      for (const body of goldenBodies) {
        Composite.remove(engine.world, body);
        Matter.Events.off(body, "sleepStart");
        Matter.Events.off(body, "sleepEnd");
        activeBodies.delete(body);
        sleepingBodies.delete(body);
        pendingSleeping.delete(body);
        staticCoreBodies.delete(body);
        if (cachedSleeping.delete(body)) removedCachedBody = true;
      }
      if (removedCachedBody) {
        sleepingCacheDirty = true;
        forceCacheRefresh = true;
      }
      settledPileTop = sleepingBodies.size
        ? Math.min(...[...sleepingBodies].map((body) => body.bounds.min.y))
        : Number.POSITIVE_INFINITY;
      return goldenBodies.length;
    };
    removeGoldenRef.current = removeGoldenTomatoes;

    const restoreStaticCoreBodies = () => {
      if (!staticCoreBodies.size) return;
      staticCoreBodies.forEach((body) => {
        Body.setStatic(body, false);
        Matter.Sleeping.set(body, false);
        sleepingBodies.delete(body);
        pendingSleeping.delete(body);
        activeBodies.add(body);
      });
      staticCoreBodies.clear();
      sleepingCacheDirty = true;
      forceCacheRefresh = true;
    };

    const optimizeDeepCore = (now: number) => {
      const visibleBounds = camera.current;
      const visibleTomatoBodies = [...activeBodies, ...sleepingBodies].filter((body) =>
        body.bounds.max.x >= visibleBounds.left
        && body.bounds.min.x <= visibleBounds.right
        && body.bounds.max.y >= visibleBounds.top
        && body.bounds.min.y <= visibleBounds.bottom,
      );
      const tomatoBodyCount = visibleTomatoBodies.length;
      if (tomatoBodyCount <= DEEP_CORE_BODY_THRESHOLD) {
        restoreStaticCoreBodies();
        return;
      }

      const stationaryBodies = visibleTomatoBodies.filter((body) => {
        if (body.isStatic || body.isSleeping) return true;
        const tomato = body.plugin.tomato as { createdAt?: number } | undefined;
        const createdAt = tomato?.createdAt ?? now;
        return now - createdAt >= 2_000 && body.speed < 0.05 && body.position.y > height * 0.4;
      });
      if (!stationaryBodies.length) return;

      const leftEdge = Math.min(...stationaryBodies.map((body) => body.bounds.min.x));
      const rightEdge = Math.max(...stationaryBodies.map((body) => body.bounds.max.x));
      const topEdge = Math.min(...stationaryBodies.map((body) => body.bounds.min.y));
      const floorEdge = floor.bounds.min.y;
      let changed = false;

      stationaryBodies.forEach((body) => {
        if (body.isStatic
          || body.bounds.min.x < leftEdge + DEEP_CORE_INSET
          || body.bounds.max.x > rightEdge - DEEP_CORE_INSET
          || body.bounds.min.y < topEdge + DEEP_CORE_INSET
          || body.bounds.max.y > floorEdge - DEEP_CORE_INSET) return;
        Body.setStatic(body, true);
        activeBodies.delete(body);
        sleepingBodies.add(body);
        pendingSleeping.add(body);
        staticCoreBodies.add(body);
        changed = true;
      });

      if (changed) {
        settledPileTop = Math.min(settledPileTop, topEdge);
        sleepingCacheDirty = true;
        forceCacheRefresh = true;
      }
    };

    const drawTomato = (
      target: CanvasRenderingContext2D,
      x: number,
      y: number,
      radius: number,
      golden: boolean,
      rotation = 0,
    ) => {
      target.save();
      target.translate(x, y);
      target.rotate(rotation);
      if (imageReady) {
        target.drawImage(image, -radius, -radius, radius * 2, radius * 2);
      } else {
        const bodyRadius = radius * 0.9;
        target.beginPath();
        target.arc(0, radius * 0.08, bodyRadius, 0, Math.PI * 2);
        target.fillStyle = golden ? "#f3bd39" : "#ef5350";
        target.fill();
        target.lineWidth = Math.max(1, radius * 0.07);
        target.strokeStyle = golden ? "#b27b16" : "#b52f2d";
        target.stroke();

        // Five-leaf calyx, always anchored to the same local rotation.
        target.beginPath();
        for (let leaf = 0; leaf < 5; leaf++) {
          const angle = -Math.PI / 2 + leaf * Math.PI * 0.4;
          const outer = radius * 0.54;
          const inner = radius * 0.14;
          target.lineTo(Math.cos(angle) * outer, -radius * 0.48 + Math.sin(angle) * outer * 0.42);
          target.lineTo(Math.cos(angle + 0.3) * inner, -radius * 0.48 + Math.sin(angle + 0.3) * inner);
        }
        target.closePath();
        target.fillStyle = "#3f6212";
        target.fill();
      }
      target.restore();
    };

    const drawTomatoBody = (body: Matter.Body, target: CanvasRenderingContext2D = context) => {
      const { golden, radius } = body.plugin.tomato as { golden: boolean; radius: number };
      drawTomato(target, body.position.x, body.position.y, radius, golden, body.angle);
    };

    const drawBird = (
      x: number,
      y: number,
      size: number,
      direction: 1 | -1,
      carrying: boolean,
      golden: boolean,
      tomatoRadius: number,
      time: number,
    ) => {
      context.save();
      context.translate(x, y);
      context.scale(direction, 1);
      context.fillStyle = "rgba(255, 255, 255, 0.22)";

      // A deliberately stepped two-frame flap, similar to a pixel-game sprite.
      const wingsUp = Math.floor(time / 200) % 2 === 0;

      // Side-facing body, beak and tail: straight segments only.
      context.beginPath();
      context.moveTo(size * 1.38, 0);
      context.lineTo(size * 0.78, -size * 0.22);
      context.lineTo(size * 0.28, -size * 0.3);
      context.lineTo(-size * 0.5, -size * 0.2);
      context.lineTo(-size * 1.25, -size * 0.48);
      context.lineTo(-size * 0.96, 0);
      context.lineTo(-size * 1.22, size * 0.4);
      context.lineTo(-size * 0.42, size * 0.2);
      context.lineTo(size * 0.46, size * 0.22);
      context.lineTo(size * 0.9, size * 0.12);
      context.closePath();
      context.fill();

      // Two fixed polygon poses: wing up / wing down.
      context.beginPath();
      if (wingsUp) {
        context.moveTo(-size * 0.42, -size * 0.05);
        context.lineTo(-size * 0.12, -size * 1.28);
        context.lineTo(size * 0.42, -size * 0.2);
        context.lineTo(size * 0.08, size * 0.06);
      } else {
        context.moveTo(-size * 0.42, size * 0.04);
        context.lineTo(size * 0.02, size * 1.16);
        context.lineTo(size * 0.48, size * 0.18);
        context.lineTo(size * 0.08, -size * 0.06);
      }
      context.closePath();
      context.fill();

      context.restore();
      if (carrying) {
        const tomatoY = y + size * 0.62 + tomatoRadius;
        drawTomato(context, x, tomatoY, tomatoRadius, golden, 0);
      }
    };

    const drawBalloon = (x: number, y: number, size: number, direction: 1 | -1) => {
      context.save();
      context.translate(x, y);
      context.scale(direction, 1);
      context.fillStyle = "rgba(255, 255, 255, 0.25)";
      context.beginPath();
      context.ellipse(0, -size * 0.35, size * 0.72, size, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(-size * 0.42, size * 0.28);
      context.lineTo(-size * 0.22, size * 0.9);
      context.lineTo(size * 0.22, size * 0.9);
      context.lineTo(size * 0.42, size * 0.28);
      context.closePath();
      context.fill();
      context.fillRect(-size * 0.34, size * 0.82, size * 0.68, size * 0.42);
      context.restore();
    };

    const drawUfo = (x: number, y: number, size: number) => {
      context.save();
      context.translate(x, y);
      context.fillStyle = "rgba(255, 255, 255, 0.25)";
      context.beginPath();
      context.ellipse(0, -size * 0.25, size * 0.48, size * 0.38, 0, Math.PI, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(-size, 0);
      context.lineTo(-size * 0.58, -size * 0.28);
      context.lineTo(size * 0.58, -size * 0.28);
      context.lineTo(size, 0);
      context.lineTo(size * 0.55, size * 0.3);
      context.lineTo(-size * 0.55, size * 0.3);
      context.closePath();
      context.fill();
      context.fillStyle = "rgba(239, 83, 80, 0.65)";
      for (const lightX of [-0.55, 0, 0.55]) {
        context.fillRect(lightX * size - size * 0.08, size * 0.02, size * 0.16, size * 0.12);
      }
      context.restore();
    };

    function buildBackgroundCanvas() {
      if (!backgroundContext) return;
      const ppm = CONFIG.world.pixelsPerMeter;
      backgroundCanvas.width = 2048;
      backgroundCanvas.height = 4096;
      backgroundWorld.width = CONFIG.world.backgroundWidthMeters * ppm;
      backgroundWorld.height = CONFIG.world.backgroundHeightMeters * ppm;
      backgroundWorld.left = width / 2 - backgroundWorld.width / 2;
      backgroundWorld.top = height - backgroundWorld.height;
      const sx = backgroundCanvas.width / backgroundWorld.width;
      const sy = backgroundCanvas.height / backgroundWorld.height;
      backgroundContext.setTransform(sx, 0, 0, sy, -backgroundWorld.left * sx, -backgroundWorld.top * sy);
      backgroundContext.clearRect(backgroundWorld.left, backgroundWorld.top, backgroundWorld.width, backgroundWorld.height);
      backgroundContext.strokeStyle = breakModeRef.current ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)";
      backgroundContext.lineCap = "round";
      backgroundContext.lineJoin = "round";
      const ground = height;
      const center = width / 2;

      // Person + harvest basket: minimal Lucide-like line icons.
      const personX = center - 650;
      backgroundContext.lineWidth = 18;
      backgroundContext.beginPath();
      backgroundContext.arc(personX, ground - 775, 75, 0, Math.PI * 2);
      backgroundContext.moveTo(personX, ground - 700); backgroundContext.lineTo(personX, ground - 300);
      backgroundContext.moveTo(personX, ground - 590); backgroundContext.lineTo(personX - 145, ground - 430);
      backgroundContext.moveTo(personX, ground - 590); backgroundContext.lineTo(personX + 145, ground - 430);
      backgroundContext.moveTo(personX, ground - 300); backgroundContext.lineTo(personX - 120, ground);
      backgroundContext.moveTo(personX, ground - 300); backgroundContext.lineTo(personX + 120, ground);
      backgroundContext.stroke();
      backgroundContext.beginPath();
      backgroundContext.roundRect(center - 350, ground - 225, 360, 225, 28);
      backgroundContext.moveTo(center - 300, ground - 225);
      backgroundContext.quadraticCurveTo(center - 170, ground - 410, center - 40, ground - 225);
      backgroundContext.stroke();

      // Kei truck: one clean body outline and two wheel circles.
      const truckX = center + 1700;
      backgroundContext.lineWidth = 34;
      backgroundContext.beginPath();
      backgroundContext.moveTo(truckX - 850, ground - 210);
      backgroundContext.lineTo(truckX - 850, ground - 820);
      backgroundContext.lineTo(truckX + 200, ground - 820);
      backgroundContext.lineTo(truckX + 330, ground - 1000);
      backgroundContext.lineTo(truckX + 850, ground - 1000);
      backgroundContext.lineTo(truckX + 850, ground - 210);
      backgroundContext.closePath();
      backgroundContext.moveTo(truckX + 260, ground - 820); backgroundContext.lineTo(truckX + 850, ground - 820);
      backgroundContext.moveTo(truckX + 540, ground - 1000); backgroundContext.lineTo(truckX + 540, ground - 820);
      backgroundContext.stroke();
      backgroundContext.beginPath();
      backgroundContext.arc(truckX - 500, ground - 180, 165, 0, Math.PI * 2);
      backgroundContext.arc(truckX + 520, ground - 180, 165, 0, Math.PI * 2);
      backgroundContext.stroke();

      // Large container: rounded frame with only a few structural lines.
      const containerX = center + 7200;
      backgroundContext.lineWidth = 54;
      backgroundContext.beginPath();
      backgroundContext.roundRect(containerX - 3050, ground - 1300, 6100, 1300, 80);
      for (let x = containerX - 2000; x <= containerX + 2000; x += 1000) {
        backgroundContext.moveTo(x, ground - 1200); backgroundContext.lineTo(x, ground - 100);
      }
      backgroundContext.stroke();

      // Helicopter: capsule cabin, tail, rotor and skids.
      const heliX = center - 7000;
      backgroundContext.lineWidth = 64;
      backgroundContext.beginPath();
      backgroundContext.ellipse(heliX, ground - 950, 1900, 620, 0, 0, Math.PI * 2);
      backgroundContext.moveTo(heliX + 1750, ground - 950); backgroundContext.lineTo(heliX + 3000, ground - 1380);
      backgroundContext.lineTo(heliX + 3100, ground - 680);
      backgroundContext.moveTo(heliX, ground - 1570); backgroundContext.lineTo(heliX, ground - 1770);
      backgroundContext.moveTo(heliX - 2900, ground - 1770); backgroundContext.lineTo(heliX + 2900, ground - 1770);
      backgroundContext.moveTo(heliX - 800, ground - 330); backgroundContext.lineTo(heliX - 1150, ground);
      backgroundContext.moveTo(heliX + 800, ground - 330); backgroundContext.lineTo(heliX + 1150, ground);
      backgroundContext.moveTo(heliX - 1300, ground); backgroundContext.lineTo(heliX + 1300, ground);
      backgroundContext.stroke();

      // Statue of Liberty: pedestal, robe, head and torch as a sparse outline.
      const statueX = center + 20_000;
      backgroundContext.lineWidth = 260;
      backgroundContext.beginPath();
      backgroundContext.roundRect(statueX - 3000, ground - 14_000, 6000, 14_000, 300);
      backgroundContext.moveTo(statueX - 1800, ground - 14_000);
      backgroundContext.lineTo(statueX - 1100, ground - 36_500);
      backgroundContext.lineTo(statueX + 1400, ground - 36_500);
      backgroundContext.lineTo(statueX + 2200, ground - 14_000);
      backgroundContext.moveTo(statueX, ground - 36_500);
      backgroundContext.lineTo(statueX + 2800, ground - 44_500);
      backgroundContext.lineTo(statueX + 2800, ground - 46_500);
      backgroundContext.stroke();
      backgroundContext.beginPath();
      backgroundContext.arc(statueX, ground - 38_500, 1350, 0, Math.PI * 2);
      backgroundContext.stroke();
      backgroundContext.beginPath();
      for (let ray = 0; ray < 7; ray++) {
        const angle = -Math.PI + ray * Math.PI / 6;
        backgroundContext.moveTo(statueX + Math.cos(angle) * 1500, ground - 38_500 + Math.sin(angle) * 1500);
        backgroundContext.lineTo(statueX + Math.cos(angle) * 2300, ground - 38_500 + Math.sin(angle) * 2300);
      }
      backgroundContext.stroke();
    }

    const rebuildSleepingCache = (now: number) => {
      if (!sleepingContext) return;
      const dpr = window.devicePixelRatio || 1;
      sleepingContext.setTransform(1, 0, 0, 1, 0, 0);
      sleepingContext.clearRect(0, 0, sleepingCanvas.width, sleepingCanvas.height);
      sleepingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      cacheScale = currentScale.current;
      sleepingContext.save();
      sleepingContext.translate(width / 2, height);
      sleepingContext.scale(cacheScale, cacheScale);
      sleepingContext.translate(-width / 2, -height);
      sleepingBodies.forEach((body) => drawTomatoBody(body, sleepingContext));
      sleepingContext.restore();
      cachedSleeping = new Set(sleepingBodies);
      pendingSleeping.clear();
      sleepingCacheDirty = false;
      forceCacheRefresh = false;
      lastCacheRefresh = now;
    };

    resize(); createBoundaries();
    const total = counts.normal + counts.gold;
    const visible = Math.min(total, CONFIG.maxRestoredBodies);
    const goldVisible = total ? Math.min(counts.gold, Math.round(visible * counts.gold / total)) : 0;
    for (let i = 0; i < visible; i++) createTomato(i < goldVisible, true);

    const render = (now: number) => {
      const frameDelta = Math.min(100, Math.max(0, now - previousFrameTime));
      previousFrameTime = now;
      ufoEventTime += frameDelta;
      const ufoNow = ufoEventTime;
      Engine.update(engine, 1000 / 60);
      if (themeDirtyRef.current) {
        buildBackgroundCanvas();
        themeDirtyRef.current = false;
      }
      if (isFocusRunningRef.current
        && ufoEvents.length === 0
        && birdDeliveries.length === 0
        && balloonEvents.length === 0
        && deferredDeliveries.length > 0) {
        startDelivery(deferredDeliveries.shift() ?? false);
      }
      coreEvaluationFrame += 1;
      if (coreEvaluationFrame % DEEP_CORE_EVALUATION_INTERVAL === 0) optimizeDeepCore(now);
      let leftmostPoint = Number.POSITIVE_INFINITY;
      let rightmostPoint = Number.NEGATIVE_INFINITY;
      let highestPoint = Number.POSITIVE_INFINITY;
      const includeBodyBounds = (body: Matter.Body) => {
        leftmostPoint = Math.min(leftmostPoint, body.bounds.min.x);
        rightmostPoint = Math.max(rightmostPoint, body.bounds.max.x);
        highestPoint = Math.min(highestPoint, body.bounds.min.y - 25);
      };
      activeBodies.forEach((body) => {
        const tomato = body.plugin.tomato as { createdAt?: number } | undefined;
        const createdAt = tomato?.createdAt ?? now;
        if (body.isSleeping || (now - createdAt >= 2_000 && body.speed < 0.1 && body.position.y > height * 0.4)) {
          includeBodyBounds(body);
        }
      });
      sleepingBodies.forEach(includeBodyBounds);
      if (Number.isFinite(leftmostPoint) && Number.isFinite(rightmostPoint) && Number.isFinite(highestPoint)) {
        const centerX = width / 2;
        const horizontalMargin = width * 0.1;
        const safeLeft = horizontalMargin;
        const safeRight = width - horizontalMargin;
        const safeTop = height * 0.3;
        const screenLeft = centerX + (leftmostPoint - centerX) * currentScale.current;
        const screenRight = centerX + (rightmostPoint - centerX) * currentScale.current;
        const screenTop = height + (highestPoint - height) * currentScale.current;
        if (screenLeft < safeLeft || screenRight > safeRight || screenTop < safeTop) {
          const leftDistance = Math.max(0, centerX - leftmostPoint);
          const rightDistance = Math.max(0, rightmostPoint - centerX);
          const topDistance = Math.max(0, height - highestPoint);
          const horizontalHalfSpace = width * 0.4;
          const horizontalScale = Math.min(
            leftDistance > 0 ? horizontalHalfSpace / leftDistance : 1,
            rightDistance > 0 ? horizontalHalfSpace / rightDistance : 1,
          );
          const verticalScale = topDistance > 0 ? (height - safeTop) / topDistance : 1;
          const nextTargetScale = Math.max(
            MIN_DYNAMIC_CAMERA_SCALE,
            Math.min(1, horizontalScale, verticalScale),
          );
          targetScale.current = Math.min(targetScale.current, nextTargetScale);
        }
      }
      currentScale.current += (targetScale.current - currentScale.current) * 0.03;
      if (Math.abs(targetScale.current - currentScale.current) < 0.0001) currentScale.current = targetScale.current;
      const bounds = getBounds(currentScale.current);
      camera.current = bounds;
      syncBoundaries(bounds);
      if (sleepingCacheDirty && (forceCacheRefresh || now - lastCacheRefresh >= 500)) {
        rebuildSleepingCache(now);
      }
      context.clearRect(0, 0, width, height); context.save();
      context.translate(width / 2, height);
      context.scale(currentScale.current, currentScale.current);
      context.translate(-width / 2, -height);
      context.drawImage(
        backgroundCanvas,
        backgroundWorld.left,
        backgroundWorld.top,
        backgroundWorld.width,
        backgroundWorld.height,
      );
      context.restore();

      if (cachedSleeping.size && sleepingCanvas.width) {
        const ratio = currentScale.current / cacheScale;
        context.save();
        context.translate(width / 2, height);
        context.scale(ratio, ratio);
        context.translate(-width / 2, -height);
        context.drawImage(sleepingCanvas, 0, 0, width, height);
        context.restore();
      }

      context.save();
      context.translate(width / 2, height);
      context.scale(currentScale.current, currentScale.current);
      context.translate(-width / 2, -height);
      activeBodies.forEach((body) => drawTomatoBody(body));
      pendingSleeping.forEach((body) => drawTomatoBody(body));
      for (let index = birdDeliveries.length - 1; index >= 0; index--) {
        const delivery = birdDeliveries[index];
        const progress = Math.min(1, (ufoNow - delivery.startedAt) / delivery.duration);
        const routeMargin = 70 / currentScale.current;
        const fromX = delivery.direction === 1 ? bounds.left - routeMargin : bounds.right + routeMargin;
        const toX = delivery.direction === 1 ? bounds.right + routeMargin : bounds.left - routeMargin;
        const x = fromX + (toX - fromX) * progress;
        // Convert the measured toolbar-safe screen position into current world coordinates.
        const y = bounds.top + (height * 0.25) / currentScale.current;
        const birdSize = 24 / currentScale.current;
        if (!delivery.released && progress >= delivery.releaseAt) {
          delivery.released = true;
          const dropCount = activeBuffsRef.current.doubleDrop ? 2 : 1;
          for (let dropIndex = 0; dropIndex < dropCount; dropIndex++) {
            const dropOffset = (dropIndex - (dropCount - 1) / 2) * delivery.radius * 0.8;
            createTomato(
              delivery.golden,
              false,
              { x: x + dropOffset, y: y + birdSize * 0.62 + delivery.radius },
              delivery.radius,
            );
            if (delivery.golden) goldenDropRef.current();
            if (dropIndex > 0) bonusTomatoRef.current(delivery.golden);
          }
        }
        drawBird(
          x,
          y,
          birdSize,
          delivery.direction,
          !delivery.released,
          delivery.golden,
          delivery.radius,
          ufoNow,
        );
        if (progress >= 1) birdDeliveries.splice(index, 1);
      }
      for (let index = balloonEvents.length - 1; index >= 0; index--) {
        const balloon = balloonEvents[index];
        const progress = Math.min(1, (ufoNow - balloon.startedAt) / balloon.duration);
        const routeMargin = 100 / currentScale.current;
        const fromX = balloon.direction === 1 ? bounds.left - routeMargin : bounds.right + routeMargin;
        const toX = balloon.direction === 1 ? bounds.right + routeMargin : bounds.left - routeMargin;
        const x = fromX + (toX - fromX) * progress;
        // Extra sky lane below the measured toolbar keeps the entire balloon visible.
        const balloonScreenY = height * 0.15;
        const windBob = Math.sin(ufoNow * 0.002) * 14;
        const y = bounds.top + (balloonScreenY + windBob) / currentScale.current;
        const balloonSize = 42 / currentScale.current;

        const dropMargin = (bounds.right - bounds.left) * 0.2;
        const dropAreaLeft = bounds.left + dropMargin;
        const dropAreaRight = bounds.right - dropMargin;
        const insideDropArea = x >= dropAreaLeft && x <= dropAreaRight;
        if (insideDropArea && !balloon.enteredViewport) {
          balloon.enteredViewport = true;
          balloon.nextDropAt = ufoNow;
        }
        while (insideDropArea && ufoNow >= balloon.nextDropAt) {
          const wasInitialDrop = balloon.initialDropPending;
          const spec = createTomatoSpec(wasInitialDrop ? balloon.initialGolden : undefined);
          const dropX = Math.min(dropAreaRight, Math.max(dropAreaLeft, x));
          const dropCount = activeBuffsRef.current.doubleDrop ? 2 : 1;
          for (let dropIndex = 0; dropIndex < dropCount; dropIndex++) {
            const dropOffset = (dropIndex - (dropCount - 1) / 2) * spec.radius * 0.8;
            createTomato(
              spec.golden,
              false,
              {
                x: Math.min(dropAreaRight, Math.max(dropAreaLeft, dropX + dropOffset)),
                y: y + balloonSize * 1.35 + spec.radius,
              },
              spec.radius,
            );
            if (spec.golden) goldenDropRef.current();
            if (!wasInitialDrop || dropIndex > 0) bonusTomatoRef.current(spec.golden);
          }
          balloon.initialDropPending = false;
          balloon.nextDropAt += 250;
        }

        drawBalloon(x, y, balloonSize, balloon.direction);
        if (progress >= 1) balloonEvents.splice(index, 1);
      }

      if (isFocusRunningRef.current && ufoNow >= nextUfoCheckAt) {
        nextUfoCheckAt = ufoNow + UFO_CHECK_INTERVAL_MS;
        const otherAirEventActive = birdDeliveries.length > 0 || balloonEvents.length > 0;
        if (isUfoUnlockedRef.current
          && ufoEvents.length === 0
          && !otherAirEventActive
          && Math.random() < UFO_APPEARANCE_CHANCE) {
          const entryDuration = 2200;
          const startedAt = ufoNow;
          ufoEvents.push({
            startedAt,
            hoverDuration: 20_000 + Math.random() * 40_000,
            entryDuration,
            exitDuration: 3000,
            direction: Math.random() < 0.5 ? 1 : -1,
            nextDropAt: startedAt + entryDuration + 600,
          });
        }
      }

      for (let index = ufoEvents.length - 1; index >= 0; index--) {
        const ufo = ufoEvents[index];
        const elapsed = ufoNow - ufo.startedAt;
        const hoverStart = ufo.entryDuration;
        const hoverEnd = hoverStart + ufo.hoverDuration;
        const eventEnd = hoverEnd + ufo.exitDuration;
        const routeMargin = 130 / currentScale.current;
        const enterX = ufo.direction === 1 ? bounds.left - routeMargin : bounds.right + routeMargin;
        const leaveX = ufo.direction === 1 ? bounds.right + routeMargin : bounds.left - routeMargin;
        const centerX = (bounds.left + bounds.right) / 2;
        const hoverRange = (bounds.right - bounds.left) * 0.26;
        let x: number;

        if (elapsed < hoverStart) {
          const entryProgress = Math.max(0, elapsed / ufo.entryDuration);
          const eased = 1 - Math.pow(1 - entryProgress, 3);
          x = enterX + (centerX - enterX) * eased;
        } else if (elapsed < hoverEnd) {
          x = centerX + Math.sin((elapsed - hoverStart) * 0.0008) * hoverRange;
        } else {
          const exitStartX = centerX + Math.sin(ufo.hoverDuration * 0.0008) * hoverRange;
          const exitProgress = Math.min(1, (elapsed - hoverEnd) / ufo.exitDuration);
          const eased = exitProgress * exitProgress;
          x = exitStartX + (leaveX - exitStartX) * eased;
        }

        const ufoScreenY = Math.max(flightScreenY + 72, height * 0.22);
        const floatY = Math.sin(ufoNow * 0.0015) * 12;
        const y = bounds.top + (ufoScreenY + floatY) / currentScale.current;
        const ufoSize = 50 / currentScale.current;
        const dropMargin = (bounds.right - bounds.left) * 0.2;
        const dropAreaLeft = bounds.left + dropMargin;
        const dropAreaRight = bounds.right - dropMargin;

        while (elapsed >= hoverStart && elapsed < hoverEnd && ufoNow >= ufo.nextDropAt) {
          const goldenChance = activeBuffsRef.current.goldBoost ? CONFIG.goldenChance * 2 : CONFIG.goldenChance;
          const spec: TomatoSpec = {
            golden: Math.random() < goldenChance,
            radius: (20 + Math.random() * 5) * (2.5 + Math.random() * 0.5),
          };
          const dropCount = activeBuffsRef.current.doubleDrop ? 2 : 1;
          for (let dropIndex = 0; dropIndex < dropCount; dropIndex++) {
            const dropOffset = (dropIndex - (dropCount - 1) / 2) * spec.radius * 0.8;
            createTomato(
              spec.golden,
              false,
              {
                x: Math.min(dropAreaRight, Math.max(dropAreaLeft, x + dropOffset)),
                y: y + ufoSize * 0.65 + spec.radius,
              },
              spec.radius,
            );
            bonusTomatoRef.current(spec.golden);
            if (spec.golden) goldenDropRef.current();
          }
          ufo.nextDropAt += 1400;
        }

        drawUfo(x, y, ufoSize);
        if (elapsed >= eventEnd) ufoEvents.splice(index, 1);
      }
      context.restore();
      frame = requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    if (toolbar) observer.observe(toolbar);
    frame = requestAnimationFrame(render);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame); Engine.clear(engine);
      addRef.current = () => undefined;
      removeGoldenRef.current = () => 0;
    };
    // Counts are read only for initial restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  return <div ref={containerRef} className="pointer-events-none absolute inset-0 z-10"><canvas ref={canvasRef} className="h-full w-full" /></div>;
});
