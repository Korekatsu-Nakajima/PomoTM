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
  const currentScale = useRef<number>(CONFIG.world.initialCameraScale);
  const targetScale = useRef<number>(CONFIG.world.initialCameraScale);
  const totalCount = useRef(0);
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
    const total = counts.normal + counts.gold;
    totalCount.current = total;
  }, [counts]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !hydrated) return;
    const toolbar = container.parentElement?.querySelector<HTMLElement>("[data-control-toolbar]");

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
        label: "tomato", plugin: { tomato: { golden, radius, createdAt: eventTime } },
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
      Composite.add(engine.world, body);
      activeBodies.add(body);
      Matter.Events.on(body, "sleepStart", () => {
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
    const createRadius = () => {
      const baseRadius = 20 + Math.random() * 5;
      const sizeRoll = Math.random();
      if (sizeRoll < 0.003) return baseRadius * (0.3 + Math.random() * 0.1);
      if (sizeRoll < 0.006) return baseRadius * (2.5 + Math.random() * 0.5);
      return baseRadius;
    };

    const createTomatoSpec = (golden?: boolean): TomatoSpec => ({
      golden: golden ?? Math.random() < CONFIG.goldenChance,
      radius: createRadius(),
    });

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
        });
        return;
      }
      birdDeliveries.push({
        startedAt: eventTime,
        duration: 2200 + Math.random() * 600,
        releaseAt: 0.38 + Math.random() * 0.24,
        direction: Math.random() < 0.5 ? 1 : -1,
        golden,
        radius: createTomatoSpec(golden).radius,
        released: false,
      });
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
        const y = bounds.top + flightScreenY / currentScale.current;
        const birdSize = 24 / currentScale.current;
        if (!breakRef.current && !delivery.released && progress >= delivery.releaseAt) {
          delivery.released = true;
          createTomato(
            delivery.golden,
            false,
            { x, y: y + birdSize * 0.62 + delivery.radius },
            delivery.radius,
          );
          if (delivery.golden) goldenDropRef.current();
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

        const insideViewport = x >= bounds.left && x <= bounds.right;
        if (insideViewport && !balloon.enteredViewport) {
          balloon.enteredViewport = true;
          balloon.nextDropAt = eventNow;
        }
        while (!breakRef.current && insideViewport && eventNow >= balloon.nextDropAt) {
          const wasInitialDrop = balloon.initialDropPending;
          const spec = createTomatoSpec(wasInitialDrop ? balloon.initialGolden : undefined);
          createTomato(spec.golden, false, { x, y: y + balloonSize * 1.35 + spec.radius }, spec.radius);
          if (spec.golden) goldenDropRef.current();
          if (!wasInitialDrop) bonusTomatoRef.current(spec.golden);
          balloon.initialDropPending = false;
          balloon.nextDropAt += 750;
        }

        drawBalloon(x, y, balloonSize, balloon.direction);
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
    };
    // Counts are read only for initial restoration; live counts update targetScale above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  return <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full overflow-hidden"><canvas ref={canvasRef} className="block h-full w-full touch-none" /></div>;
});
