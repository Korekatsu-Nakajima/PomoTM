import {
  ALIEN_SVG_PATH,
  OCTOPUS_BACK_LEFT_SVG_PATH,
  OCTOPUS_BACK_RIGHT_SVG_PATH,
  OCTOPUS_DARK_PURPLE,
  OCTOPUS_EYE_COLOR,
  OCTOPUS_FRONT_SVG_PATH,
  OCTOPUS_LIGHT_PURPLE,
  OCTOPUS_MIDDLE_PURPLE,
  OCTOPUS_MIDDLE_SVG_PATH,
  PLANE_SVG_PATH,
  SATELLITE_SIGNAL_COLOR,
  SATELLITE_SVG_PATH,
} from "@/constants/assets";

export const createTomatoRenderer = (
  image: HTMLImageElement,
  isImageReady: () => boolean,
) => {
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
    if (isImageReady()) {
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
  
  
  return drawTomato;
};

export type DrawTomato = ReturnType<typeof createTomatoRenderer>;

export const createCarrierRenderers = (
  context: CanvasRenderingContext2D,
  drawTomato: DrawTomato,
  isBreak: () => boolean,
) => {
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
  
  const planePath = new Path2D(PLANE_SVG_PATH);
  
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
  
  const octopusBackLeftPath = new Path2D(OCTOPUS_BACK_LEFT_SVG_PATH);
  const octopusBackRightPath = new Path2D(OCTOPUS_BACK_RIGHT_SVG_PATH);
  const octopusMiddlePath = new Path2D(OCTOPUS_MIDDLE_SVG_PATH);
  const octopusFrontPath = new Path2D(OCTOPUS_FRONT_SVG_PATH);
  const drawOctopus = (x: number, y: number, size: number, direction: 1 | -1, blinking: boolean) => {
    context.save();
    context.translate(x, y);
    context.scale(direction * size / 64, size / 64);
    context.translate(-32, -32);
    context.globalAlpha = 0.85;
    context.fillStyle = OCTOPUS_DARK_PURPLE;
    context.fill(octopusBackLeftPath);
    context.fill(octopusBackRightPath);
    context.fillStyle = OCTOPUS_MIDDLE_PURPLE;
    context.fill(octopusMiddlePath);
    context.fillStyle = OCTOPUS_LIGHT_PURPLE;
    context.fill(octopusFrontPath);
    context.fillStyle = OCTOPUS_EYE_COLOR;
    context.strokeStyle = OCTOPUS_EYE_COLOR;
    context.lineWidth = 1.25;
    if (blinking) {
      context.beginPath();
      context.moveTo(29, 33.5);
      context.lineTo(31, 33.5);
      context.moveTo(33, 33.5);
      context.lineTo(35, 33.5);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(30, 33.5, 1, 0, Math.PI * 2);
      context.arc(34, 33.5, 1, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  };
  
  const alienPath = new Path2D(ALIEN_SVG_PATH);
  const satellitePath = new Path2D(SATELLITE_SVG_PATH);
  
  const drawAlien = (x: number, y: number, size: number, direction: 1 | -1) => {
    context.save();
    context.translate(x, y);
    context.scale(direction, 1);
    const alienScale = size / 64;
    context.scale(alienScale, alienScale);
    context.translate(-32, -32);
    context.globalAlpha = isBreak() ? 0.48 : 0.62;
    context.fillStyle = isBreak() ? "#312e81" : "#a7f3d0";
    context.shadowColor = isBreak() ? "rgba(99, 102, 241, 0.36)" : "rgba(52, 211, 153, 0.42)";
    context.shadowBlur = 10;
    context.fill(alienPath);
    context.restore();
  };
  
  const drawSatellite = (
    x: number,
    y: number,
    size: number,
    direction: 1 | -1,
    time: number,
    releaseTime: number,
    initialRotation: number,
    radioPulseStartedAt: number,
  ) => {
    context.save();
    context.translate(x, y);
    context.rotate(initialRotation + time / 10_000 * Math.PI * 2);
    context.scale(direction, 1);
    const satelliteScale = size / 64;
    context.scale(satelliteScale, satelliteScale);
    context.translate(-32, -32);
    context.globalAlpha = 0.35;
    context.fillStyle = "#ffffff";
    context.shadowColor = "rgba(186, 230, 253, 0.48)";
    context.shadowBlur = 8;
    context.fill(satellitePath);
    context.restore();
  
    const dropSignalStart = releaseTime - 550;
    const dropSignalEnd = releaseTime + 850;
    const dropSignalProgress = (time - dropSignalStart) / Math.max(1, dropSignalEnd - dropSignalStart);
    const dropSignalEnvelope = dropSignalProgress >= 0 && dropSignalProgress <= 1
      ? Math.min(1, dropSignalProgress / 0.2, (1 - dropSignalProgress) / 0.28)
      : 0;
    const randomSignalProgress = (time - radioPulseStartedAt) / 1_900;
    const randomSignalEnvelope = randomSignalProgress >= 0 && randomSignalProgress <= 1
      ? Math.sin(randomSignalProgress * Math.PI)
      : 0;
    const signalEnvelope = Math.max(dropSignalEnvelope, randomSignalEnvelope);
    if (signalEnvelope <= 0) return;
    const pulseOrigin = dropSignalEnvelope >= randomSignalEnvelope ? dropSignalStart : radioPulseStartedAt;
    const pulse = ((time - pulseOrigin) % 900) / 900;
    context.save();
    context.strokeStyle = SATELLITE_SIGNAL_COLOR;
    context.lineWidth = Math.max(1.2, size * 0.018);
    context.lineCap = "round";
    for (let wave = 0; wave < 3; wave++) {
      const waveProgress = (pulse + wave / 3) % 1;
      const radius = size * (0.22 + waveProgress * 0.54);
      context.globalAlpha = Math.max(0, signalEnvelope) * (1 - waveProgress) * 0.58;
      context.beginPath();
      context.arc(x, y + size * 0.18, radius, Math.PI * 0.18, Math.PI * 0.82);
      context.stroke();
    }
    context.restore();
  };
  
  
  return {
    drawBird,
    drawPlane,
    drawBalloon,
    drawRocket,
    drawUfo,
    drawOctopus,
    drawAlien,
    drawSatellite,
  };
};
