import Matter from "matter-js";
import type { TomatoBodyData } from "@/types/game";

const { Body, Sleeping } = Matter;

type SanitizeWorldBodiesOptions = {
  reportPhysicsDiagnostic: (reason: string, detail: string, body?: Matter.Body) => void;
  removeInvalidBody: (body: Matter.Body) => void;
};

export const correctDeepTomatoOverlap = (bodyA: Matter.Body, bodyB: Matter.Body) => {
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
    if (bodyA.isSleeping) Sleeping.set(bodyA, false);
    const correctionShare = correctionDistance * movableWeightA / totalMovableWeight;
    Body.setPosition(bodyA, {
      x: bodyA.position.x - directionX * correctionShare,
      y: bodyA.position.y - directionY * correctionShare,
    });
  }
  if (movableWeightB > 0) {
    if (bodyB.isSleeping) Sleeping.set(bodyB, false);
    const correctionShare = correctionDistance * movableWeightB / totalMovableWeight;
    Body.setPosition(bodyB, {
      x: bodyB.position.x + directionX * correctionShare,
      y: bodyB.position.y + directionY * correctionShare,
    });
  }
};

export const sanitizeWorldBodies = (
  bodies: Matter.Body[],
  { reportPhysicsDiagnostic, removeInvalidBody }: SanitizeWorldBodiesOptions,
) => {
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
    if (speed > 30) {
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
