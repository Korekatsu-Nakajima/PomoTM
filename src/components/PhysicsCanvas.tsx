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
  debugUfoMode?: boolean;
  isBonusBreakMode?: boolean;
  timerMode: "focus" | "break";
  isTimerRunning: boolean;
  onAltitudeChange: (altitude: number) => void;
};
type CameraBounds = { left: number; right: number; top: number; bottom: number };
type BirdDelivery = {
  startedAt: number;
  duration: number;
  releaseAt: number;
  direction: 1 | -1;
  golden: boolean;
  radius: number;
  isSquishy: boolean;
  released: boolean;
  vehicle: "bird" | "plane";
};
type TomatoSpec = { golden: boolean; radius: number; isSquishy: boolean };
type TomatoBodyData = {
  golden: boolean;
  radius: number;
  createdAt: number;
  hasSettled: boolean;
  isSquishy: boolean;
  hasBurst: boolean;
  pressureFrames: number;
  pressureLoad: number;
  ripeness: number;
  invincibleUntil: number;
  isDud: boolean;
};
type JuiceParticle = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  life: number;
  maxLife: number;
};
type BalloonEvent = {
  startedAt: number;
  duration: number;
  direction: 1 | -1;
  initialGolden: boolean;
  initialDropPending: boolean;
  enteredViewport: boolean;
  nextDropAt: number;
  vehicle: "balloon" | "rocket";
};
type UfoEvent = {
  startedAt: number;
  hoverDuration: number;
  entryDuration: number;
  exitDuration: number;
  direction: 1 | -1;
  nextDropAt: number;
  hoverPhase: number;
  horizontalHoverSpeed: number;
  horizontalPhase2: number;
  horizontalHoverSpeed2: number;
  phaseOffset: number;
  hoverSpeed: number;
  hoverAmplitude: number;
  phaseOffset2: number;
  hoverSpeed2: number;
  hoverAmplitude2: number;
  verticalOffset: number;
  currentYRatio: number;
  targetYRatio: number;
  nextYTargetAt: number;
  yLerpFactor: number;
};
type PhysicsDiagnosticAlert = {
  title: string;
  detail: string;
  phase: string;
  timestamp: number;
};
const MIN_DYNAMIC_CAMERA_SCALE = 0.20;
const UFO_CHECK_INTERVAL_MS = 45_000;
const UFO_APPEARANCE_CHANCE = 0.03;
const DEEP_CORE_BODY_THRESHOLD = 1_000;
const DEEP_CORE_INSET = 300;
const DEEP_CORE_EVALUATION_INTERVAL = 60;
const TERRAIN_EVALUATION_INTERVAL = 60;
const TERRAIN_SEGMENT_COUNT = 96;
const TERRAIN_VIEWPORT_MARGIN = 50;
const SPACE_EVENT_ALTITUDE = 3_000;
const SUPPLY_GOLDEN_CHANCE = 0.10;
const BONUS_BREAK_GOLDEN_CHANCE = 0.20;
const SUPPLY_GIANT_CHANCE = 0.30;
const BONUS_BREAK_GIANT_CHANCE = 0.45;

