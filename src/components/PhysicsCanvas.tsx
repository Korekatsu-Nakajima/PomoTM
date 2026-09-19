"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Matter from "matter-js";
import { CONFIG } from "@/lib/config";
import { loadSavedCameraState, saveSavedCameraState } from "@/hooks/useGameStorage";
import { createCarrierRenderers, createTomatoRenderer } from "@/utils/canvasRenderer";
import { clampUnit, getSkyColors, getTomatoDiagnosticType, smoothStep } from "@/utils/gameUtils";
import { correctDeepTomatoOverlap, sanitizeWorldBodies } from "@/utils/physicsSafety";
import { createTerrainSegmentParts, getCentralCoreBounds, getVisibleTomatoBodies } from "@/utils/terrainUtils";
import type {
  AlienEvent,
  AuroraEvent,
  BalloonEvent,
  BirdDelivery,
  CameraBounds,
  ContrailParticle,
  JuiceParticle,
  OctopusEvent,
  PhysicsCanvasHandle,
  PhysicsCanvasProps,
  PhysicsDiagnosticAlert,
  SavedCameraState,
  ShootingStarEvent,
  StarParticle,
  TomatoBodyData,
  TomatoSpec,
  UfoEvent,
} from "@/types/game";
import {
  ALIEN_APPEARANCE_CHANCE,
  ALIEN_CHECK_INTERVAL_MS,
  ALIEN_EVENT_ALTITUDE,
  AURORA_APPEARANCE_CHANCE,
  AURORA_CHECK_INTERVAL_MS,
  AURORA_EVENT_ALTITUDE,
  BONUS_BREAK_GIANT_CHANCE,
  BONUS_BREAK_GOLDEN_CHANCE,
  DEEP_CORE_BODY_THRESHOLD,
  DEEP_CORE_EVALUATION_INTERVAL,
  DEEP_CORE_INSET,
  HIGH_ALTITUDE_EVENT_INTERVAL_MS,
  LOW_ALTITUDE_EVENT_INTERVAL_MS,
  MIN_DYNAMIC_CAMERA_SCALE,
  OCTOPUS_APPEARANCE_CHANCE,
  OCTOPUS_CHECK_INTERVAL_MS,
  PHYSICS_ENGINE_OPTIONS,
  PISA_TOWER_SVG_PATHS,
  ROCKET_APPEARANCE_CHANCE,
  SHOOTING_STAR_APPEARANCE_CHANCE,
  SHOOTING_STAR_CHECK_INTERVAL_MS,
  SHOOTING_STAR_EVENT_ALTITUDE,
  SPACE_EVENT_ALTITUDE,
  STATUE_OF_LIBERTY_SVG_PATHS,
  SUPPLY_GIANT_CHANCE,
  SUPPLY_GOLDEN_CHANCE,
  TERRAIN_EVALUATION_INTERVAL,
  TERRAIN_SEGMENT_COUNT,
  TERRAIN_VIEWPORT_MARGIN,
  UFO_APPEARANCE_CHANCE,
} from "@/constants/assets";

