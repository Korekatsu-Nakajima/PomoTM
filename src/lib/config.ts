export const CONFIG = {
  durations: { focus: 30 * 60, break: 5 * 60 },
  focusDropDelay: { min: 5_000, max: 10_000 },
  debugDropInterval: 1_000,
  goldenChance: 0.01,
  storageKey: "tomato-focus:v1",
  maxRestoredBodies: 80,
  tomatoImageUrl: "",
  world: {
    initialCameraScale: 0.88,
    pixelsPerMeter: 500,
    tomatoDiameterMeters: 0.08,
    backgroundHeightMeters: 100,
    backgroundWidthMeters: 150,
    pilePackingFactor: 1.7,
    cameraPadding: 1.35,
  },
} as const;

export type TimerMode = keyof typeof CONFIG.durations;
export type TomatoCounts = { normal: number; gold: number };