export const PhysicsCanvas = forwardRef<PhysicsCanvasHandle, Props>(function PhysicsCanvas(
  {
    counts,
    hydrated,
    onBonusTomato,
    onGoldenTomatoDrop,
    activeBuffs,
    isUfoUnlocked,
    debugUfoMode = false,
    isBonusBreakMode = false,
    timerMode,
    isTimerRunning,
    onAltitudeChange,
  }, ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const addRef = useRef<(golden?: boolean, settled?: boolean) => void>(() => undefined);
  const removeGoldenRef = useRef<(count: number) => number>(() => 0);
  const currentScale = useRef<number>(1);
  const targetScale = useRef<number>(1);
  const currentOffsetY = useRef<number>(0);
  const targetOffsetY = useRef<number>(0);
  const camera = useRef<CameraBounds>({ left: 0, right: 1, top: 0, bottom: 1 });
  const bonusTomatoRef = useRef(onBonusTomato);
  const goldenDropRef = useRef(onGoldenTomatoDrop);
  const activeBuffsRef = useRef(activeBuffs);
  const isUfoUnlockedRef = useRef(isUfoUnlocked);
  const debugUfoModeRef = useRef(debugUfoMode);
  const isBonusBreakModeRef = useRef(isBonusBreakMode);
  const isFocusRunningRef = useRef(timerMode === "focus" && isTimerRunning);
  const isSupplyRunningRef = useRef(timerMode === "focus" && isTimerRunning);
  const altitudeChangeRef = useRef(onAltitudeChange);
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
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !hydrated) return;
    const toolbar = container.closest("section")?.querySelector<HTMLElement>("[data-control-toolbar]");

    const { Engine, Bodies, Body, Composite } = Matter;
    const engine = Engine.create({
      enableSleeping: true,
      positionIterations: 10,
      velocityIterations: 8,
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
    const juiceParticles: JuiceParticle[] = [];
    const ripeningBodies = new Set<Matter.Body>();
    const pressuredBodies = new Set<Matter.Body>();
    let ufoEventTime = performance.now();
    let previousFrameTime = performance.now();
    let nextUfoCheckAt = ufoEventTime + UFO_CHECK_INTERVAL_MS;
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
    let currentAltitude = 0;
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
      if (!pageHidden) nextUfoCheckAt = ufoEventTime + UFO_CHECK_INTERVAL_MS;
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
    };
    const createRadius = (giantChance = SUPPLY_GIANT_CHANCE) => {
      const baseRadius = 20 + Math.random() * 5;
      const sizeRoll = Math.random();
      const sizeScale = 0.92 + Math.random() * 0.16;
      if (sizeRoll < 0.01) return baseRadius * (0.3 + Math.random() * 0.1) * sizeScale;
      if (sizeRoll < 0.01 + giantChance) return baseRadius * (2.5 + Math.random() * 0.5) * sizeScale;
      return baseRadius * sizeScale;
    };

    const createTomatoSpec = (golden?: boolean): TomatoSpec => {
      const goldenChance = isBonusBreakModeRef.current
        ? BONUS_BREAK_GOLDEN_CHANCE
        : activeBuffsRef.current.goldBoost ? SUPPLY_GOLDEN_CHANCE * 2 : SUPPLY_GOLDEN_CHANCE;
      const isGolden = golden ?? Math.random() < goldenChance;
      return {
        golden: isGolden,
        radius: createRadius(isBonusBreakModeRef.current ? BONUS_BREAK_GIANT_CHANCE : SUPPLY_GIANT_CHANCE),
        isSquishy: !isGolden && Math.random() < 0.04,
      };
    };

    const createMediumTomatoSpec = (golden?: boolean): TomatoSpec => {
      const goldenChance = isBonusBreakModeRef.current
        ? BONUS_BREAK_GOLDEN_CHANCE
        : activeBuffsRef.current.goldBoost ? SUPPLY_GOLDEN_CHANCE * 2 : SUPPLY_GOLDEN_CHANCE;
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
      const candidates = new Set([...activeBodies, ...sleepingBodies]);
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
        tomato.ripeness = 0;
        tomato.isDud = Math.random() < 0.01;
        tomato.invincibleUntil = tomato.isDud ? 0 : Date.now() + createInvincibilityDuration();
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

    const getTomatoDiagnosticType = (body: Matter.Body, tomato?: TomatoBodyData) => {
      if (!tomato) return body.label || "unknown";
      if (tomato.isDud) return "Dud";
      if (tomato.golden) return "Gold";
      const radiusRatio = Number.isFinite(tomato.radius) ? tomato.radius / 22.5 : 1;
      if (radiusRatio >= 2) return "Giant";
      if (radiusRatio >= 1.2) return "Medium";
      return "Standard";
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
      wakeNearbyTomatoes(body, tomato.radius);
      infectNearbyTomatoes(body, tomato.radius);
      Composite.remove(engine.world, body);
      Matter.Events.off(body, "sleepStart");
      Matter.Events.off(body, "sleepEnd");
      activeBodies.delete(body);
      sleepingBodies.delete(body);
      pendingSleeping.delete(body);
      staticCoreBodies.delete(body);
      ripeningBodies.delete(body);
      pressuredBodies.delete(body);
      if (cachedSleeping.delete(body)) {
        sleepingCacheDirty = true;
        forceCacheRefresh = true;
      }
    };

    const correctDeepTomatoOverlap = (bodyA: Matter.Body, bodyB: Matter.Body) => {
      if (bodyA.label !== "tomato" || bodyB.label !== "tomato") return;
      const tomatoA = bodyA.plugin.tomato as TomatoBodyData | undefined;
      const tomatoB = bodyB.plugin.tomato as TomatoBodyData | undefined;
      const radiusA = tomatoA?.radius;
      const radiusB = tomatoB?.radius;
      if (!Number.isFinite(radiusA) || !Number.isFinite(radiusB) || !radiusA || !radiusB) return;
      const deltaX = bodyB.position.x - bodyA.position.x;
      const deltaY = bodyB.position.y - bodyA.position.y;
      const centerDistance = Math.hypot(deltaX, deltaY);
      const combinedRadius = radiusA + radiusB;
      if (!Number.isFinite(centerDistance) || centerDistance >= combinedRadius * 0.85) return;
      const directionX = centerDistance > 0.0001
        ? deltaX / centerDistance
        : bodyA.id < bodyB.id ? 1 : -1;
      const directionY = centerDistance > 0.0001 ? deltaY / centerDistance : 0;
      const correctionDistance = (combinedRadius - centerDistance) * 0.30;
      const movableWeightA = bodyA.isStatic ? 0 : 1;
      const movableWeightB = bodyB.isStatic ? 0 : 1;
      const totalMovableWeight = movableWeightA + movableWeightB;
      if (totalMovableWeight === 0) return;
      if (movableWeightA > 0) {
        const correctionShare = correctionDistance * movableWeightA / totalMovableWeight;
        Body.setPosition(bodyA, {
          x: bodyA.position.x - directionX * correctionShare,
          y: bodyA.position.y - directionY * correctionShare,
        });
      }
      if (movableWeightB > 0) {
        const correctionShare = correctionDistance * movableWeightB / totalMovableWeight;
        Body.setPosition(bodyB, {
          x: bodyB.position.x + directionX * correctionShare,
          y: bodyB.position.y + directionY * correctionShare,
        });
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
        ripeningBodies.delete(body);
        pressuredBodies.delete(body);
        if (cachedSleeping.delete(body)) {
          sleepingCacheDirty = true;
          forceCacheRefresh = true;
        }
      }
      if (body === terrainBody) terrainBody = null;
    };

    const sanitizeWorldBodies = () => {
      const bodies = [...Composite.allBodies(engine.world)];
      for (const body of bodies) {
        const values = [body.position.x, body.position.y, body.velocity.x, body.velocity.y];
        if (values.some((value) => !Number.isFinite(value))) {
          reportPhysicsDiagnostic(
            "NaN / Infinity detected",
            `Body ID ${body.id}: position=(${body.position.x}, ${body.position.y}), velocity=(${body.velocity.x}, ${body.velocity.y})`,
            body,
          );
          removeInvalidBody(body);
          continue;
        }
        const speed = Math.hypot(body.velocity.x, body.velocity.y);
        if (speed > 25) {
          const velocityScale = 25 / speed;
          Body.setVelocity(body, {
            x: body.velocity.x * velocityScale,
            y: body.velocity.y * velocityScale,
          });
        }
        const postClampValues = [body.position.x, body.position.y, body.velocity.x, body.velocity.y];
        if (postClampValues.some((value) => !Number.isFinite(value))) {
          reportPhysicsDiagnostic(
            "NaN / Infinity detected after velocity clamp",
            `Body ID ${body.id}: position=(${body.position.x}, ${body.position.y}), velocity=(${body.velocity.x}, ${body.velocity.y})`,
            body,
          );
          removeInvalidBody(body);
        }
      }
    };

    const handleAfterUpdate = () => {
      lastPhysicsPhase = "afterUpdate";
      sanitizeWorldBodies();
    };

    Matter.Events.on(engine, "collisionStart", handleStrongImpact);
    Matter.Events.on(engine, "afterUpdate", handleAfterUpdate);

    const startDelivery = (golden = false) => {
      if (pageHidden) return;
      if (debugUfoModeRef.current) return;
      const useSpaceVehicles = currentAltitude >= SPACE_EVENT_ALTITUDE;
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
          vehicle: useSpaceVehicles ? "rocket" : "balloon",
        });
        return;
      }
      const deliverySpec = useSpaceVehicles ? createMediumTomatoSpec(golden) : createTomatoSpec(golden);
      birdDeliveries.push({
        startedAt: ufoEventTime,
        duration: 2200 + Math.random() * 600,
        releaseAt: 0.38 + Math.random() * 0.24,
        direction: Math.random() < 0.5 ? 1 : -1,
        golden,
        radius: deliverySpec.radius,
        isSquishy: deliverySpec.isSquishy,
        released: false,
        vehicle: useSpaceVehicles ? "plane" : "bird",
      });
    };
    const queueBirdDelivery = (golden = false) => {
      if (pageHidden) return;
      if (!isSupplyRunningRef.current) return;
      if (debugUfoModeRef.current) return;
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
      isSquishy = false,
      ripeness = isSquishy ? 1 : 0,
    ) => {
      target.save();
      target.translate(x, y);
      target.rotate(rotation);
      const ripeAmount = Math.min(1, Math.max(0, ripeness));
      if (imageReady) {
        target.drawImage(image, -radius, -radius, radius * 2, radius * 2);
        if (isSquishy && ripeAmount > 0) {
          target.globalCompositeOperation = "source-atop";
          target.fillStyle = `rgba(110, 16, 16, ${ripeAmount * 0.38})`;
          target.fillRect(-radius, -radius, radius * 2, radius * 2);
          target.globalCompositeOperation = "source-over";
        }
      } else {
        const bodyRadius = radius * 0.9;
        const ripeRed = Math.round(239 + (199 - 239) * ripeAmount);
        const ripeGreen = Math.round(83 + (54 - 83) * ripeAmount);
        const ripeBlue = Math.round(80 + (50 - 80) * ripeAmount);
        const strokeRed = Math.round(181 + (132 - 181) * ripeAmount);
        const strokeGreen = Math.round(47 + (36 - 47) * ripeAmount);
        const strokeBlue = Math.round(45 + (33 - 45) * ripeAmount);
        target.beginPath();
        target.arc(0, radius * 0.08, bodyRadius, 0, Math.PI * 2);
        target.fillStyle = golden ? "#f3bd39" : `rgb(${ripeRed}, ${ripeGreen}, ${ripeBlue})`;
        target.fill();
        target.lineWidth = Math.max(1, radius * 0.07);
        target.strokeStyle = golden ? "#b27b16" : `rgb(${strokeRed}, ${strokeGreen}, ${strokeBlue})`;
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

    const updateTomatoTransitions = (frameDelta: number) => {
      for (const body of [...ripeningBodies]) {
        const tomato = body.plugin.tomato as TomatoBodyData;
        tomato.ripeness = Math.min(1, tomato.ripeness + frameDelta / 700);
        sleepingCacheDirty = true;
        forceCacheRefresh = true;
        if (tomato.ripeness >= 1 || tomato.hasBurst) ripeningBodies.delete(body);
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

    const rebuildTerrainBody = () => {
      const terrainBottom = height + 40;
      const parts = terrainTopByBin.flatMap((top, index) => {
        if (!Number.isFinite(top) || top >= terrainBottom) return [];
        const segmentHeight = terrainBottom - top;
        return [Bodies.rectangle(
          terrainLeft + (index + 0.5) * terrainBinWidth,
          top + segmentHeight / 2,
          terrainBinWidth + 1,
          segmentHeight,
          { isStatic: true, label: "archived-terrain-segment" },
        )];
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
        ripeningBodies.delete(body);
        pressuredBodies.delete(body);
        if (cachedSleeping.delete(body)) removedCachedBody = true;
      });
      if (removedCachedBody) {
        sleepingCacheDirty = true;
        forceCacheRefresh = true;
      }
    };

    const drawBird = (
      x: number,
      y: number,
      size: number,
      direction: 1 | -1,
      carrying: boolean,
      golden: boolean,
      isSquishy: boolean,
      tomatoRadius: number,
      time: number,
    ) => {
      context.save();
      context.translate(x, y);
      context.scale(direction, 1);
      context.globalAlpha = 0.52;
      context.fillStyle = "#1f2937";
      context.strokeStyle = "rgba(248, 250, 252, 0.96)";
      context.lineWidth = Math.max(1.25, size * 0.1);
      context.lineJoin = "round";

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
      context.stroke();

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
      context.stroke();

      context.restore();
      if (carrying) {
        const tomatoY = y + size * 0.62 + tomatoRadius;
        drawTomato(context, x, tomatoY, tomatoRadius, golden, 0, isSquishy);
      }
    };

    const planeSvgPathString = "M9.35004 0.000335693C9.75295 -0.0084185 10.139 0.15621 10.4194 0.446625L17.3803 7.74838L23.435 7.63901C24.2075 7.62781 24.9051 7.96308 25.3774 8.49936H21.9995C20.5115 8.49952 22.9625 9.48455 22.9995 9.49936H25.9125C25.9645 9.69329 25.9963 9.89589 25.9995 10.1058C26.0197 11.4916 24.9155 12.6349 23.5219 12.6595L4.44183 12.9886L3.82367 12.9994C2.43429 13.0252 1.22318 12.0552 0.950623 10.6966L0.0150757 6.02573C-0.0758845 5.58707 0.256726 5.1753 0.706482 5.1683L1.48871 5.1517C1.81738 5.15083 2.13026 5.29196 2.33832 5.5433L4.3598 7.97006L9.15765 7.88998L6.71234 0.991547C6.55328 0.529472 6.88872 0.0419396 7.38129 0.0354919L9.35004 0.000335693Z";
    const planePath = new Path2D(planeSvgPathString);

    const drawPlane = (
      x: number,
      y: number,
      size: number,
      direction: 1 | -1,
      carrying: boolean,
      golden: boolean,
      isSquishy: boolean,
      tomatoRadius: number,
    ) => {
      context.save();
      context.translate(x, y);
      context.scale(direction, 1);
      context.globalAlpha = 0.52;
      const planeScale = size * 2.63 / 26;
      context.scale(planeScale, planeScale);
      context.translate(-13, -6.5);
      context.fillStyle = "#1f2937";
      context.strokeStyle = "rgba(248, 250, 252, 0.96)";
      context.lineWidth = 1.4;
      context.lineJoin = "round";
      context.fill(planePath);
      context.stroke(planePath);
      context.restore();
      if (carrying) {
        drawTomato(context, x, y + size * 0.62 + tomatoRadius, tomatoRadius, golden, 0, isSquishy);
      }
    };

    const drawBalloon = (x: number, y: number, size: number, direction: 1 | -1) => {
      context.save();
      context.translate(x, y);
      context.scale(direction, 1);
      context.globalAlpha = 0.52;
      context.fillStyle = "#64748b";
      context.beginPath();
      context.ellipse(0, -size * 0.35, size * 0.72, size, 0, 0, Math.PI * 2);
      context.moveTo(-size * 0.42, size * 0.28);
      context.lineTo(-size * 0.22, size * 0.9);
      context.lineTo(size * 0.22, size * 0.9);
      context.lineTo(size * 0.42, size * 0.28);
      context.closePath();
      context.rect(-size * 0.34, size * 0.82, size * 0.68, size * 0.42);
      context.fill();
      context.restore();
    };

    const drawRocket = (x: number, y: number, size: number, direction: 1 | -1, time: number) => {
      context.save();
      context.translate(x, y);
      context.scale(direction, 1);
      context.globalAlpha = 0.52;
      context.fillStyle = "#334155";
      context.strokeStyle = "rgba(248, 250, 252, 0.96)";
      context.lineWidth = Math.max(1.25, size * 0.08);
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(size * 1.22, 0);
      context.quadraticCurveTo(size * 0.72, -size * 0.62, -size * 0.5, -size * 0.46);
      context.lineTo(-size * 0.88, -size * 0.86);
      context.lineTo(-size * 0.82, -size * 0.28);
      context.lineTo(-size * 1.05, -size * 0.2);
      context.lineTo(-size * 1.05, size * 0.2);
      context.lineTo(-size * 0.82, size * 0.28);
      context.lineTo(-size * 0.88, size * 0.86);
      context.lineTo(-size * 0.5, size * 0.46);
      context.quadraticCurveTo(size * 0.72, size * 0.62, size * 1.22, 0);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = "#38bdf8";
      context.strokeStyle = "rgba(8, 47, 73, 0.96)";
      context.beginPath();
      context.moveTo(-size * 1.05, -size * 0.18);
      context.lineTo(-size * (1.45 + Math.sin(time * 0.01) * 0.12), 0);
      context.lineTo(-size * 1.05, size * 0.18);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    };

    const drawUfo = (x: number, y: number, size: number) => {
      context.save();
      context.translate(x, y);
      context.globalAlpha = 0.52;
      context.fillStyle = "#475569";
      context.strokeStyle = "rgba(207, 250, 254, 0.98)";
      context.lineWidth = Math.max(1.25, size * 0.07);
      context.lineJoin = "round";
      context.beginPath();
      context.ellipse(0, -size * 0.25, size * 0.48, size * 0.38, 0, Math.PI, Math.PI * 2);
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(-size, 0);
      context.lineTo(-size * 0.58, -size * 0.28);
      context.lineTo(size * 0.58, -size * 0.28);
      context.lineTo(size, 0);
      context.lineTo(size * 0.55, size * 0.3);
      context.lineTo(-size * 0.55, size * 0.3);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = "#ef4444";
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

    const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
    const smoothStep = (from: number, to: number, value: number) => {
      const progress = clampUnit((value - from) / Math.max(1, to - from));
      return progress * progress * (3 - 2 * progress);
    };
    const mixHexColor = (from: string, to: string, amount: number) => {
      const progress = clampUnit(amount);
      const fromValue = Number.parseInt(from.slice(1), 16);
      const toValue = Number.parseInt(to.slice(1), 16);
      const fromRed = fromValue >> 16;
      const fromGreen = fromValue >> 8 & 255;
      const fromBlue = fromValue & 255;
      const toRed = toValue >> 16;
      const toGreen = toValue >> 8 & 255;
      const toBlue = toValue & 255;
      const red = Math.round(fromRed + (toRed - fromRed) * progress);
      const green = Math.round(fromGreen + (toGreen - fromGreen) * progress);
      const blue = Math.round(fromBlue + (toBlue - fromBlue) * progress);
      return `rgb(${red}, ${green}, ${blue})`;
    };
    const getSkyColors = (altitude: number, isBreak: boolean) => {
      const palettes = isBreak
        ? [
            { altitude: 0, top: "#dff5e5", middle: "#e8f5e9", bottom: "#f8faf8" },
            { altitude: 1_000, top: "#b9e6ff", middle: "#dbeafe", bottom: "#f8fafc" },
            { altitude: 2_000, top: "#b8c6d8", middle: "#d3dce7", bottom: "#eef2f7" },
            { altitude: 2_500, top: "#6ecbf5", middle: "#bae6fd", bottom: "#f0f9ff" },
            { altitude: 3_000, top: "#ddd6fe", middle: "#ede9fe", bottom: "#faf5ff" },
          ]
        : [
            { altitude: 0, top: "#0f1f17", middle: "#17251e", bottom: "#1a1a1a" },
            { altitude: 1_000, top: "#102a43", middle: "#193b55", bottom: "#31495b" },
            { altitude: 2_000, top: "#111827", middle: "#253247", bottom: "#475569" },
            { altitude: 2_500, top: "#075985", middle: "#0c4a6e", bottom: "#0369a1" },
            { altitude: 3_000, top: "#030712", middle: "#0b1022", bottom: "#17153b" },
          ];
      let lower = palettes[0];
      let upper = palettes[palettes.length - 1];
      for (let index = 1; index < palettes.length; index++) {
        if (altitude <= palettes[index].altitude) {
          lower = palettes[index - 1];
          upper = palettes[index];
          break;
        }
        lower = palettes[index];
      }
      const progress = lower === upper
        ? 0
        : smoothStep(lower.altitude, upper.altitude, altitude);
      return {
        top: mixHexColor(lower.top, upper.top, progress),
        middle: mixHexColor(lower.middle, upper.middle, progress),
        bottom: mixHexColor(lower.bottom, upper.bottom, progress),
      };
    };

    const pisaTowerPaths = [
      new Path2D("M22 41.8065H42"),
      new Path2D("M30.625 23.5435L38.3525 25.6145L34 41.8065H25.5L30.625 23.5435Z"),
      new Path2D("M29.6585 23.285L39.318 25.873M28.105 29.0805L37.765 31.6685"),
      new Path2D("M32.741 30.2725L33.259 28.3405"),
      new Path2D("M26.553 34.8765L36.212 37.4645"),
      new Path2D("M31.241 35.7725L31.759 33.8405"),
      new Path2D("M36.9382 23.1647L33.0745 22.1294C32.8077 22.0579 32.5336 22.2162 32.4621 22.483L32.2033 23.4489C32.1318 23.7156 32.2901 23.9898 32.5568 24.0613L36.4205 25.0965C36.6873 25.168 36.9614 25.0097 37.0329 24.743L37.2917 23.7771C37.3632 23.5103 37.2049 23.2362 36.9382 23.1647Z"),
      new Path2D("M29.741 41.2725L30.259 39.3405"),
    ];
    const statueOfLibertyPaths = [
      new Path2D("M23.6667 52.8333H25.75M25.75 52.8333H40.3333M25.75 52.8333V46.5833H38.25M40.3333 52.8333H42.4167M40.3333 52.8333V46.5833H38.25M38.25 46.5833V38.25M38.25 38.25V29.5417C38.2497 29.0602 38.0827 28.5937 37.7773 28.2215C37.472 27.8493 37.0471 27.5944 36.575 27.5L27.8333 25.75L23.6667 17.4167M38.25 38.25L42.4167 34.0833M27.8333 46.5833V37.2083M27.8333 37.2083V36.1667L23.6667 32V17.4167M27.8333 37.2083L37.2083 27.8333M23.6667 17.4167H22.625M23.6667 17.4167H24.7083M35.1083 25.75C35.7583 24.9875 36.1667 23.8687 36.1667 22.625C36.1667 20.3229 34.7667 18.4583 33.0417 18.4583C31.3167 18.4583 29.9167 20.3229 29.9167 22.625C29.9167 23.8687 30.325 24.9875 30.975 25.75"),
      new Path2D("M34.0833 16.375C34.0833 16.6513 33.9736 16.9162 33.7782 17.1116C33.5829 17.3069 33.3179 17.4167 33.0416 17.4167C32.7654 17.4167 32.5004 17.3069 32.3051 17.1116C32.1097 16.9162 32 16.6513 32 16.375C32 15.8 32.7979 13.25 33.0416 13.25C33.2854 13.25 34.0833 15.8 34.0833 16.375ZM37.5896 17.7896C37.5217 17.909 37.4308 18.0138 37.3222 18.098C37.2137 18.1821 37.0895 18.244 36.9569 18.28C36.8244 18.316 36.686 18.3254 36.5498 18.3077C36.4135 18.29 36.2821 18.2455 36.1632 18.1768C36.0442 18.1081 35.94 18.0166 35.8566 17.9075C35.7731 17.7983 35.7121 17.6738 35.677 17.541C35.6418 17.4082 35.6333 17.2697 35.652 17.1336C35.6706 16.9975 35.7159 16.8664 35.7854 16.7479C36.0729 16.2479 38.0396 14.4396 38.25 14.5604C38.4604 14.6854 37.8771 17.2896 37.5896 17.7896ZM28.4937 17.7896C28.5616 17.909 28.6525 18.0138 28.761 18.098C28.8696 18.1821 28.9938 18.244 29.1263 18.28C29.2589 18.316 29.3973 18.3254 29.5335 18.3077C29.6698 18.29 29.8011 18.2455 29.9201 18.1768C30.0391 18.1081 30.1433 18.0166 30.2267 17.9075C30.3102 17.7983 30.3712 17.6738 30.4063 17.541C30.4414 17.4082 30.4499 17.2697 30.4313 17.1336C30.4127 16.9975 30.3674 16.8664 30.2979 16.7479C30.0104 16.2479 28.0437 14.4396 27.8333 14.5604C27.6208 14.6854 28.2062 17.2896 28.4937 17.7896ZM25.75 12.2083C25.75 12.7609 25.5305 13.2908 25.1398 13.6815C24.7491 14.0722 24.2192 14.2917 23.6666 14.2917C23.1141 14.2917 22.5842 14.0722 22.1935 13.6815C21.8028 13.2908 21.5833 12.7609 21.5833 12.2083C21.5833 11.0583 23.3416 8.04166 23.6666 8.04166C23.9916 8.04166 25.75 11.0583 25.75 12.2083Z"),
    ];

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
      for (let streak = 0; streak < 4; streak++) {
        const drift = Math.sin(now * 0.00012 + streak * 1.7) * width * 0.04;
        const y = height * (0.18 + streak * 0.19);
        context.beginPath();
        context.moveTo(width * (0.04 + streak * 0.09) + drift, y);
        context.bezierCurveTo(width * 0.28, y - 18, width * 0.46, y + 16, width * (0.58 + streak * 0.08), y - 4);
        context.stroke();
      }
      context.restore();
    };

    const drawSpaceLayer = (altitude: number, isBreak: boolean, now: number) => {
      const visibility = smoothStep(2_900, 3_150, altitude);
      if (visibility <= 0) return;
      context.save();
      context.globalAlpha = visibility;
      for (let star = 0; star < 76; star++) {
        const x = ((star * 137 + 41) % 997) / 997 * width;
        const y = ((star * 223 + 89) % 991) / 991 * height;
        const twinkle = 0.42 + (Math.sin(now * (0.0012 + star % 5 * 0.00017) + star) + 1) * 0.25;
        context.globalAlpha = visibility * twinkle;
        context.fillStyle = isBreak ? "rgba(67, 56, 202, 0.82)" : "rgba(255, 255, 255, 0.94)";
        context.beginPath();
        context.arc(x, y, 0.75 + star % 4 * 0.52, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = visibility * (isBreak ? 0.22 : 0.30);
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
        height * (0.12 + Math.sin(now * 0.00016) * 0.035),
        width * 0.50,
        height * (0.44 + Math.cos(now * 0.00013) * 0.04),
        width * 1.08,
        height * 0.20,
      );
      context.stroke();
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

    resize(); createBoundaries();
    const total = counts.normal + counts.gold;
    const visible = Math.min(total, CONFIG.maxRestoredBodies);
    const goldVisible = total ? Math.min(counts.gold, Math.round(visible * counts.gold / total)) : 0;
    for (let i = 0; i < visible; i++) createTomato(i < goldVisible, true);

    const render = (now: number) => {
      const rawDelta = Math.max(0, now - previousFrameTime);
      const safeDelta = Math.min(rawDelta, 33.33);
      previousFrameTime = now;
      const frameDelta = pageHidden ? 0 : safeDelta;
      ufoEventTime += frameDelta;
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
      sleepingBodies.forEach(includeBodyBounds);
      highestPoint = Math.min(highestPoint, archivedHighestPoint);
      const altitude = Number.isFinite(highestPoint)
        ? Math.max(0, Math.floor((height - (highestPoint + 25)) * 0.5))
        : 0;
      currentAltitude = altitude;
      if (altitude !== lastReportedAltitude) {
        lastReportedAltitude = altitude;
        altitudeChangeRef.current(altitude);
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
          targetScale.current = Math.min(targetScale.current, nextTargetScale);
          if (screenTop < safeTop) {
            const requiredOffsetY = topDistance - (height - safeTop) / currentScale.current;
            targetOffsetY.current = Math.max(targetOffsetY.current, requiredOffsetY);
          }
        }
      }
      currentScale.current += (targetScale.current - currentScale.current) * 0.03;
      if (Math.abs(targetScale.current - currentScale.current) < 0.0001) currentScale.current = targetScale.current;
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
              delivery.isSquishy,
            );
            if (delivery.golden) goldenDropRef.current();
            if (dropIndex > 0) bonusTomatoRef.current(delivery.golden);
          }
        }
        if (delivery.vehicle === "plane") {
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
          nextUfoCheckAt = ufoNow + UFO_CHECK_INTERVAL_MS;
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
          const goldenChance = isBonusBreakModeRef.current
            ? BONUS_BREAK_GOLDEN_CHANCE
            : activeBuffsRef.current.goldBoost ? SUPPLY_GOLDEN_CHANCE * 2 : SUPPLY_GOLDEN_CHANCE;
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
        if (elapsed >= eventEnd) ufoEvents.splice(index, 1);
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
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      Matter.Events.off(engine, "collisionStart", handleStrongImpact);
      Matter.Events.off(engine, "afterUpdate", handleAfterUpdate);
      Engine.clear(engine);
      addRef.current = () => undefined;
      removeGoldenRef.current = () => 0;
    };
    // Counts are read only for initial restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  return <div ref={containerRef} className="pointer-events-none absolute inset-0 z-10"><canvas ref={canvasRef} className="h-full w-full" /></div>;
});