export type PhysicsCanvasHandle = {
  drop: (golden: boolean) => void;
  removeGolden: (count: number) => number;
};
type Props = {
  counts: TomatoCounts;
  hydrated: boolean;
  onBonusTomato: (golden: boolean) => void;
  onGoldenTomatoDrop: () => void;
  ufoUnlocked: boolean;
  isBreak: boolean;
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
const OFFSCREEN_CULL_INTERVAL = 30;
const UFO_CHECK_INTERVAL_MS = 45_000;
const UFO_APPEARANCE_CHANCE = 0.03;

export const PhysicsCanvas = forwardRef<PhysicsCanvasHandle, Props>(function PhysicsCanvas(
  { counts, hydrated, onBonusTomato, onGoldenTomatoDrop, ufoUnlocked, isBreak }, ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const addRef = useRef<(golden?: boolean, settled?: boolean) => void>(() => undefined);
  const removeGoldenRef = useRef<(count: number) => number>(() => 0);
  const saveCameraStateRef = useRef<() => void>(() => undefined);
  const currentScale = useRef<number>(1);
  const targetScale = useRef<number>(1);
  const currentOffsetY = useRef<number>(0);
  const targetOffsetY = useRef<number>(0);
  const camera = useRef<CameraBounds>({ left: 0, right: 1, top: 0, bottom: 1 });
  const bonusTomatoRef = useRef(onBonusTomato);
  const goldenDropRef = useRef(onGoldenTomatoDrop);
  const ufoUnlockedRef = useRef(ufoUnlocked);
  const breakRef = useRef(isBreak);

  useImperativeHandle(ref, () => ({
    drop: (golden) => addRef.current(golden),
    removeGolden: (count) => removeGoldenRef.current(count),
  }), []);
  useEffect(() => { bonusTomatoRef.current = onBonusTomato; }, [onBonusTomato]);
  useEffect(() => { goldenDropRef.current = onGoldenTomatoDrop; }, [onGoldenTomatoDrop]);
  useEffect(() => { ufoUnlockedRef.current = ufoUnlocked; }, [ufoUnlocked]);
  useEffect(() => { breakRef.current = isBreak; }, [isBreak]);

  useEffect(() => {
    isFocusRunningRef.current = timerMode === "focus" && isTimerRunning;
    isSupplyRunningRef.current = isTimerRunning
      && (timerMode === "focus" || (timerMode === "break" && isBonusBreakMode));
    breakModeRef.current = timerMode === "break";
    themeDirtyRef.current = true;
  }, [isBonusBreakMode, isTimerRunning, timerMode]);
  useEffect(() => {
    if (!isTimerRunning) saveCameraStateRef.current();
  }, [isTimerRunning]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !hydrated) return;
    const toolbar = container.closest("section")?.querySelector<HTMLElement>("[data-control-toolbar]");

    const { Engine, Runner, Bodies, Body, Composite } = Matter;
    const engine = Engine.create({
      enableSleeping: true,
      positionIterations: 10,
      velocityIterations: 10,
      gravity: { x: 0, y: 1.05 },
    });
    Composite.clear(engine.world, false, true);
    Engine.clear(engine);
    const runner = Runner.create();
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 1, height = 1, frame = 0;
    let disposed = false;
    const initialCountOffset = totalCount.current;
    let pixelRatio = 1;
    let flightScreenY = 150;
    let settledPileTop = Number.POSITIVE_INFINITY;
    let leftWall: Matter.Body, rightWall: Matter.Body, floor: Matter.Body;
    let cloudFloorBody: Matter.Body | null = null;
    let cloudFloorParts: Matter.Body[] = [];
    let cloudFloorEnabled = false;
    let cloudFloorCleanupY = Number.POSITIVE_INFINITY;
    let wallHeight = 1, floorWidth = 1;
    const activeBodies = new Set<Matter.Body>();
    const sleepingBodies = new Set<Matter.Body>();
    const tomatoBodies: Matter.Body[] = [];
    const birdDeliveries: BirdDelivery[] = [];
    const balloonEvents: BalloonEvent[] = [];
    const ufoEvents: UfoEvent[] = [];
    let eventTime = performance.now();
    let previousFrameTime = eventTime;
    let nextUfoCheckAt = eventTime + UFO_CHECK_INTERVAL_MS;
    let renderFrameCount = 0;
    let imageReady = false;
    const image = new Image();
    if (CONFIG.tomatoImageUrl) {
      image.onload = () => { if (!disposed) imageReady = true; };
      image.src = CONFIG.tomatoImageUrl;
    }

    const handleVisibilityChange = () => {
      pageHidden = document.hidden;
      previousFrameTime = performance.now();
      deferredDeliveries.length = 0;
      if (!pageHidden) {
        const eventInterval = currentAltitude >= ALIEN_EVENT_ALTITUDE
          ? HIGH_ALTITUDE_EVENT_INTERVAL_MS
          : LOW_ALTITUDE_EVENT_INTERVAL_MS;
        nextUfoCheckAt = ufoEventTime + eventInterval;
        nextOctopusCheckAt = ufoEventTime + OCTOPUS_CHECK_INTERVAL_MS;
        nextRocketCheckAt = ufoEventTime + eventInterval;
        nextAlienCheckAt = ufoEventTime + ALIEN_CHECK_INTERVAL_MS;
        nextAuroraCheckAt = ufoEventTime + AURORA_CHECK_INTERVAL_MS;
        nextShootingStarCheckAt = ufoEventTime + SHOOTING_STAR_CHECK_INTERVAL_MS;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const getBounds = (scale: number, offsetY = currentOffsetY.current): CameraBounds => {
      const visibleWidth = width / scale;
      const visibleHeight = height / scale;
      const bottom = height - offsetY;
      return {
        left: width / 2 - visibleWidth / 2,
        right: width / 2 + visibleWidth / 2,
        top: bottom - visibleHeight,
        bottom,
      };
    };

    const syncBoundaries = (bounds: CameraBounds) => {
      if (disposed || !leftWall || !rightWall || !floor) return;
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
      const wallY = (bounds.top + height) / 2;
      const floorX = (bounds.left + bounds.right) / 2;
      if (Math.abs(leftWall.position.x - (bounds.left - 20)) > 0.01 || Math.abs(leftWall.position.y - wallY) > 0.01) {
        Body.setPosition(leftWall, { x: bounds.left - 20, y: wallY });
        Body.setPosition(rightWall, { x: bounds.right + 20, y: wallY });
      }
      if (Math.abs(floor.position.x - floorX) > 0.01 || Math.abs(floor.position.y - (height + 20)) > 0.01) {
        Body.setPosition(floor, { x: floorX, y: height + 20 });
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

    const createCloudFloor = (bounds: CameraBounds) => {
      if (cloudFloorBody) Composite.remove(engine.world, cloudFloorBody);
      const scale = Math.max(currentScale.current, MIN_DYNAMIC_CAMERA_SCALE);
      const visibleWidth = bounds.right - bounds.left;
      const cloudY = bounds.bottom - 50 / scale;
      const nominalRadius = 42 / scale;
      const overlapSpacing = nominalRadius * 1.42;
      const puffCount = Math.max(3, Math.ceil(visibleWidth / overlapSpacing) + 1);
      const coveredWidth = overlapSpacing * (puffCount - 1);
      const startX = (bounds.left + bounds.right - coveredWidth) / 2;
      cloudFloorParts = Array.from({ length: puffCount }, (_, index) => {
        const radius = nominalRadius * (0.88 + (index % 3) * 0.06);
        const y = cloudY + (index % 2 === 0 ? 0 : nominalRadius * 0.08);
        return Bodies.circle(startX + index * overlapSpacing, y, radius, {
          isStatic: true,
          label: "cloud-floor-puff",
          friction: 0.72,
          restitution: 0,
          render: { visible: false },
        });
      });
      cloudFloorBody = Matter.Body.create({
        parts: cloudFloorParts,
        isStatic: true,
        label: "cloud-floor",
        friction: 0.72,
        restitution: 0,
        render: { visible: false },
      });
      cloudFloorCleanupY = bounds.bottom + 300 / scale;
      cloudFloorEnabled = true;
      floor.collisionFilter.mask = 0;
      Composite.add(engine.world, cloudFloorBody);
    };

    const resize = () => {
      if (disposed || !canvasRef.current || !containerRef.current) return;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      pixelRatio = dpr;
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      if (toolbar) {
        const toolbarRect = toolbar.getBoundingClientRect();
        flightScreenY = Math.max(150, toolbarRect.bottom - rect.top + 28);
      }
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (leftWall) syncBoundaries(getBounds(currentScale.current));
    };

    const createTomato = (
      golden = false,
      settled = false,
      spawn?: { x: number; y: number },
      fixedRadius?: number,
      squishy?: boolean,
    ) => {
      const radius = fixedRadius ?? (20 + Math.random() * 5) * (0.92 + Math.random() * 0.16);
      const isSquishy = squishy ?? (!golden && Math.random() < 0.04);
      const standardRadius = 22.5;
      const radiusRatio = radius / standardRadius;
      const isGiant = radiusRatio >= 2;
      const isMedium = !isGiant && radiusRatio >= 1.2;
      const density = 0.001 * radiusRatio * (golden ? 3.5 : 1);
      const restitution = golden ? 0.05 : isGiant ? 0.10 : isMedium ? 0.20 : 0.25;
      const friction = golden ? 0.30 : isGiant ? 0.50 : isMedium ? 0.55 : 0.60;
      const bounds = camera.current;
      const x = spawn?.x ?? bounds.left + radius + Math.random() * Math.max(radius, bounds.right - bounds.left - radius * 2);
      const y = spawn?.y ?? (settled
        ? Math.max(bounds.top + radius, bounds.bottom - 60 - Math.random() * Math.min(230, (bounds.bottom - bounds.top) * 0.55))
        : bounds.top - radius * 2);
      const body = Bodies.circle(x, y, radius, {
        restitution,
        friction,
        frictionStatic: 1.0,
        frictionAir: 0.02,
        density,
        slop: 0.05,
        sleepThreshold: 30,
        label: "tomato", plugin: { tomato: { golden, radius, createdAt: eventTime } },
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
      Composite.add(engine.world, body);
      activeBodies.add(body);
      Matter.Events.on(body, "sleepStart", () => {
        const tomato = body.plugin.tomato as TomatoBodyData;
        tomato.hasSettled = true;
        activeBodies.delete(body);
        sleepingBodies.add(body);
        settledPileTop = Math.min(settledPileTop, body.bounds.min.y);
      });
      Matter.Events.on(body, "sleepEnd", () => {
        sleepingBodies.delete(body);
        activeBodies.add(body);
      });
      tomatoBodies.push(body);
    };

    const saveCameraState = () => {
      const savedCamera: SavedCameraState = {
        scale: currentScale.current,
        offsetY: currentOffsetY.current,
      };
      saveSavedCameraState(savedCamera);
    };
    saveCameraStateRef.current = saveCameraState;

    const readSavedCameraState = (): SavedCameraState | null => {
      return loadSavedCameraState();
    };

    const createRadius = (giantChance = SUPPLY_GIANT_CHANCE) => {
      const baseRadius = 20 + Math.random() * 5;
      const sizeRoll = Math.random();
      if (sizeRoll < 0.003) return baseRadius * (0.3 + Math.random() * 0.1);
      if (sizeRoll < 0.006) return baseRadius * (2.5 + Math.random() * 0.5);
      return baseRadius;
    };

    const isBonusBreakActive = () => (
      isBonusBreakModeRef.current === true && breakModeRef.current === true
    );

    const queueBirdDelivery = (golden = false) => {
      if (breakRef.current) return;
      if (Math.random() < 0.003) {
        const startedAt = eventTime;
        balloonEvents.push({
          startedAt,
          duration: 13_000 + Math.random() * 2_000,
          direction: Math.random() < 0.5 ? 1 : -1,
          initialGolden: golden,
          initialDropPending: true,
          enteredViewport: false,
          nextDropAt: startedAt,
          vehicle: "balloon",
        });
        return;
      }
      const deliverySpec = useSpaceVehicles ? createMediumTomatoSpec(golden) : createTomatoSpec(golden);
      const startedAt = ufoEventTime;
      const satelliteStartYRatio = 0.25 + (Math.random() - 0.5) * 0.20;
      const satelliteEndYRatio = 0.25 + (Math.random() - 0.5) * 0.20;
      birdDeliveries.push({
        startedAt: eventTime,
        duration: 2200 + Math.random() * 600,
        releaseAt: 0.38 + Math.random() * 0.24,
        direction: Math.random() < 0.5 ? 1 : -1,
        golden,
        radius: deliverySpec.radius,
        isSquishy: deliverySpec.isSquishy,
        released: false,
        vehicle: useSatellite ? "satellite" : useSpaceVehicles ? "plane" : "bird",
        nextContrailAt: startedAt,
        initialRotation: Math.random() * Math.PI * 2,
        nextRadioAt: startedAt + 2_000 + Math.random() * 3_000,
        radioPulseStartedAt: Number.NEGATIVE_INFINITY,
        satelliteStartYRatio,
        satelliteEndYRatio,
      });
    };
    const queueBirdDelivery = (golden = false) => {
      if (pageHidden) return;
      if (!isSupplyRunningRef.current) return;
      if (debugUfoModeRef.current) return;
      if (ufoEvents.length > 0 || octopusEvent) {
        deferredDeliveries.push(golden);
        return;
      }
      startDelivery(golden);
    };
    addRef.current = queueBirdDelivery;

    const removeTomatoBody = (body: Matter.Body) => {
      if (disposed || !tomatoBodies.includes(body)) return false;
      try {
        Composite.remove(engine.world, body);
        Matter.Events.off(body, "sleepStart");
        Matter.Events.off(body, "sleepEnd");
      } catch {
        return false;
      }
      activeBodies.delete(body);
      sleepingBodies.delete(body);
      const bodyIndex = tomatoBodies.indexOf(body);
      if (bodyIndex >= 0) tomatoBodies.splice(bodyIndex, 1);
      return true;
    };

    const removeGoldenTomatoes = (count: number) => {
      const requested = Math.max(0, Math.floor(count));
      if (!requested) return 0;
      const goldenBodies = [...activeBodies, ...sleepingBodies]
        .filter((body) => Boolean((body.plugin.tomato as { golden?: boolean } | undefined)?.golden))
        .sort((first, second) => first.bounds.min.y - second.bounds.min.y)
        .slice(0, requested);

      for (const body of goldenBodies) {
        removeTomatoBody(body);
      }
      settledPileTop = sleepingBodies.size
        ? Math.min(...[...sleepingBodies].map((body) => body.bounds.min.y))
        : Number.POSITIVE_INFINITY;
      return goldenBodies.length;
    };
    removeGoldenRef.current = removeGoldenTomatoes;

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

    const optimizeDeepCore = (now: number) => {
      const visibleBounds = camera.current;
      const centralCoreBounds = getCentralCoreBounds(visibleBounds);
      const centralCoreLeft = centralCoreBounds.left;
      const centralCoreRight = centralCoreBounds.right;
      const visibleTomatoBodies = getVisibleTomatoBodies(activeBodies, sleepingBodies, visibleBounds);
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
          || body.position.x < centralCoreLeft
          || body.position.x > centralCoreRight
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

    const drawTomato = createTomatoRenderer(image, () => imageReady);

    const drawTomatoBody = (body: Matter.Body, target: CanvasRenderingContext2D = context) => {
      const { golden, radius, isSquishy, ripeness } = body.plugin.tomato as TomatoBodyData;
      drawTomato(
        target,
        body.position.x,
        body.position.y,
        radius,
        golden,
        body.angle,
        isSquishy,
        ripeness,
      );
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
      context.globalAlpha = breakModeRef.current ? 0.92 : 0.78;
      context.fillStyle = breakModeRef.current ? "#ffffff" : "#e2e8f0";
      for (const puff of cloudFloorParts) {
        const radius = puff.circleRadius ?? 0;
        if (radius <= 0) continue;
        context.beginPath();
        context.arc(puff.position.x, puff.position.y, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    };

    const updateTomatoTransitions = (frameDelta: number) => {
      for (const body of [...ripeningBodies]) {
        const tomato = body.plugin.tomato as TomatoBodyData;
        tomato.ripeness = Math.min(1, tomato.ripeness + frameDelta / 700);
        sleepingCacheDirty = true;
        forceCacheRefresh = true;
        if (tomato.ripeness >= 1 || tomato.hasBurst) ripeningBodies.delete(body);
      }
      const currentTime = Date.now();
      const infectedBodies = new Set([...activeBodies, ...sleepingBodies, ...staticCoreBodies]);
      for (const body of infectedBodies) {
        if (body.label !== "tomato") continue;
        const tomato = body.plugin.tomato as TomatoBodyData | undefined;
        if (!tomato || !tomato.isInfected || tomato.hasBurst) continue;
        const safeBurstAt = Number.isFinite(tomato.burstAt) ? Math.max(0, tomato.burstAt) : 0;
        tomato.burstAt = safeBurstAt;
        if (safeBurstAt > 0 && currentTime >= safeBurstAt) burstTomato(body);
      }
      const pressureDecay = Math.pow(0.94, frameDelta / (1000 / 60));
      for (const body of [...pressuredBodies]) {
        const tomato = body.plugin.tomato as TomatoBodyData;
        const safePressure = Number.isFinite(tomato.pressureLoad) ? Math.max(0, tomato.pressureLoad) : 0;
        const decayedPressure = safePressure * (Number.isFinite(pressureDecay) ? pressureDecay : 1);
        tomato.pressureLoad = Number.isFinite(decayedPressure) ? Math.max(0, decayedPressure) : 0;
        if (tomato.pressureLoad < 0.05 || tomato.hasBurst) {
          tomato.pressureLoad = 0;
          pressuredBodies.delete(body);
        }
      }
    };

    const updateAndDrawJuiceParticles = (frameDelta: number) => {
      for (let index = juiceParticles.length - 1; index >= 0; index--) {
        const particle = juiceParticles[index];
        particle.life -= frameDelta;
        if (particle.life <= 0) {
          juiceParticles.splice(index, 1);
          continue;
        }
        particle.velocityY += 0.00045 * frameDelta;
        particle.x += particle.velocityX * frameDelta;
        particle.y += particle.velocityY * frameDelta;
        context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
        context.fillStyle = "#dc2626";
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
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

    resize(); createBoundaries();

    const render = (now: number) => {
      const frameDelta = Math.min(100, Math.max(0, now - previousFrameTime));
      previousFrameTime = now;
      if (!breakRef.current) eventTime += frameDelta;
      const eventNow = eventTime;
      engine.timing.timeScale = breakRef.current ? 0 : 1;
      const tomatoDiameter = CONFIG.world.tomatoDiameterMeters * CONFIG.world.pixelsPerMeter;
      const sessionTomatoCount = Math.max(0, totalCount.current - initialCountOffset);
      const estimatedPileHeight = tomatoDiameter * Math.sqrt(sessionTomatoCount * CONFIG.world.pilePackingFactor);
      const measuredPileHeight = Number.isFinite(settledPileTop) ? Math.max(0, height - settledPileTop) : 0;
      const overheadClearance = Math.max(160, height * 0.2);
      const requiredWorldHeight = Math.max(
        height,
        estimatedPileHeight * CONFIG.world.cameraPadding + overheadClearance,
        measuredPileHeight * CONFIG.world.cameraPadding + overheadClearance,
      );
      // 下限を設けない。山が高くなるほど0へ向かって後退し続ける。
      targetScale.current = Math.min(
        CONFIG.world.initialCameraScale,
        height / requiredWorldHeight,
      );
      currentScale.current += (targetScale.current - currentScale.current) * 0.05;
      if (Math.abs(targetScale.current - currentScale.current) < 0.0001) currentScale.current = targetScale.current;
      const bounds = getBounds(currentScale.current);
      camera.current = bounds;
      syncBoundaries(bounds);
      renderFrameCount += 1;
      if (renderFrameCount % OFFSCREEN_CULL_INTERVAL === 0 && tomatoBodies.length) {
        const visibleWidth = bounds.right - bounds.left;
        const visibleHeight = bounds.bottom - bounds.top;
        const escapedBodies = tomatoBodies.filter((body) =>
          body.bounds.min.y > bounds.bottom + visibleHeight
          || body.bounds.max.x < bounds.left - visibleWidth
          || body.bounds.min.x > bounds.right + visibleWidth,
        );
        escapedBodies.forEach(removeTomatoBody);
      }
      context.clearRect(0, 0, width, height);
      if (breakRef.current) {
        context.fillStyle = "#fafafa";
        context.fillRect(0, 0, width, height);
      }

      context.save();
      context.translate(width / 2, height);
      context.scale(currentScale.current, currentScale.current);
      context.translate(-width / 2, -height);
      tomatoBodies.forEach((body) => drawTomatoBody(body));
      for (let index = birdDeliveries.length - 1; index >= 0; index--) {
        const delivery = birdDeliveries[index];
        const progress = Math.min(1, (eventNow - delivery.startedAt) / delivery.duration);
        const routeMargin = 70 / currentScale.current;
        const fromX = delivery.direction === 1 ? bounds.left - routeMargin : bounds.right + routeMargin;
        const toX = delivery.direction === 1 ? bounds.right + routeMargin : bounds.left - routeMargin;
        const x = fromX + (toX - fromX) * progress;
        // Convert the measured toolbar-safe screen position into current world coordinates.
        const carrierYRatio = delivery.vehicle === "satellite"
          ? delivery.satelliteStartYRatio
            + (delivery.satelliteEndYRatio - delivery.satelliteStartYRatio) * progress
          : 0.25;
        const y = bounds.top + (height * carrierYRatio) / currentScale.current;
        const birdSize = 24 / currentScale.current;
        if (!breakRef.current && !delivery.released && progress >= delivery.releaseAt) {
          delivery.released = true;
          const dropCount = activeBuffsRef.current.doubleDrop ? 2 : 1;
          for (let dropIndex = 0; dropIndex < dropCount; dropIndex++) {
            const dropOffset = (dropIndex - (dropCount - 1) / 2) * delivery.radius * 0.8;
            createTomato(
              delivery.golden,
              false,
              { x: x + dropOffset, y: y + dropAnchorOffset + delivery.radius },
              delivery.radius,
              delivery.isSquishy,
            );
            if (delivery.golden) goldenDropRef.current();
            if (dropIndex > 0) bonusTomatoRef.current(delivery.golden);
          }
        }
        if (delivery.vehicle === "satellite") {
          if (ufoNow >= delivery.nextRadioAt) {
            delivery.radioPulseStartedAt = ufoNow - delivery.startedAt;
            delivery.nextRadioAt = ufoNow + 2_000 + Math.random() * 3_000;
          }
          drawSatellite(
            x,
            y,
            carrierSize,
            delivery.direction,
            ufoNow - delivery.startedAt,
            delivery.duration * delivery.releaseAt,
            delivery.initialRotation,
            delivery.radioPulseStartedAt,
          );
          if (!delivery.released) {
            drawTomato(
              context,
              x,
              y + dropAnchorOffset + delivery.radius,
              delivery.radius,
              delivery.golden,
              0,
              delivery.isSquishy,
            );
          }
        } else if (delivery.vehicle === "plane") {
          if (ufoNow >= delivery.nextContrailAt) {
            const particleScale = Math.max(currentScale.current, MIN_DYNAMIC_CAMERA_SCALE);
            const tailX = x - delivery.direction * birdSize * 1.42;
            const tailY = y + birdSize * 0.22;
            const particleLife = 1_700 + Math.random() * 700;
            contrailParticles.push({
              x: tailX - delivery.direction * Math.random() * 5 / particleScale,
              y: tailY + (Math.random() - 0.5) * 4 / particleScale,
              radius: (2 + Math.random() * 2) / particleScale,
              alpha: 0.20 + Math.random() * 0.10,
              life: particleLife,
              maxLife: particleLife,
            });
            delivery.nextContrailAt = ufoNow + 70 + Math.random() * 35;
          }
          drawPlane(
            x,
            y,
            birdSize,
            delivery.direction,
            !delivery.released,
            delivery.golden,
            delivery.isSquishy,
            delivery.radius,
          );
        } else {
          drawBird(
            x,
            y,
            birdSize,
            delivery.direction,
            !delivery.released,
            delivery.golden,
            delivery.isSquishy,
            delivery.radius,
            ufoNow,
          );
        }
        drawBird(
          x,
          y,
          birdSize,
          delivery.direction,
          !delivery.released,
          delivery.golden,
          delivery.radius,
          eventNow,
        );
        if (progress >= 1) birdDeliveries.splice(index, 1);
      }
      if (!pageHidden
        && !debugUfoModeRef.current
        && !octopusEvent
        && isFocusRunningRef.current
        && currentAltitude >= SPACE_EVENT_ALTITUDE
        && ufoNow >= nextRocketCheckAt) {
        nextRocketCheckAt = ufoNow + (
          currentAltitude >= ALIEN_EVENT_ALTITUDE
            ? HIGH_ALTITUDE_EVENT_INTERVAL_MS
            : LOW_ALTITUDE_EVENT_INTERVAL_MS
        );
        const rocketActive = balloonEvents.some((event) => event.vehicle === "rocket");
        const rocketChance = activeBuffsRef.current.balloonBoost
          ? ROCKET_APPEARANCE_CHANCE * 2
          : ROCKET_APPEARANCE_CHANCE;
        if (!rocketActive && Math.random() < rocketChance) {
          const startedAt = ufoNow;
          balloonEvents.push({
            startedAt,
            duration: 13_000 + Math.random() * 2_000,
            direction: Math.random() < 0.5 ? 1 : -1,
            initialGolden: Math.random() < getGoldenChance(),
            initialDropPending: true,
            enteredViewport: false,
            nextDropAt: startedAt,
            vehicle: "rocket",
          });
        }
      }
      for (let index = balloonEvents.length - 1; index >= 0; index--) {
        const balloon = balloonEvents[index];
        const progress = Math.min(1, (eventNow - balloon.startedAt) / balloon.duration);
        const routeMargin = 100 / currentScale.current;
        const fromX = balloon.direction === 1 ? bounds.left - routeMargin : bounds.right + routeMargin;
        const toX = balloon.direction === 1 ? bounds.right + routeMargin : bounds.left - routeMargin;
        const x = fromX + (toX - fromX) * progress;
        // Keep the balloon in a toolbar-safe lane close to the top of the viewport.
        const balloonScreenY = Math.max(flightScreenY + 48, height * 0.14);
        const windBob = Math.sin(eventNow * 0.002) * 14;
        const y = bounds.top + (balloonScreenY + windBob) / currentScale.current;
        const balloonSize = 42 / currentScale.current;

        const dropMargin = (bounds.right - bounds.left) * 0.2;
        const dropAreaLeft = bounds.left + dropMargin;
        const dropAreaRight = bounds.right - dropMargin;
        const insideDropArea = x >= dropAreaLeft && x <= dropAreaRight;
        if (insideDropArea && !balloon.enteredViewport) {
          balloon.enteredViewport = true;
          balloon.nextDropAt = eventNow;
        }
        while (!breakRef.current && insideViewport && eventNow >= balloon.nextDropAt) {
          const wasInitialDrop = balloon.initialDropPending;
          const spec = balloon.vehicle === "rocket"
            ? createMediumTomatoSpec(wasInitialDrop ? balloon.initialGolden : undefined)
            : createTomatoSpec(wasInitialDrop ? balloon.initialGolden : undefined);
          const sourceX = balloon.vehicle === "rocket"
            ? x - balloon.direction * balloonSize * 1.05
            : x;
          const dropX = Math.min(dropAreaRight, Math.max(dropAreaLeft, sourceX));
          const dropCount = activeBuffsRef.current.doubleDrop ? 2 : 1;
          for (let dropIndex = 0; dropIndex < dropCount; dropIndex++) {
            const dropOffset = (dropIndex - (dropCount - 1) / 2) * spec.radius * 0.8;
            createTomato(
              spec.golden,
              false,
              {
                x: Math.min(dropAreaRight, Math.max(dropAreaLeft, dropX + dropOffset)),
                y: y + (balloon.vehicle === "rocket" ? balloonSize * 0.2 : balloonSize * 1.35) + spec.radius,
              },
              spec.radius,
              spec.isSquishy,
            );
            if (spec.golden) goldenDropRef.current();
            if (!wasInitialDrop || dropIndex > 0) bonusTomatoRef.current(spec.golden);
          }
          balloon.initialDropPending = false;
          balloon.nextDropAt += 750;
        }

        if (balloon.vehicle === "rocket") {
          drawRocket(x, y, balloonSize, balloon.direction, ufoNow);
        } else {
          drawBalloon(x, y, balloonSize, balloon.direction);
        }
        if (progress >= 1) balloonEvents.splice(index, 1);
      }

      if (!breakRef.current && eventNow >= nextUfoCheckAt) {
        nextUfoCheckAt = eventNow + UFO_CHECK_INTERVAL_MS;
        const otherAirEventActive = birdDeliveries.length > 0 || balloonEvents.length > 0;
        if (ufoUnlockedRef.current && ufoEvents.length === 0 && !otherAirEventActive && Math.random() < UFO_APPEARANCE_CHANCE) {
          const entryDuration = 2200;
          const startedAt = eventNow;
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
        const elapsed = eventNow - ufo.startedAt;
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
        const floatY = Math.sin(eventNow * 0.0015) * 12;
        const y = bounds.top + (ufoScreenY + floatY) / currentScale.current;
        const ufoSize = 50 / currentScale.current;

        while (!breakRef.current && elapsed >= hoverStart && elapsed < hoverEnd && eventNow >= ufo.nextDropAt) {
          const spec: TomatoSpec = {
            golden: Math.random() < CONFIG.goldenChance,
            radius: (20 + Math.random() * 5) * (2.5 + Math.random() * 0.5),
          };
          createTomato(spec.golden, false, { x, y: y + ufoSize * 0.65 + spec.radius }, spec.radius);
          bonusTomatoRef.current(spec.golden);
          if (spec.golden) goldenDropRef.current();
          ufo.nextDropAt += 1400;
        }

        drawUfo(x, y, ufoSize);
        if (elapsed >= eventEnd) ufoEvents.splice(index, 1);
      }
      context.restore();
      if (!disposed) frame = requestAnimationFrame(safeRender);
    };

    const safeRender = (now: number) => {
      if (disposed || !canvasRef.current || !containerRef.current) return;
      try {
        render(now);
      } catch {
        try {
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        } catch {
          return;
        }
        if (!disposed) frame = requestAnimationFrame(safeRender);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    if (toolbar) observer.observe(toolbar);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    Runner.run(runner, engine); frame = requestAnimationFrame(safeRender);
    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      cancelAnimationFrame(frame); Runner.stop(runner); Engine.clear(engine);
      addRef.current = () => undefined;
      removeGoldenRef.current = () => 0;
      saveCameraStateRef.current = () => undefined;
    };
    // Counts are read only for initial restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  return <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full overflow-hidden"><canvas ref={canvasRef} className="block h-full w-full touch-none" /></div>;
});
