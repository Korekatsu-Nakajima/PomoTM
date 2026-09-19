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

export type { PhysicsCanvasHandle } from "@/types/game";

export const PhysicsCanvas = forwardRef<PhysicsCanvasHandle, PhysicsCanvasProps>(function PhysicsCanvas(
  {
    counts,
    hydrated,
    onBonusTomato,
    onGoldenTomatoDrop,
    activeBuffs,
    isUfoUnlocked,
    isOctopusUnlocked,
    debugUfoMode = false,
    isBonusBreakMode = false,
    timerMode,
    isTimerRunning,
    initialMaxAltitude = 0,
    onAltitudeChange,
  }, ref,
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
  const activeBuffsRef = useRef(activeBuffs);
  const isUfoUnlockedRef = useRef(isUfoUnlocked);
  const isOctopusUnlockedRef = useRef(isOctopusUnlocked);
  const debugUfoModeRef = useRef(debugUfoMode);
  const isBonusBreakModeRef = useRef(isBonusBreakMode);
  const isFocusRunningRef = useRef(timerMode === "focus" && isTimerRunning);
  const isSupplyRunningRef = useRef(timerMode === "focus" && isTimerRunning);
  const altitudeChangeRef = useRef(onAltitudeChange);
  const breakModeRef = useRef(timerMode === "break");
  const themeDirtyRef = useRef(false);
  activeBuffsRef.current = activeBuffs;
  isBonusBreakModeRef.current = isBonusBreakMode === true;
  breakModeRef.current = timerMode === "break";

  useImperativeHandle(ref, () => ({
    drop: (golden) => addRef.current(golden),
    removeGolden: (count) => removeGoldenRef.current(count),
  }), []);
  useEffect(() => { bonusTomatoRef.current = onBonusTomato; }, [onBonusTomato]);
  useEffect(() => { goldenDropRef.current = onGoldenTomatoDrop; }, [onGoldenTomatoDrop]);
  useEffect(() => { activeBuffsRef.current = activeBuffs; }, [activeBuffs]);
  useEffect(() => { isUfoUnlockedRef.current = isUfoUnlocked; }, [isUfoUnlocked]);
  useEffect(() => { isOctopusUnlockedRef.current = isOctopusUnlocked; }, [isOctopusUnlocked]);
  useEffect(() => { debugUfoModeRef.current = debugUfoMode; }, [debugUfoMode]);
  useEffect(() => { isBonusBreakModeRef.current = isBonusBreakMode; }, [isBonusBreakMode]);
  useEffect(() => { altitudeChangeRef.current = onAltitudeChange; }, [onAltitudeChange]);
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

    const { Engine, Bodies, Body, Composite } = Matter;
    const engine = Engine.create(PHYSICS_ENGINE_OPTIONS);
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 1, height = 1, frame = 0;
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
    const pendingSleeping = new Set<Matter.Body>();
    const staticCoreBodies = new Set<Matter.Body>();
    const lowerStaticBodies = new Set<Matter.Body>();
    const birdDeliveries: BirdDelivery[] = [];
    const balloonEvents: BalloonEvent[] = [];
    const ufoEvents: UfoEvent[] = [];
    let octopusEvent: OctopusEvent | null = null;
    const alienEvents: AlienEvent[] = [];
    const deferredDeliveries: boolean[] = [];
    const juiceParticles: JuiceParticle[] = [];
    const contrailParticles: ContrailParticle[] = [];
    const starClusterCenters = Array.from({ length: 7 }, () => ({
      x: Math.random(),
      y: Math.random(),
    }));
    const starParticles: StarParticle[] = Array.from({ length: 112 }, (_, index) => {
      const layer = (index % 3) as 0 | 1 | 2;
      const cluster = starClusterCenters[Math.floor(Math.random() * starClusterCenters.length)];
      const clustered = Math.random() < 0.72;
      const spread = 0.055 + Math.random() * 0.12;
      const normalizedX = clustered
        ? ((cluster.x + (Math.random() + Math.random() - 1) * spread) % 1 + 1) % 1
        : Math.random();
      const normalizedY = clustered
        ? ((cluster.y + (Math.random() + Math.random() - 1) * spread) % 1 + 1) % 1
        : Math.random();
      const layerRadius = layer === 0 ? [0.5, 1.15] : layer === 1 ? [0.8, 1.8] : [1.35, 2.5];
      return {
        normalizedX,
        normalizedY,
        radius: layerRadius[0] + Math.random() * (layerRadius[1] - layerRadius[0]),
        alpha: 0.42 + Math.random() * 0.48,
        twinkleSpeed: 0.00045 + Math.random() * 0.00135,
        phase: Math.random() * Math.PI * 2,
        layer,
        horizontalSpeed: 0.0015 + layer * 0.0012 + Math.random() * 0.0014,
      };
    });
    const ripeningBodies = new Set<Matter.Body>();
    const pressuredBodies = new Set<Matter.Body>();
    let ufoEventTime = performance.now();
    let windOffset = 0;
    let previousFrameTime = performance.now();
    let nextUfoCheckAt = ufoEventTime + LOW_ALTITUDE_EVENT_INTERVAL_MS;
    let nextOctopusCheckAt = ufoEventTime + OCTOPUS_CHECK_INTERVAL_MS;
    let nextRocketCheckAt = ufoEventTime + LOW_ALTITUDE_EVENT_INTERVAL_MS;
    let previousHighAltitudeEventBand = false;
    let previousRocketEligible = false;
    let nextAlienCheckAt = ufoEventTime + ALIEN_CHECK_INTERVAL_MS;
    let nextAuroraCheckAt = ufoEventTime + AURORA_CHECK_INTERVAL_MS;
    let auroraEvent: AuroraEvent | null = null;
    let nextShootingStarCheckAt = ufoEventTime + SHOOTING_STAR_CHECK_INTERVAL_MS;
    let shootingStarEvent: ShootingStarEvent | null = null;
    let pageHidden = document.hidden;
    let previousDebugUfoMode = debugUfoModeRef.current;
    let coreEvaluationFrame = 0;
    let terrainEvaluationFrame = 0;
    let archivedHighestPoint = Number.POSITIVE_INFINITY;
    let terrainBody: Matter.Body | null = null;
    let terrainLeft = 0;
    let terrainBinWidth = 1;
    let terrainInitialized = false;
    const terrainTopByBin = Array<number>(TERRAIN_SEGMENT_COUNT).fill(Number.POSITIVE_INFINITY);
    let cachedSleeping = new Set<Matter.Body>();
    let sleepingCacheDirty = true;
    let forceCacheRefresh = false;
    let lastCacheRefresh = 0;
    let cacheScale = 1;
    let cacheOffsetY = 0;
    let lastReportedAltitude = -1;
    let currentAltitude = Math.max(0, initialMaxAltitude);
    let cameraScaleLocked = false;
    let lastPhysicsPhase = "initialization";
    let diagnosticAlert: PhysicsDiagnosticAlert | null = null;
    const diagnosticLogTimes = new Map<string, number>();
    const sleepingCanvas = document.createElement("canvas");
    const sleepingContext = sleepingCanvas.getContext("2d");
    const backgroundCanvas = document.createElement("canvas");
    const backgroundContext = backgroundCanvas.getContext("2d");
    const backgroundWorld = { left: 0, top: 0, width: 1, height: 1 };
    const archivedCanvas = document.createElement("canvas");
    const archivedContext = archivedCanvas.getContext("2d");
    const archivedWorld = { left: 0, top: 0, width: 1, height: 1 };
    let archivedCanvasReady = false;
    let imageReady = false;
    const image = new Image();
    if (CONFIG.tomatoImageUrl) {
      image.onload = () => { imageReady = true; };
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
      const nextWallHeight = height - bounds.top + 80;
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
      if (cloudFloorEnabled && floor) createCloudFloor(getBounds(currentScale.current));
      buildBackgroundCanvas();
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
        label: "tomato",
        plugin: {
          tomato: {
            golden,
            radius,
            createdAt: performance.now(),
            hasSettled: settled,
            isSquishy,
            hasBurst: false,
            pressureFrames: 0,
            pressureLoad: 0,
            ripeness: isSquishy ? 1 : 0,
            invincibleUntil: 0,
            isDud: false,
            isInfected: false,
            burstAt: 0,
            baseRestitution: restitution,
            baseFriction: friction,
          },
        },
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
      Composite.add(engine.world, body);
      activeBodies.add(body);
      Matter.Events.on(body, "sleepStart", () => {
        const tomato = body.plugin.tomato as TomatoBodyData;
        tomato.hasSettled = true;
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
      return body;
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
      const sizeScale = 0.92 + Math.random() * 0.16;
      if (sizeRoll < 0.01) return baseRadius * (0.3 + Math.random() * 0.1) * sizeScale;
      if (sizeRoll < 0.01 + giantChance) return baseRadius * (2.5 + Math.random() * 0.5) * sizeScale;
      return baseRadius * sizeScale;
    };

    const isBonusBreakActive = () => (
      isBonusBreakModeRef.current === true && breakModeRef.current === true
    );

    const getGoldenChance = () => {
      const baseChance = isBonusBreakActive()
        ? BONUS_BREAK_GOLDEN_CHANCE
        : SUPPLY_GOLDEN_CHANCE;
      return activeBuffsRef.current.goldBoost ? baseChance * 2 : baseChance;
    };

    const createTomatoSpec = (golden?: boolean): TomatoSpec => {
      const bonusBreakActive = isBonusBreakActive();
      const goldenChance = getGoldenChance();
      const isGolden = golden ?? Math.random() < goldenChance;
      return {
        golden: isGolden,
        radius: createRadius(bonusBreakActive ? BONUS_BREAK_GIANT_CHANCE : SUPPLY_GIANT_CHANCE),
        isSquishy: !isGolden && Math.random() < 0.04,
      };
    };

    const createMediumTomatoSpec = (golden?: boolean): TomatoSpec => {
      const goldenChance = getGoldenChance();
      const isGolden = golden ?? Math.random() < goldenChance;
      return {
        golden: isGolden,
        radius: (20 + Math.random() * 5) * 1.4 * (0.92 + Math.random() * 0.16),
        isSquishy: !isGolden && Math.random() < 0.04,
      };
    };

    const createInvincibilityDuration = () => {
      const durationPattern = Math.random();
      if (durationPattern < 0.50) return 10_000 + Math.random() * 20_000;
      if (durationPattern < 0.75) return 30_000 + Math.random() * 30_000;
      const tenSecondStep = Math.floor(Math.random() * 24);
      return (60 + tenSecondStep * 10) * 1_000;
    };

    const infectNearbyTomatoes = (source: Matter.Body, sourceRadius: number) => {
      const infectionRadius = sourceRadius * 2;
      const candidates = new Set([...activeBodies, ...sleepingBodies, ...staticCoreBodies]);
      for (const candidate of candidates) {
        if (candidate === source || candidate.label !== "tomato") continue;
        const tomato = candidate.plugin.tomato as TomatoBodyData;
        if (tomato.golden || tomato.isSquishy || tomato.hasBurst) continue;
        const distance = Math.hypot(
          candidate.position.x - source.position.x,
          candidate.position.y - source.position.y,
        );
        if (distance > infectionRadius || Math.random() >= 0.10) continue;
        tomato.isSquishy = true;
        tomato.isInfected = true;
        tomato.ripeness = 0;
        tomato.isDud = Math.random() < 0.01;
        const burstAt = Date.now() + createInvincibilityDuration();
        tomato.invincibleUntil = tomato.isDud ? 0 : burstAt;
        tomato.burstAt = burstAt;
        ripeningBodies.add(candidate);
        if (cachedSleeping.has(candidate)) {
          sleepingCacheDirty = true;
          forceCacheRefresh = true;
        }
      }
    };

    const wakeNearbyTomatoes = (source: Matter.Body, sourceRadius: number) => {
      const wakeRadius = sourceRadius * 3;
      const staticRestoreRadius = 125;
      const candidates = new Set([...activeBodies, ...sleepingBodies, ...staticCoreBodies]);
      for (const neighbor of candidates) {
        if ((neighbor === source && !staticCoreBodies.has(neighbor)) || neighbor.label !== "tomato") continue;
        const deltaX = neighbor.position.x - source.position.x;
        const deltaY = neighbor.position.y - source.position.y;
        const distance = Math.hypot(deltaX, deltaY);
        const restoreStaticCore = staticCoreBodies.has(neighbor) && distance <= staticRestoreRadius;
        if (restoreStaticCore) {
          Body.setStatic(neighbor, false);
          staticCoreBodies.delete(neighbor);
          lowerStaticBodies.delete(neighbor);
          sleepingBodies.delete(neighbor);
          pendingSleeping.delete(neighbor);
          activeBodies.add(neighbor);
        }
        if (distance > wakeRadius && !restoreStaticCore) continue;
        Matter.Sleeping.set(neighbor, false);
        if (cachedSleeping.delete(neighbor)) {
          sleepingCacheDirty = true;
          forceCacheRefresh = true;
        }
      }
    };

    const reportPhysicsDiagnostic = (
      reason: string,
      detail: string,
      body?: Matter.Body,
      phase = lastPhysicsPhase,
    ) => {
      const timestamp = performance.now();
      const diagnosticKey = `${reason}:${body?.id ?? "world"}`;
      const previousLogTime = diagnosticLogTimes.get(diagnosticKey) ?? Number.NEGATIVE_INFINITY;
      if (timestamp - previousLogTime < 2_000) return;
      diagnosticLogTimes.set(diagnosticKey, timestamp);
      const tomato = body?.label === "tomato"
        ? body.plugin?.tomato as TomatoBodyData | undefined
        : undefined;
      const worldBodies = [...Composite.allBodies(engine.world)];
      const tomatoBodies = worldBodies.filter((candidate) => candidate.label === "tomato");
      const bodyDetail = body ? {
        id: body.id,
        label: body.label,
        type: getTomatoDiagnosticType(body, tomato),
        position: { x: body.position.x, y: body.position.y },
        velocity: { x: body.velocity.x, y: body.velocity.y },
        mass: body.mass,
        isStatic: body.isStatic,
        isSleeping: body.isSleeping,
        isSquishy: tomato?.isSquishy ?? false,
        pressureLoad: tomato?.pressureLoad ?? 0,
        invincibleUntil: tomato?.invincibleUntil ?? 0,
        isDud: tomato?.isDud ?? false,
      } : null;
      const snapshot = tomatoBodies.map((candidate) => {
        const candidateTomato = candidate.plugin?.tomato as TomatoBodyData | undefined;
        const isSquishy = Boolean(candidateTomato && candidateTomato.isSquishy);
        const pressureLoad = candidateTomato
          && typeof candidateTomato.pressureLoad === "number"
          && Number.isFinite(candidateTomato.pressureLoad)
          ? candidateTomato.pressureLoad
          : 0;
        const invincibleUntil = candidateTomato
          && typeof candidateTomato.invincibleUntil === "number"
          && Number.isFinite(candidateTomato.invincibleUntil)
          ? candidateTomato.invincibleUntil
          : 0;
        const isDud = Boolean(candidateTomato && candidateTomato.isDud);
        return {
          id: candidate.id,
          type: getTomatoDiagnosticType(candidate, candidateTomato),
          x: candidate.position.x,
          y: candidate.position.y,
          vx: candidate.velocity.x,
          vy: candidate.velocity.y,
          mass: candidate.mass,
          isSleeping: candidate.isSleeping,
          isStatic: candidate.isStatic,
          isSquishy,
          pressureLoad,
          invincibleUntil,
          isDud,
        };
      });
      diagnosticAlert = { title: reason, detail, phase, timestamp };
      console.error("[PhysicsDiagnostic]", {
        reason,
        detail,
        phase,
        body: bodyDetail,
        counts: {
          worldBodies: worldBodies.length,
          tomatoes: tomatoBodies.length,
          active: activeBodies.size,
          sleeping: sleepingBodies.size,
          staticCore: staticCoreBodies.size,
        },
        camera: {
          scale: currentScale.current,
          offsetY: currentOffsetY.current,
          bounds: camera.current,
          altitude: currentAltitude,
        },
        tomatoes: snapshot,
      });
    };

    const drawPhysicsDiagnosticOverlay = () => {
      if (!diagnosticAlert) return;
      const lines = [
        "PHYSICS ANOMALY DETECTED",
        diagnosticAlert.title,
        diagnosticAlert.detail,
        `phase: ${diagnosticAlert.phase}`,
        `time: ${(diagnosticAlert.timestamp / 1_000).toFixed(3)}s`,
      ];
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
      const boxWidth = Math.min(
        Math.max(300, ...lines.map((line) => context.measureText(line).width + 24)),
        Math.max(300, width - 24),
      );
      const boxHeight = lines.length * 18 + 20;
      context.fillStyle = "rgba(24, 0, 0, 0.88)";
      context.fillRect(12, 76, boxWidth, boxHeight);
      context.strokeStyle = "rgba(248, 113, 113, 0.95)";
      context.lineWidth = 2;
      context.strokeRect(12, 76, boxWidth, boxHeight);
      context.fillStyle = "#fecaca";
      lines.forEach((line, index) => {
        const visibleLine = line.length > 100 ? `${line.slice(0, 97)}...` : line;
        context.fillText(visibleLine, 24, 98 + index * 18, boxWidth - 24);
      });
      context.restore();
    };

    const burstTomato = (body: Matter.Body) => {
      if (body.label !== "tomato") return;
      const tomato = body.plugin.tomato as TomatoBodyData;
      if (!tomato.isSquishy || tomato.hasBurst) return;
      const safeInvincibleUntil = Number.isFinite(tomato.invincibleUntil)
        ? Math.max(0, tomato.invincibleUntil)
        : 0;
      tomato.invincibleUntil = safeInvincibleUntil;
      if (Date.now() < safeInvincibleUntil) return;
      lastPhysicsPhase = "squishy explosion";
      tomato.hasBurst = true;
      const particleCount = 5 + Math.floor(Math.random() * 6);
      for (let index = 0; index < particleCount; index++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.06 + Math.random() * 0.14;
        const life = 550 + Math.random() * 450;
        juiceParticles.push({
          x: body.position.x,
          y: body.position.y,
          velocityX: Math.cos(angle) * speed,
          velocityY: Math.sin(angle) * speed - 0.08,
          radius: Math.max(2, tomato.radius * (0.08 + Math.random() * 0.08)),
          life,
          maxLife: life,
        });
      }
      if (!tomato.isInfected) wakeNearbyTomatoes(body, tomato.radius);
      infectNearbyTomatoes(body, tomato.radius);
      Composite.remove(engine.world, body);
      Matter.Events.off(body, "sleepStart");
      Matter.Events.off(body, "sleepEnd");
      activeBodies.delete(body);
      sleepingBodies.delete(body);
      pendingSleeping.delete(body);
      staticCoreBodies.delete(body);
      lowerStaticBodies.delete(body);
      ripeningBodies.delete(body);
      pressuredBodies.delete(body);
      if (cachedSleeping.delete(body)) {
        sleepingCacheDirty = true;
        forceCacheRefresh = true;
      }
    };

    const evaluateCollisionStart = (event: Matter.IEventCollision<Matter.Engine>) => {
      lastPhysicsPhase = "collisionStart";
      for (const pair of event.pairs) {
        correctDeepTomatoOverlap(pair.bodyA, pair.bodyB);
        const calculatedRelativeSpeed = Math.hypot(
          pair.bodyA.velocity.x - pair.bodyB.velocity.x,
          pair.bodyA.velocity.y - pair.bodyB.velocity.y,
        );
        const relativeSpeed = Number.isFinite(calculatedRelativeSpeed) ? calculatedRelativeSpeed : 0;
        if (relativeSpeed >= 6) {
          if (pair.bodyA.label === "tomato") {
            const tomato = pair.bodyA.plugin.tomato as TomatoBodyData;
            wakeNearbyTomatoes(pair.bodyA, tomato.radius);
          }
          if (pair.bodyB.label === "tomato") {
            const tomato = pair.bodyB.plugin.tomato as TomatoBodyData;
            wakeNearbyTomatoes(pair.bodyB, tomato.radius);
          }
        }
        const pressureCandidates: Array<[Matter.Body, Matter.Body]> = [
          [pair.bodyA, pair.bodyB],
          [pair.bodyB, pair.bodyA],
        ];
        for (const [body, other] of pressureCandidates) {
          if (body.label !== "tomato") continue;
          const tomato = body.plugin.tomato as TomatoBodyData;
          if (!tomato.isSquishy || tomato.hasBurst) continue;
          const safePressure = Number.isFinite(tomato.pressureLoad) ? Math.max(0, tomato.pressureLoad) : 0;
          tomato.pressureLoad = safePressure;
          const safeInvincibleUntil = Number.isFinite(tomato.invincibleUntil)
            ? Math.max(0, tomato.invincibleUntil)
            : 0;
          tomato.invincibleUntil = safeInvincibleUntil;
          if (other.position.y < body.position.y - tomato.radius * 0.15) {
            const safeOtherMass = Number.isFinite(other.mass) ? Math.max(0, other.mass) : 0;
            tomato.pressureLoad = Math.min(250, Math.max(safePressure, safeOtherMass));
            tomato.pressureFrames = Number.isFinite(tomato.pressureFrames)
              ? tomato.pressureFrames + 1
              : 1;
            pressuredBodies.add(body);
          }
          if (Date.now() < safeInvincibleUntil) continue;
          const radiusRatio = Number.isFinite(tomato.radius) && tomato.radius > 0
            ? tomato.radius / 22.5
            : 1;
          const normalDurability = tomato.golden ? 60 : radiusRatio >= 2 ? 40 : radiusRatio >= 1.2 ? 12 : 4;
          const baseDurability = normalDurability * (tomato.isDud ? 100 : 1);
          const calculatedDurability = baseDurability - tomato.pressureLoad * 0.6;
          const effectiveDurability = Math.max(
            1,
            Number.isFinite(calculatedDurability) ? calculatedDurability : baseDurability,
          );
          const safeOtherMass = Number.isFinite(other.mass) ? Math.max(0, other.mass) : 0;
          const calculatedImpactForce = safeOtherMass * relativeSpeed;
          const impactForce = Number.isFinite(calculatedImpactForce) ? calculatedImpactForce : 0;
          const crushedByWeight = tomato.pressureLoad >= baseDurability * 2.5;
          if (impactForce >= effectiveDurability || crushedByWeight) burstTomato(body);
        }
      }
    };

    const handleStrongImpact = (event: Matter.IEventCollision<Matter.Engine>) => evaluateCollisionStart(event);

    const removeInvalidBody = (body: Matter.Body) => {
      Composite.remove(engine.world, body);
      if (body.label === "tomato") {
        Matter.Events.off(body, "sleepStart");
        Matter.Events.off(body, "sleepEnd");
        activeBodies.delete(body);
        sleepingBodies.delete(body);
        pendingSleeping.delete(body);
        staticCoreBodies.delete(body);
        lowerStaticBodies.delete(body);
        ripeningBodies.delete(body);
        pressuredBodies.delete(body);
        if (cachedSleeping.delete(body)) {
          sleepingCacheDirty = true;
          forceCacheRefresh = true;
        }
      }
      if (body === terrainBody) terrainBody = null;
    };

    const stabilizeLowerPileBeforeUpdate = () => {
      const visibleBounds = camera.current;
      const visibleWidth = Math.max(1, visibleBounds.right - visibleBounds.left);
      const visibleHeight = Math.max(1, visibleBounds.bottom - visibleBounds.top);
      const centralCoreLeft = visibleBounds.left + visibleWidth * 0.25;
      const centralCoreRight = visibleBounds.left + visibleWidth * 0.75;
      const lowerPressureZoneY = visibleBounds.top + visibleHeight * 0.68;
      const offscreenStaticY = visibleBounds.bottom + 300 / Math.max(currentScale.current, MIN_DYNAMIC_CAMERA_SCALE);
      const buriedDepthY = Number.isFinite(settledPileTop)
        ? settledPileTop + DEEP_CORE_INSET
        : Number.POSITIVE_INFINITY;
      const candidates = new Set([...activeBodies, ...sleepingBodies]);
      let cacheChanged = false;

      for (const body of candidates) {
        if (body.label !== "tomato") continue;
        const tomato = body.plugin.tomato as TomatoBodyData | undefined;
        if (!tomato) continue;
        if (cloudFloorEnabled && body.position.y > cloudFloorCleanupY) {
          removeInvalidBody(body);
          continue;
        }
        const insideCentralCore = body.position.x >= centralCoreLeft && body.position.x <= centralCoreRight;
        const inSideShell = !insideCentralCore;
        const inLowerPressureZone = body.position.y >= lowerPressureZoneY;
        const deeplyBuried = inLowerPressureZone && body.position.y >= buriedDepthY;
        const belowViewportMargin = !cloudFloorEnabled && body.position.y >= offscreenStaticY;

        if (body.isStatic && inSideShell && !belowViewportMargin && staticCoreBodies.has(body)) {
          Body.setStatic(body, false);
          Matter.Sleeping.set(body, false);
          staticCoreBodies.delete(body);
          lowerStaticBodies.delete(body);
          sleepingBodies.delete(body);
          pendingSleeping.delete(body);
          activeBodies.add(body);
          cacheChanged = true;
        }

        if (!body.isStatic) {
          body.restitution = inSideShell
            ? 0.075
            : inLowerPressureZone ? 0 : tomato.baseRestitution;
          body.friction = inSideShell
            ? 0.3
            : inLowerPressureZone ? 0.9 : tomato.baseFriction;
        }

        const stationaryDeepBody = insideCentralCore
          && deeplyBuried
          && (body.isSleeping || body.speed < 0.08);
        if (!body.isStatic && (belowViewportMargin || stationaryDeepBody)) {
          Body.setVelocity(body, { x: 0, y: 0 });
          Body.setAngularVelocity(body, 0);
          Matter.Sleeping.set(body, true);
          Body.setStatic(body, true);
          activeBodies.delete(body);
          pendingSleeping.add(body);
          sleepingBodies.add(body);
          staticCoreBodies.add(body);
          lowerStaticBodies.add(body);
          if (cachedSleeping.delete(body)) cacheChanged = true;
          cacheChanged = true;
          continue;
        }

        if (!body.isStatic
          && insideCentralCore
          && inLowerPressureZone
          && body.speed < 0.15
          && !body.isSleeping) {
          Matter.Sleeping.set(body, true);
        }
      }

      if (cacheChanged) {
        sleepingCacheDirty = true;
        forceCacheRefresh = true;
      }
    };

    const handleBeforeUpdate = () => {
      lastPhysicsPhase = "beforeUpdate lower-pile stabilization";
      sanitizeWorldBodies([...Composite.allBodies(engine.world)], {
        reportPhysicsDiagnostic,
        removeInvalidBody,
      });
      stabilizeLowerPileBeforeUpdate();
    };

    const handleAfterUpdate = () => {
      lastPhysicsPhase = "afterUpdate";
      sanitizeWorldBodies([...Composite.allBodies(engine.world)], {
        reportPhysicsDiagnostic,
        removeInvalidBody,
      });
    };

    Matter.Events.on(engine, "collisionStart", handleStrongImpact);
    Matter.Events.on(engine, "beforeUpdate", handleBeforeUpdate);
    Matter.Events.on(engine, "afterUpdate", handleAfterUpdate);

    const startDelivery = (golden = false) => {
      if (pageHidden) return;
      if (debugUfoModeRef.current) return;
      const useSpaceVehicles = currentAltitude >= SPACE_EVENT_ALTITUDE;
      const useSatellite = currentAltitude >= ALIEN_EVENT_ALTITUDE;
      const balloonChance = activeBuffsRef.current.balloonBoost ? 0.02 : 0.01;
      if (!useSpaceVehicles && Math.random() < balloonChance) {
        const startedAt = ufoEventTime;
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
        startedAt,
        duration: useSatellite ? 9_500 + Math.random() * 1_000 : 2200 + Math.random() * 600,
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
        lowerStaticBodies.delete(body);
        ripeningBodies.delete(body);
        pressuredBodies.delete(body);
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
      const restorableBodies = [...staticCoreBodies].filter((body) => !lowerStaticBodies.has(body));
      restorableBodies.forEach((body) => {
        Body.setStatic(body, false);
        Matter.Sleeping.set(body, false);
        sleepingBodies.delete(body);
        pendingSleeping.delete(body);
        activeBodies.add(body);
        staticCoreBodies.delete(body);
      });
      if (!restorableBodies.length) return;
      sleepingCacheDirty = true;
      forceCacheRefresh = true;
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

    const drawCloudFloor = () => {
      if (!cloudFloorBody || cloudFloorParts.length === 0) return;
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

    const updateAndDrawContrailParticles = (frameDelta: number) => {
      for (let index = contrailParticles.length - 1; index >= 0; index--) {
        const particle = contrailParticles[index];
        particle.life -= frameDelta;
        particle.alpha = Math.max(0, particle.alpha - frameDelta / particle.maxLife * 0.28);
        if (particle.life <= 0 || particle.alpha <= 0) {
          contrailParticles.splice(index, 1);
          continue;
        }
        particle.radius += frameDelta * 0.0035 / Math.max(currentScale.current, MIN_DYNAMIC_CAMERA_SCALE);
        context.fillStyle = `rgba(255, 255, 255, ${particle.alpha})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
    };

    const rebuildTerrainBody = () => {
      const terrainBottom = height + 40;
      const parts = createTerrainSegmentParts({
        terrainTopByBin,
        terrainBottom,
        terrainLeft,
        terrainBinWidth,
      });
      if (!parts.length) return;
      const nextTerrainBody = Body.create({ parts, isStatic: true, label: "archived-terrain" });
      Composite.add(engine.world, nextTerrainBody);
      if (terrainBody) Composite.remove(engine.world, terrainBody);
      terrainBody = nextTerrainBody;
    };

    const absorbOffscreenTerrain = (now: number, bounds: CameraBounds) => {
      if (!archivedContext || !archivedCanvasReady) return;
      const groundY = height;
      const absoluteCleanupY = groundY + Math.max(2_000, TERRAIN_VIEWPORT_MARGIN);
      const candidates = [...sleepingBodies, ...activeBodies].filter((body) => {
        return Number.isFinite(body.position.y) && body.position.y > absoluteCleanupY;
      });
      if (!candidates.length) return;
      lastPhysicsPhase = "out of bounds check";

      if (!terrainInitialized) {
        const terrainWidth = width / MIN_DYNAMIC_CAMERA_SCALE;
        terrainLeft = width / 2 - terrainWidth / 2;
        terrainBinWidth = terrainWidth / TERRAIN_SEGMENT_COUNT;
        terrainInitialized = true;
      }

      const absorbedBodies: Matter.Body[] = [];
      candidates.forEach((body) => {
        const firstBin = Math.max(0, Math.floor((body.bounds.min.x - terrainLeft) / terrainBinWidth));
        const lastBin = Math.min(
          TERRAIN_SEGMENT_COUNT - 1,
          Math.floor((body.bounds.max.x - terrainLeft) / terrainBinWidth),
        );
        if (firstBin > lastBin) return;
        drawTomatoBody(body, archivedContext);
        archivedHighestPoint = Math.min(archivedHighestPoint, body.bounds.min.y - 25);
        absorbedBodies.push(body);
        for (let bin = firstBin; bin <= lastBin; bin++) {
          terrainTopByBin[bin] = Math.min(terrainTopByBin[bin], body.bounds.min.y);
        }
      });

      if (!absorbedBodies.length) return;
      rebuildTerrainBody();
      let removedCachedBody = false;
      absorbedBodies.forEach((body) => {
        Composite.remove(engine.world, body);
        Matter.Events.off(body, "sleepStart");
        Matter.Events.off(body, "sleepEnd");
        activeBodies.delete(body);
        sleepingBodies.delete(body);
        pendingSleeping.delete(body);
        staticCoreBodies.delete(body);
        lowerStaticBodies.delete(body);
        ripeningBodies.delete(body);
        pressuredBodies.delete(body);
        if (cachedSleeping.delete(body)) removedCachedBody = true;
      });
      if (removedCachedBody) {
        sleepingCacheDirty = true;
        forceCacheRefresh = true;
      }
    };

    const {
      drawBird,
      drawPlane,
      drawBalloon,
      drawRocket,
      drawUfo,
      drawOctopus,
      drawAlien,
      drawSatellite,
    } = createCarrierRenderers(context, drawTomato, () => breakModeRef.current);

    function buildBackgroundCanvas() {
      if (!backgroundContext) return;
      const ppm = CONFIG.world.pixelsPerMeter;
      backgroundCanvas.width = 2048;
      backgroundCanvas.height = 4096;
      backgroundWorld.width = CONFIG.world.backgroundWidthMeters * ppm;
      backgroundWorld.height = CONFIG.world.backgroundHeightMeters * ppm;
      backgroundWorld.left = width / 2 - backgroundWorld.width / 2;
      backgroundWorld.top = height - backgroundWorld.height;
      if (!archivedCanvasReady && archivedContext) {
        archivedCanvas.width = 2048;
        archivedCanvas.height = 4096;
        archivedWorld.width = backgroundWorld.width;
        archivedWorld.height = backgroundWorld.height;
        archivedWorld.left = backgroundWorld.left;
        archivedWorld.top = backgroundWorld.top;
        const archivedScaleX = archivedCanvas.width / archivedWorld.width;
        const archivedScaleY = archivedCanvas.height / archivedWorld.height;
        archivedContext.setTransform(
          archivedScaleX,
          0,
          0,
          archivedScaleY,
          -archivedWorld.left * archivedScaleX,
          -archivedWorld.top * archivedScaleY,
        );
        archivedCanvasReady = true;
      }
      const sx = backgroundCanvas.width / backgroundWorld.width;
      const sy = backgroundCanvas.height / backgroundWorld.height;
      backgroundContext.setTransform(sx, 0, 0, sy, -backgroundWorld.left * sx, -backgroundWorld.top * sy);
      backgroundContext.clearRect(backgroundWorld.left, backgroundWorld.top, backgroundWorld.width, backgroundWorld.height);
    }

    const pisaTowerPaths = PISA_TOWER_SVG_PATHS.map((path) => new Path2D(path));
    const statueOfLibertyPaths = STATUE_OF_LIBERTY_SVG_PATHS.map((path) => new Path2D(path));

    const drawLandmarkSilhouettes = (_altitude: number, isBreak: boolean) => {
      const smallRadius = 22.5 * 0.35;
      const smallTomatoDiameter = smallRadius * 2;
      const pisaTargetHeight = smallTomatoDiameter * 200;
      const statueTargetHeight = smallTomatoDiameter * 500;
      const pisaScale = pisaTargetHeight / 64 * currentScale.current;
      const statueScale = statueTargetHeight / 64 * currentScale.current;
      const groundScreenY = height + currentOffsetY.current * currentScale.current;
      const landmarkMaskColor = getSkyColors(_altitude, isBreak).middle;
      const landmarkStroke = isBreak ? "rgb(30, 41, 59)" : "rgb(203, 213, 225)";

      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";

      context.save();
      context.translate(width * 0.72 - 32 * statueScale, groundScreenY - 52.8333 * statueScale);
      context.scale(statueScale, statueScale);
      context.globalAlpha = 1;
      context.fillStyle = landmarkMaskColor;
      statueOfLibertyPaths.forEach((path) => context.fill(path));
      context.globalAlpha = 0.18;
      context.strokeStyle = landmarkStroke;
      context.lineWidth = 1.1;
      statueOfLibertyPaths.forEach((path) => context.stroke(path));
      context.restore();

      context.save();
      context.translate(width * 0.28 - 32 * pisaScale, groundScreenY - 41.8065 * pisaScale);
      context.scale(pisaScale, pisaScale);
      context.globalAlpha = 1;
      context.fillStyle = landmarkMaskColor;
      pisaTowerPaths.forEach((path) => context.fill(path));
      context.globalAlpha = 0.18;
      context.strokeStyle = landmarkStroke;
      context.lineWidth = 1.35;
      pisaTowerPaths.forEach((path) => context.stroke(path));
      context.restore();

      context.restore();
    };

    const drawCloudLayer = (altitude: number, isBreak: boolean, now: number) => {
      const visibility = smoothStep(850, 1_100, altitude) * (1 - smoothStep(1_900, 2_150, altitude));
      if (visibility <= 0) return;
      context.save();
      context.globalAlpha = visibility * (isBreak ? 0.76 : 0.50);
      context.fillStyle = isBreak ? "rgba(255, 255, 255, 0.88)" : "rgba(148, 163, 184, 0.66)";
      context.shadowColor = isBreak ? "rgba(148, 163, 184, 0.24)" : "rgba(15, 23, 42, 0.34)";
      context.shadowBlur = 14;
      for (let cloud = 0; cloud < 8; cloud++) {
        const cloudWidth = 70 + cloud % 4 * 24;
        const travelWidth = width + cloudWidth * 3;
        const speed = 0.006 + cloud % 3 * 0.0025;
        const direction = cloud % 2 === 0 ? 1 : -1;
        const rawX = cloud * 173 + now * speed * direction;
        const cloudX = ((rawX % travelWidth) + travelWidth) % travelWidth - cloudWidth * 1.5;
        const cloudY = height * (0.15 + cloud % 4 * 0.18) + Math.sin(now * 0.00025 + cloud) * 12;
        const cloudHeight = cloudWidth * 0.28;
        context.beginPath();
        context.ellipse(cloudX - cloudWidth * 0.28, cloudY, cloudWidth * 0.38, cloudHeight * 0.72, 0, 0, Math.PI * 2);
        context.ellipse(cloudX, cloudY - cloudHeight * 0.28, cloudWidth * 0.46, cloudHeight, 0, 0, Math.PI * 2);
        context.ellipse(cloudX + cloudWidth * 0.34, cloudY, cloudWidth * 0.42, cloudHeight * 0.74, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    };

    const drawRainLayer = (altitude: number, isBreak: boolean, now: number) => {
      const visibility = smoothStep(1_900, 2_060, altitude) * (1 - smoothStep(2_430, 2_570, altitude));
      if (visibility <= 0) return;
      context.save();
      context.globalAlpha = visibility * (isBreak ? 0.48 : 0.58);
      context.strokeStyle = isBreak ? "rgba(30, 64, 175, 0.66)" : "rgba(125, 211, 252, 0.72)";
      context.lineWidth = 1.2;
      context.lineCap = "round";
      for (let drop = 0; drop < 56; drop++) {
        const x = ((drop * 97 + now * 0.11) % (width + 120)) - 60;
        const y = ((drop * 149 + now * (0.24 + drop % 4 * 0.025)) % (height + 80)) - 40;
        const length = 12 + drop % 5 * 3;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - length * 0.22, y + length);
        context.stroke();
      }
      context.restore();
    };

    const drawClearSkyLayer = (altitude: number, isBreak: boolean, now: number) => {
      const visibility = smoothStep(2_400, 2_580, altitude) * (1 - smoothStep(2_930, 3_080, altitude));
      if (visibility <= 0) return;
      context.save();
      context.globalAlpha = visibility;
      const glowX = width * 0.72;
      const glowY = height * 0.22;
      const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(width, height) * 0.52);
      glow.addColorStop(0, isBreak ? "rgba(255, 255, 255, 0.72)" : "rgba(125, 211, 252, 0.30)");
      glow.addColorStop(0.4, isBreak ? "rgba(240, 249, 255, 0.32)" : "rgba(14, 165, 233, 0.12)");
      glow.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = isBreak ? "rgba(255, 255, 255, 0.46)" : "rgba(186, 230, 253, 0.20)";
      context.lineWidth = Math.max(18, height * 0.035);
      context.lineCap = "round";
      const windLoopWidth = width * 1.35;
      for (let streak = 0; streak < 4; streak++) {
        const y = height * (0.18 + streak * 0.19);
        const baseX = width * (0.04 + streak * 0.09);
        const wrappedX = ((baseX + windOffset + streak * width * 0.17) % windLoopWidth + windLoopWidth)
          % windLoopWidth - width * 0.28;
        const lineLength = width * (0.54 + streak * 0.04);
        for (let copy = -1; copy <= 1; copy++) {
          const x = wrappedX + copy * windLoopWidth;
          context.beginPath();
          context.moveTo(x, y);
          context.bezierCurveTo(
            x + lineLength * 0.38,
            y - 18,
            x + lineLength * 0.72,
            y + 16,
            x + lineLength,
            y - 4,
          );
          context.stroke();
        }
      }
      context.restore();
    };

    const drawSpaceLayer = (altitude: number, isBreak: boolean, now: number) => {
      const visibility = smoothStep(2_900, 3_150, altitude);
      if (visibility <= 0) return;
      context.save();
      context.globalAlpha = visibility;
      const parallaxFactors = [0.02, 0.08, 0.18] as const;
      const horizontalMargin = 8;
      const horizontalLoop = Math.max(1, width + horizontalMargin * 2);
      const verticalLoop = Math.max(1, height + horizontalMargin * 2);
      const altitudeTravel = Math.max(0, altitude - SPACE_EVENT_ALTITUDE);
      context.fillStyle = isBreak ? "#4338ca" : "#ffffff";
      for (const star of starParticles) {
        const rawX = star.normalizedX * width - now * star.horizontalSpeed;
        const x = ((rawX + horizontalMargin) % horizontalLoop + horizontalLoop) % horizontalLoop - horizontalMargin;
        const rawY = star.normalizedY * height + altitudeTravel * parallaxFactors[star.layer];
        const y = ((rawY + horizontalMargin) % verticalLoop + verticalLoop) % verticalLoop - horizontalMargin;
        const twinkle = 0.78 + Math.sin(now * star.twinkleSpeed + star.phase) * 0.22;
        context.globalAlpha = visibility * star.alpha * twinkle;
        context.beginPath();
        context.arc(x, y, star.radius, 0, Math.PI * 2);
        context.fill();
      }
      const activeShootingStar = shootingStarEvent;
      if (activeShootingStar) {
        const elapsed = ufoEventTime - activeShootingStar.startedAt;
        const progress = Math.min(1, Math.max(0, elapsed / activeShootingStar.duration));
        const headX = width * (
          activeShootingStar.startXRatio
          + activeShootingStar.direction * activeShootingStar.travelXRatio * progress
        );
        const headY = height * (
          activeShootingStar.startYRatio
          + activeShootingStar.travelYRatio * progress
        );
        const tailLengthX = width * 0.12 * activeShootingStar.direction;
        const tailLengthY = height * 0.075;
        const tailX = headX - tailLengthX;
        const tailY = headY - tailLengthY;
        const fadeIn = Math.min(1, progress / 0.12);
        const fadeOut = Math.max(0, 1 - progress);
        const shootingStarAlpha = visibility * fadeIn * fadeOut;
        const trailGradient = context.createLinearGradient(tailX, tailY, headX, headY);
        trailGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
        trailGradient.addColorStop(0.72, `rgba(226, 232, 240, ${shootingStarAlpha * 0.55})`);
        trailGradient.addColorStop(1, `rgba(255, 255, 255, ${shootingStarAlpha})`);
        context.save();
        context.globalAlpha = 1;
        context.strokeStyle = trailGradient;
        context.lineWidth = 1.4 + shootingStarAlpha * 1.2;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(headX, headY);
        context.stroke();
        context.fillStyle = `rgba(255, 255, 255, ${shootingStarAlpha})`;
        context.beginPath();
        context.arc(headX, headY, 1.2 + shootingStarAlpha * 1.1, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      const activeAurora = auroraEvent;
      if (activeAurora) {
        const elapsed = ufoEventTime - activeAurora.startedAt;
        const fadeOutStart = activeAurora.fadeInDuration + activeAurora.holdDuration;
        const lifecycleAlpha = elapsed < activeAurora.fadeInDuration
          ? Math.max(0, elapsed / activeAurora.fadeInDuration)
          : elapsed < fadeOutStart
            ? 1
            : Math.max(0, 1 - (elapsed - fadeOutStart) / activeAurora.fadeOutDuration);
        const revealProgress = Math.min(1, Math.max(0, elapsed / activeAurora.fadeInDuration));
        context.save();
        context.beginPath();
        if (activeAurora.direction === 1) context.rect(0, 0, width * revealProgress, height);
        else context.rect(width * (1 - revealProgress), 0, width * revealProgress, height);
        context.clip();
        context.globalAlpha = visibility * lifecycleAlpha * (isBreak ? 0.22 : 0.30);
        context.lineCap = "round";
        context.lineWidth = Math.max(34, height * 0.075);
        const aurora = context.createLinearGradient(0, 0, width, 0);
        aurora.addColorStop(0, "rgba(34, 211, 238, 0)");
        aurora.addColorStop(0.24, isBreak ? "rgba(16, 185, 129, 0.48)" : "rgba(45, 212, 191, 0.54)");
        aurora.addColorStop(0.56, isBreak ? "rgba(99, 102, 241, 0.52)" : "rgba(56, 189, 248, 0.48)");
        aurora.addColorStop(0.82, isBreak ? "rgba(217, 70, 239, 0.42)" : "rgba(168, 85, 247, 0.46)");
        aurora.addColorStop(1, "rgba(168, 85, 247, 0)");
        context.strokeStyle = aurora;
        context.shadowColor = isBreak ? "rgba(129, 140, 248, 0.28)" : "rgba(45, 212, 191, 0.30)";
        context.shadowBlur = 24;
        context.beginPath();
        context.moveTo(-width * 0.08, height * 0.28);
        context.bezierCurveTo(
          width * 0.20,
          height * (0.12 + Math.sin(now * 0.00016 + activeAurora.phase) * 0.035),
          width * 0.50,
          height * (0.44 + Math.cos(now * 0.00013 + activeAurora.phase) * 0.04),
          width * 1.08,
          height * 0.20,
        );
        context.stroke();
        context.restore();
      }
      context.restore();
    };

    const drawAltitudeBackground = (altitude: number, now: number) => {
      const isBreak = breakModeRef.current;
      const colors = getSkyColors(altitude, isBreak);
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, colors.top);
      gradient.addColorStop(0.54, colors.middle);
      gradient.addColorStop(1, colors.bottom);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      drawCloudLayer(altitude, isBreak, now);
      drawRainLayer(altitude, isBreak, now);
      drawClearSkyLayer(altitude, isBreak, now);
      drawSpaceLayer(altitude, isBreak, now);
      drawLandmarkSilhouettes(altitude, isBreak);
    };

    const rebuildSleepingCache = (now: number) => {
      if (!sleepingContext) return;
      const dpr = window.devicePixelRatio || 1;
      sleepingContext.setTransform(1, 0, 0, 1, 0, 0);
      sleepingContext.clearRect(0, 0, sleepingCanvas.width, sleepingCanvas.height);
      sleepingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      cacheScale = currentScale.current;
      cacheOffsetY = currentOffsetY.current;
      sleepingContext.save();
      sleepingContext.translate(width / 2, height);
      sleepingContext.scale(cacheScale, cacheScale);
      sleepingContext.translate(-width / 2, -height + cacheOffsetY);
      sleepingBodies.forEach((body) => drawTomatoBody(body, sleepingContext));
      sleepingContext.restore();
      cachedSleeping = new Set(sleepingBodies);
      pendingSleeping.clear();
      sleepingCacheDirty = false;
      forceCacheRefresh = false;
      lastCacheRefresh = now;
    };

    resize();
    const resumeFromAltitude = initialMaxAltitude > 0;
    const savedCamera = resumeFromAltitude ? readSavedCameraState() : null;
    const restartCameraScale = 0.48;
    cameraScaleLocked = resumeFromAltitude;
    if (resumeFromAltitude) {
      currentScale.current = restartCameraScale;
      targetScale.current = restartCameraScale;
      camera.current = getBounds(restartCameraScale, currentOffsetY.current);
    }
    if (savedCamera) {
      currentOffsetY.current = savedCamera.offsetY;
      targetOffsetY.current = savedCamera.offsetY;
      camera.current = getBounds(restartCameraScale, savedCamera.offsetY);
    } else if (resumeFromAltitude) {
      const restoredOffsetY = initialMaxAltitude * 2;
      currentOffsetY.current = restoredOffsetY;
      targetOffsetY.current = restoredOffsetY;
      camera.current = getBounds(restartCameraScale, restoredOffsetY);
    }
    createBoundaries();
    if (resumeFromAltitude) {
      createCloudFloor(camera.current);
    }
    const persistenceTimer = window.setInterval(saveCameraState, 10_000);
    const handleBeforeUnload = () => saveCameraState();
    window.addEventListener("beforeunload", handleBeforeUnload);

    const render = (now: number) => {
      const rawDelta = Math.max(0, now - previousFrameTime);
      const safeDelta = Math.min(rawDelta, 16.666);
      previousFrameTime = now;
      const frameDelta = pageHidden ? 0 : safeDelta;
      ufoEventTime += frameDelta;
      windOffset = (windOffset + frameDelta * 0.018) % Math.max(1, width * 1.35);
      const ufoNow = ufoEventTime;
      Engine.update(engine, safeDelta);
      if (pageHidden) {
        frame = requestAnimationFrame(render);
        return;
      }
      updateTomatoTransitions(frameDelta);
      if (themeDirtyRef.current) {
        buildBackgroundCanvas();
        themeDirtyRef.current = false;
      }
      if (!pageHidden
        && isSupplyRunningRef.current
        && !debugUfoModeRef.current
        && !octopusEvent
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
        const tomato = body.plugin.tomato as TomatoBodyData | undefined;
        const createdAt = tomato?.createdAt ?? now;
        const isSettledPileBody = tomato?.hasSettled === true
          || body.isSleeping
          || (now - createdAt >= 2_000 && body.speed < 0.1);
        if (isSettledPileBody) {
          if (tomato) tomato.hasSettled = true;
          includeBodyBounds(body);
        }
      });
      sleepingBodies.forEach((body) => {
        includeBodyBounds(body);
      });
      highestPoint = Math.min(highestPoint, archivedHighestPoint);
      const altitude = Number.isFinite(highestPoint)
        ? Math.max(0, Math.floor((height - (highestPoint + 25)) * 0.5))
        : currentAltitude;
      currentAltitude = altitude;
      if (altitude !== lastReportedAltitude) {
        lastReportedAltitude = altitude;
        altitudeChangeRef.current(altitude);
      }
      const highAltitudeEventBand = altitude >= ALIEN_EVENT_ALTITUDE;
      const rocketEligible = altitude >= SPACE_EVENT_ALTITUDE;
      if (highAltitudeEventBand !== previousHighAltitudeEventBand) {
        previousHighAltitudeEventBand = highAltitudeEventBand;
        const eventInterval = highAltitudeEventBand
          ? HIGH_ALTITUDE_EVENT_INTERVAL_MS
          : LOW_ALTITUDE_EVENT_INTERVAL_MS;
        nextUfoCheckAt = ufoNow + eventInterval;
        if (rocketEligible) nextRocketCheckAt = ufoNow + eventInterval;
      }
      if (rocketEligible !== previousRocketEligible) {
        previousRocketEligible = rocketEligible;
        if (rocketEligible) {
          nextRocketCheckAt = ufoNow + (
            highAltitudeEventBand
              ? HIGH_ALTITUDE_EVENT_INTERVAL_MS
              : LOW_ALTITUDE_EVENT_INTERVAL_MS
          );
        }
      }
      if (altitude < AURORA_EVENT_ALTITUDE) {
        auroraEvent = null;
        nextAuroraCheckAt = Math.max(nextAuroraCheckAt, ufoNow + AURORA_CHECK_INTERVAL_MS);
      } else {
        if (!pageHidden && !auroraEvent && ufoNow >= nextAuroraCheckAt) {
          nextAuroraCheckAt = ufoNow + AURORA_CHECK_INTERVAL_MS;
          if (Math.random() < AURORA_APPEARANCE_CHANCE) {
            auroraEvent = {
              startedAt: ufoNow,
              fadeInDuration: 4_000,
              holdDuration: 15_000 + Math.random() * 5_000,
              fadeOutDuration: 4_000,
              direction: Math.random() < 0.5 ? 1 : -1,
              phase: Math.random() * Math.PI * 2,
            };
          }
        }
        if (auroraEvent) {
          const auroraDuration = auroraEvent.fadeInDuration
            + auroraEvent.holdDuration
            + auroraEvent.fadeOutDuration;
          if (ufoNow - auroraEvent.startedAt >= auroraDuration) auroraEvent = null;
        }
      }
      if (altitude < SHOOTING_STAR_EVENT_ALTITUDE) {
        shootingStarEvent = null;
        nextShootingStarCheckAt = Math.max(
          nextShootingStarCheckAt,
          ufoNow + SHOOTING_STAR_CHECK_INTERVAL_MS,
        );
      } else {
        if (!pageHidden && !shootingStarEvent && ufoNow >= nextShootingStarCheckAt) {
          nextShootingStarCheckAt = ufoNow + SHOOTING_STAR_CHECK_INTERVAL_MS;
          if (Math.random() < SHOOTING_STAR_APPEARANCE_CHANCE) {
            const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
            shootingStarEvent = {
              startedAt: ufoNow,
              duration: 800 + Math.random() * 700,
              startXRatio: direction === 1
                ? 0.08 + Math.random() * 0.22
                : 0.70 + Math.random() * 0.22,
              startYRatio: 0.08 + Math.random() * 0.26,
              direction,
              travelXRatio: 0.30 + Math.random() * 0.24,
              travelYRatio: 0.22 + Math.random() * 0.20,
            };
          }
        }
        if (shootingStarEvent
          && ufoNow - shootingStarEvent.startedAt >= shootingStarEvent.duration) {
          shootingStarEvent = null;
        }
      }
      if (Number.isFinite(leftmostPoint) && Number.isFinite(rightmostPoint) && Number.isFinite(highestPoint)) {
        const centerX = width / 2;
        const horizontalMargin = width * 0.1;
        const safeLeft = horizontalMargin;
        const safeRight = width - horizontalMargin;
        const safeTop = height * 0.48;
        const screenLeft = centerX + (leftmostPoint - centerX) * currentScale.current;
        const screenRight = centerX + (rightmostPoint - centerX) * currentScale.current;
        const screenTop = height + (highestPoint - height + currentOffsetY.current) * currentScale.current;
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
          const requiredScale = Math.min(1, horizontalScale, verticalScale);
          const nextTargetScale = Math.max(MIN_DYNAMIC_CAMERA_SCALE, requiredScale);
          if (!cameraScaleLocked) {
            targetScale.current = Math.min(targetScale.current, nextTargetScale);
          }
          if (screenTop < safeTop) {
            const requiredOffsetY = topDistance - (height - safeTop) / currentScale.current;
            targetOffsetY.current = Math.max(targetOffsetY.current, requiredOffsetY);
          }
        }
      }
      if (cameraScaleLocked) {
        currentScale.current = restartCameraScale;
        targetScale.current = restartCameraScale;
      } else {
        currentScale.current += (targetScale.current - currentScale.current) * 0.03;
        if (Math.abs(targetScale.current - currentScale.current) < 0.0001) currentScale.current = targetScale.current;
      }
      currentOffsetY.current += (targetOffsetY.current - currentOffsetY.current) * 0.03;
      if (Math.abs(targetOffsetY.current - currentOffsetY.current) < 0.01) currentOffsetY.current = targetOffsetY.current;
      const bounds = getBounds(currentScale.current, currentOffsetY.current);
      camera.current = bounds;
      syncBoundaries(bounds);
      terrainEvaluationFrame += 1;
      if (terrainEvaluationFrame % TERRAIN_EVALUATION_INTERVAL === 0) {
        absorbOffscreenTerrain(now, bounds);
      }
      if (sleepingCacheDirty && (forceCacheRefresh || now - lastCacheRefresh >= 500)) {
        rebuildSleepingCache(now);
      }
      context.clearRect(0, 0, width, height);
      drawAltitudeBackground(altitude, now);
      context.save();
      context.translate(width / 2, height);
      context.scale(currentScale.current, currentScale.current);
      context.translate(-width / 2, -height + currentOffsetY.current);
      context.drawImage(
        backgroundCanvas,
        backgroundWorld.left,
        backgroundWorld.top,
        backgroundWorld.width,
        backgroundWorld.height,
      );
      if (archivedCanvasReady) {
        context.drawImage(
          archivedCanvas,
          archivedWorld.left,
          archivedWorld.top,
          archivedWorld.width,
          archivedWorld.height,
        );
      }
      drawCloudFloor();
      context.restore();

      if (cachedSleeping.size && sleepingCanvas.width) {
        const ratio = currentScale.current / cacheScale;
        context.save();
        context.translate(0, currentScale.current * (currentOffsetY.current - cacheOffsetY));
        context.translate(width / 2, height);
        context.scale(ratio, ratio);
        context.translate(-width / 2, -height);
        context.drawImage(sleepingCanvas, 0, 0, width, height);
        context.restore();
      }

      context.save();
      context.translate(width / 2, height);
      context.scale(currentScale.current, currentScale.current);
      context.translate(-width / 2, -height + currentOffsetY.current);
      activeBodies.forEach((body) => drawTomatoBody(body));
      pendingSleeping.forEach((body) => drawTomatoBody(body));
      updateAndDrawJuiceParticles(frameDelta);
      updateAndDrawContrailParticles(frameDelta);
      for (let index = birdDeliveries.length - 1; index >= 0; index--) {
        const delivery = birdDeliveries[index];
        const progress = Math.min(1, (ufoNow - delivery.startedAt) / delivery.duration);
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
        const carrierSize = delivery.vehicle === "satellite" ? 136 / currentScale.current : birdSize;
        const dropAnchorOffset = delivery.vehicle === "satellite"
          ? carrierSize * 0.18
          : carrierSize * 0.62;
        if (!delivery.released && progress >= delivery.releaseAt) {
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
          balloon.nextDropAt += 250;
        }

        if (balloon.vehicle === "rocket") {
          drawRocket(x, y, balloonSize, balloon.direction, ufoNow);
        } else {
          drawBalloon(x, y, balloonSize, balloon.direction);
        }
        if (progress >= 1) balloonEvents.splice(index, 1);
      }

      if (previousDebugUfoMode !== debugUfoModeRef.current) {
        previousDebugUfoMode = debugUfoModeRef.current;
        if (!previousDebugUfoMode) {
          nextUfoCheckAt = ufoNow + (
            currentAltitude >= ALIEN_EVENT_ALTITUDE
              ? HIGH_ALTITUDE_EVENT_INTERVAL_MS
              : LOW_ALTITUDE_EVENT_INTERVAL_MS
          );
          if (ufoEvents.length > 1) ufoEvents.splice(1);
        }
      }

      if (!pageHidden && debugUfoModeRef.current && isFocusRunningRef.current) {
        birdDeliveries.length = 0;
        balloonEvents.length = 0;
        deferredDeliveries.length = 0;
        while (ufoEvents.length < 5) {
          const debugSlot = ufoEvents.length;
          const entryDuration = 2200;
          const startedAt = ufoNow;
          ufoEvents.push({
            startedAt,
            hoverDuration: 20_000 + Math.random() * 40_000,
            entryDuration,
            exitDuration: 3000,
            direction: debugSlot % 2 === 0 ? 1 : -1,
            nextDropAt: startedAt + entryDuration + 600,
            hoverPhase: debugSlot * Math.PI * 2 / 5,
            horizontalHoverSpeed: 0.00068 + debugSlot * 0.00006,
            horizontalPhase2: Math.random() * Math.PI * 2,
            horizontalHoverSpeed2: 0.0011 + Math.random() * 0.0009,
            phaseOffset: Math.random() * Math.PI * 2,
            hoverSpeed: 0.002 + Math.random() * 0.003,
            hoverAmplitude: 10 + Math.random() * 15,
            phaseOffset2: Math.random() * Math.PI * 2,
            hoverSpeed2: 0.0007 + Math.random() * 0.001,
            hoverAmplitude2: 4 + Math.random() * 8,
            verticalOffset: (debugSlot - 2) * 16,
            currentYRatio: Math.min(0.30, Math.max(0.20, 0.25 + (debugSlot - 2) * 0.012)),
            targetYRatio: 0.20 + Math.random() * 0.10,
            nextYTargetAt: startedAt + 2_000 + Math.random() * 2_000,
            yLerpFactor: 0.008 + Math.random() * 0.012,
          });
        }
      } else if (!pageHidden && isFocusRunningRef.current && ufoNow >= nextUfoCheckAt) {
        nextUfoCheckAt = ufoNow + (
          currentAltitude >= ALIEN_EVENT_ALTITUDE
            ? HIGH_ALTITUDE_EVENT_INTERVAL_MS
            : LOW_ALTITUDE_EVENT_INTERVAL_MS
        );
        if (isUfoUnlockedRef.current
          && ufoEvents.length === 0
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
            hoverPhase: 0,
            horizontalHoverSpeed: 0.0008,
            horizontalPhase2: Math.random() * Math.PI * 2,
            horizontalHoverSpeed2: 0.0011 + Math.random() * 0.0009,
            phaseOffset: Math.random() * Math.PI * 2,
            hoverSpeed: 0.002 + Math.random() * 0.003,
            hoverAmplitude: 10 + Math.random() * 15,
            phaseOffset2: Math.random() * Math.PI * 2,
            hoverSpeed2: 0.0007 + Math.random() * 0.001,
            hoverAmplitude2: 4 + Math.random() * 8,
            verticalOffset: 0,
            currentYRatio: 0.25,
            targetYRatio: 0.20 + Math.random() * 0.10,
            nextYTargetAt: startedAt + 2_000 + Math.random() * 2_000,
            yLerpFactor: 0.008 + Math.random() * 0.012,
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
        const getHoverX = (hoverElapsed: number) => centerX
          + Math.sin(hoverElapsed * ufo.horizontalHoverSpeed + ufo.hoverPhase) * hoverRange * 0.72
          + Math.sin(hoverElapsed * ufo.horizontalHoverSpeed2 + ufo.horizontalPhase2) * hoverRange * 0.28;
        const hoverEntryX = getHoverX(0);
        let x: number;

        if (elapsed < hoverStart) {
          const entryProgress = Math.max(0, elapsed / ufo.entryDuration);
          const eased = 1 - Math.pow(1 - entryProgress, 3);
          x = enterX + (hoverEntryX - enterX) * eased;
        } else if (elapsed < hoverEnd) {
          x = getHoverX(elapsed - hoverStart);
        } else {
          const exitStartX = getHoverX(ufo.hoverDuration);
          const exitProgress = Math.min(1, (elapsed - hoverEnd) / ufo.exitDuration);
          const eased = exitProgress * exitProgress;
          x = exitStartX + (leaveX - exitStartX) * eased;
        }

        if (ufoNow >= ufo.nextYTargetAt) {
          ufo.targetYRatio = Math.min(
            0.30,
            Math.max(0.20, 0.20 + Math.random() * 0.10 + ufo.verticalOffset / Math.max(height, 1)),
          );
          ufo.nextYTargetAt = ufoNow + 2_000 + Math.random() * 2_000;
        }
        ufo.currentYRatio += (ufo.targetYRatio - ufo.currentYRatio) * ufo.yLerpFactor;
        const floatY = Math.sin(ufoNow * ufo.hoverSpeed + ufo.phaseOffset) * ufo.hoverAmplitude
          + Math.sin(ufoNow * ufo.hoverSpeed2 + ufo.phaseOffset2) * ufo.hoverAmplitude2;
        const ufoScreenY = Math.min(
          height * 0.30,
          Math.max(height * 0.20, height * ufo.currentYRatio + floatY),
        );
        const y = bounds.top + ufoScreenY / currentScale.current;
        const ufoSize = 50 / currentScale.current;
        const dropMargin = (bounds.right - bounds.left) * 0.2;
        const dropAreaLeft = bounds.left + dropMargin;
        const dropAreaRight = bounds.right - dropMargin;

        while (elapsed >= hoverStart && elapsed < hoverEnd && ufoNow >= ufo.nextDropAt) {
          const goldenChance = getGoldenChance();
          const isGolden = Math.random() < goldenChance;
          const spec: TomatoSpec = {
            golden: isGolden,
            radius: (20 + Math.random() * 5) * (2.5 + Math.random() * 0.5) * (0.92 + Math.random() * 0.16),
            isSquishy: !isGolden && Math.random() < 0.04,
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
              spec.isSquishy,
            );
            bonusTomatoRef.current(spec.golden);
            if (spec.golden) goldenDropRef.current();
          }
          ufo.nextDropAt += 1400;
        }

        drawUfo(x, y, ufoSize);
        if (elapsed >= eventEnd) {
          ufoEvents.splice(index, 1);
          if (ufoEvents.length === 0 && !debugUfoModeRef.current) {
            nextUfoCheckAt = Math.min(nextUfoCheckAt, ufoNow);
          }
        }
      }

      if (!pageHidden
        && !debugUfoModeRef.current
        && isFocusRunningRef.current
        && isOctopusUnlockedRef.current
        && !octopusEvent
        && ufoNow >= nextOctopusCheckAt) {
        nextOctopusCheckAt = ufoNow + OCTOPUS_CHECK_INTERVAL_MS;
        if (Math.random() < OCTOPUS_APPEARANCE_CHANCE) {
          for (const delivery of birdDeliveries) {
            if (!delivery.released) deferredDeliveries.push(delivery.golden);
          }
          for (const balloon of balloonEvents) {
            if (balloon.initialDropPending) deferredDeliveries.push(balloon.initialGolden);
          }
          birdDeliveries.length = 0;
          balloonEvents.length = 0;
          const startedAt = ufoNow;
          const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
          octopusEvent = {
            startedAt,
            duration: 15_000,
            entryDuration: 1_600,
            exitDuration: 1_600,
            direction,
            nextDropAt: startedAt + 1_800,
            phase1: Math.random() * Math.PI * 2,
            phase2: Math.random() * Math.PI * 2,
            speed1: 0.00065 + Math.random() * 0.00045,
            speed2: 0.0015 + Math.random() * 0.0009,
            amplitude1: 12 + Math.random() * 11,
            amplitude2: 5 + Math.random() * 7,
            currentYRatio: 0.22 + Math.random() * 0.06,
            targetYRatio: 0.20 + Math.random() * 0.10,
            nextYTargetAt: startedAt + 2_000 + Math.random() * 2_000,
            yLerpFactor: 0.008 + Math.random() * 0.012,
            nextBlinkAt: startedAt + 3_000 + Math.random() * 2_000,
            blinkUntil: Number.NEGATIVE_INFINITY,
          };
        }
      }

      if (octopusEvent) {
        const event = octopusEvent;
        const elapsed = ufoNow - event.startedAt;
        const hoverEnd = event.duration - event.exitDuration;
        const routeMargin = 90 / currentScale.current;
        const enterX = event.direction === 1 ? bounds.left - routeMargin : bounds.right + routeMargin;
        const leaveX = event.direction === 1 ? bounds.right + routeMargin : bounds.left - routeMargin;
        const centerX = (bounds.left + bounds.right) / 2;
        const hoverRange = (bounds.right - bounds.left) * 0.30;
        const organicX = (sampleTime: number) => centerX
          + Math.sin(sampleTime * 0.00072 + event.phase1) * hoverRange * 0.72
          + Math.sin(sampleTime * 0.00161 + event.phase2) * hoverRange * 0.28;
        let x: number;
        if (elapsed < event.entryDuration) {
          const progress = Math.max(0, elapsed / event.entryDuration);
          const eased = 1 - Math.pow(1 - progress, 3);
          x = enterX + (organicX(0) - enterX) * eased;
        } else if (elapsed < hoverEnd) {
          x = organicX(elapsed - event.entryDuration);
        } else {
          const progress = Math.min(1, (elapsed - hoverEnd) / event.exitDuration);
          x = organicX(hoverEnd - event.entryDuration)
            + (leaveX - organicX(hoverEnd - event.entryDuration)) * progress * progress;
        }
        if (ufoNow >= event.nextYTargetAt) {
          event.targetYRatio = 0.20 + Math.random() * 0.10;
          event.nextYTargetAt = ufoNow + 2_000 + Math.random() * 2_000;
        }
        event.currentYRatio += (event.targetYRatio - event.currentYRatio) * event.yLerpFactor;
        const verticalDrift = Math.sin(ufoNow * event.speed1 + event.phase1) * event.amplitude1
          + Math.sin(ufoNow * event.speed2 + event.phase2) * event.amplitude2;
        const octopusScreenY = Math.min(
          height * 0.30,
          Math.max(height * 0.18, height * event.currentYRatio + verticalDrift),
        );
        const y = bounds.top + octopusScreenY / currentScale.current;
        const octopusSize = 96 / currentScale.current;
        if (ufoNow >= event.nextBlinkAt) {
          event.blinkUntil = ufoNow + 150;
          event.nextBlinkAt = event.blinkUntil + 3_000 + Math.random() * 2_000;
        }
        const dropAreaMargin = (bounds.right - bounds.left) * 0.08;
        const dropAreaLeft = bounds.left + dropAreaMargin;
        const dropAreaRight = bounds.right - dropAreaMargin;
        while (elapsed >= event.entryDuration
          && elapsed < hoverEnd
          && ufoNow >= event.nextDropAt) {
          const spec = createTomatoSpec(true);
          createTomato(
            true,
            false,
            {
              x: Math.min(dropAreaRight, Math.max(dropAreaLeft, x)),
              y: y + octopusSize * 0.27 + spec.radius,
            },
            spec.radius,
            false,
          );
          bonusTomatoRef.current(true);
          goldenDropRef.current();
          event.nextDropAt += 1_500 + Math.random() * 500;
        }
        drawOctopus(x, y, octopusSize, event.direction, ufoNow < event.blinkUntil);
        if (elapsed >= event.duration) octopusEvent = null;
      }

      if (!pageHidden && altitude >= ALIEN_EVENT_ALTITUDE && ufoNow >= nextAlienCheckAt) {
        nextAlienCheckAt = ufoNow + ALIEN_CHECK_INTERVAL_MS;
        if (alienEvents.length === 0 && Math.random() < ALIEN_APPEARANCE_CHANCE) {
          alienEvents.push({
            startedAt: ufoNow,
            duration: 10_000 + Math.random() * 6_000,
            direction: Math.random() < 0.5 ? 1 : -1,
            phase1: Math.random() * Math.PI * 2,
            phase2: Math.random() * Math.PI * 2,
            speed1: 0.0012 + Math.random() * 0.0012,
            speed2: 0.0027 + Math.random() * 0.0018,
            amplitude1: 12 + Math.random() * 12,
            amplitude2: 5 + Math.random() * 8,
          });
        }
      }

      for (let index = alienEvents.length - 1; index >= 0; index--) {
        const alien = alienEvents[index];
        const elapsed = ufoNow - alien.startedAt;
        const progress = Math.min(1, Math.max(0, elapsed / alien.duration));
        const routeMargin = 80 / currentScale.current;
        const fromX = alien.direction === 1 ? bounds.left - routeMargin : bounds.right + routeMargin;
        const toX = alien.direction === 1 ? bounds.right + routeMargin : bounds.left - routeMargin;
        const easedProgress = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        const horizontalDrift = Math.sin(elapsed * 0.00073 + alien.phase2) * 18 / currentScale.current;
        const x = fromX + (toX - fromX) * easedProgress + horizontalDrift;
        const minimumScreenY = Math.min(height * 0.26, Math.max(flightScreenY + 22, height * 0.15));
        const maximumScreenY = Math.max(minimumScreenY + 12, height * 0.32);
        const verticalDrift = Math.sin(elapsed * alien.speed1 + alien.phase1) * alien.amplitude1
          + Math.sin(elapsed * alien.speed2 + alien.phase2) * alien.amplitude2;
        const alienScreenY = Math.min(maximumScreenY, Math.max(minimumScreenY, minimumScreenY + 26 + verticalDrift));
        const y = bounds.top + alienScreenY / currentScale.current;
        drawAlien(x, y, 96 / currentScale.current, alien.direction);
        if (progress >= 1) alienEvents.splice(index, 1);
      }
      context.restore();
      drawPhysicsDiagnosticOverlay();
      frame = requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    if (toolbar) observer.observe(toolbar);
    frame = requestAnimationFrame(render);
    return () => {
      saveCameraState();
      window.clearInterval(persistenceTimer);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      Matter.Events.off(engine, "collisionStart", handleStrongImpact);
      Matter.Events.off(engine, "beforeUpdate", handleBeforeUpdate);
      Matter.Events.off(engine, "afterUpdate", handleAfterUpdate);
      Engine.clear(engine);
      addRef.current = () => undefined;
      removeGoldenRef.current = () => 0;
      saveCameraStateRef.current = () => undefined;
    };
    // Counts are read only for initial restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  return <div ref={containerRef} className="pointer-events-none absolute inset-0 z-10"><canvas ref={canvasRef} className="h-full w-full" /></div>;
});
