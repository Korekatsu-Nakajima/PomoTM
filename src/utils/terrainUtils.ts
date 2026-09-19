import Matter from "matter-js";
import type { CameraBounds } from "@/types/game";

const { Bodies } = Matter;

type CentralCoreBounds = {
  left: number;
  right: number;
};

type CreateTerrainSegmentPartsOptions = {
  terrainTopByBin: number[];
  terrainBottom: number;
  terrainLeft: number;
  terrainBinWidth: number;
};

export const getCentralCoreBounds = (visibleBounds: CameraBounds): CentralCoreBounds => {
  const visibleWidth = Math.max(1, visibleBounds.right - visibleBounds.left);
  return {
    left: visibleBounds.left + visibleWidth * 0.25,
    right: visibleBounds.left + visibleWidth * 0.75,
  };
};

export const getVisibleTomatoBodies = (
  activeBodies: Set<Matter.Body>,
  sleepingBodies: Set<Matter.Body>,
  visibleBounds: CameraBounds,
) => [...activeBodies, ...sleepingBodies].filter((body) =>
  body.bounds.max.x >= visibleBounds.left
  && body.bounds.min.x <= visibleBounds.right
  && body.bounds.max.y >= visibleBounds.top
  && body.bounds.min.y <= visibleBounds.bottom,
);

export const createTerrainSegmentParts = ({
  terrainTopByBin,
  terrainBottom,
  terrainLeft,
  terrainBinWidth,
}: CreateTerrainSegmentPartsOptions) => terrainTopByBin.flatMap((top, index) => {
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
