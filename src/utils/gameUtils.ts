import type Matter from "matter-js";
import type { TomatoBodyData } from "@/types/game";

export const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

export const smoothStep = (from: number, to: number, value: number) => {
  const progress = clampUnit((value - from) / Math.max(1, to - from));
  return progress * progress * (3 - 2 * progress);
};

export const mixHexColor = (from: string, to: string, amount: number) => {
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

export const getSkyColors = (altitude: number, isBreak: boolean) => {
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

export const getTomatoDiagnosticType = (body: Matter.Body, tomato?: TomatoBodyData) => {
  if (!tomato) return body.label || "unknown";
  if (tomato.isDud) return "Dud";
  if (tomato.golden) return "Gold";
  const radiusRatio = Number.isFinite(tomato.radius) ? tomato.radius / 22.5 : 1;
  if (radiusRatio >= 2) return "Giant";
  if (radiusRatio >= 1.2) return "Medium";
  return "Standard";
};

export const formatBuffTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
};
