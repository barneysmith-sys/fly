import { length, sub, type Vec3 } from "./math.ts";
import type { VehicleState } from "./vehicle.ts";

export type Aabb = {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  /** Top face is a designated pad, not a crash surface. */
  pad: boolean;
};

export type Contact = {
  id: string;
  normal: Vec3;
  pad: boolean;
};

/**
 * Inelastic sphere correction against the ground and building boxes.
 * The vehicle is pushed out along the smallest overlap and the velocity
 * into that face is removed. This is not a friction or gear model.
 */
export function resolveContacts(state: VehicleState, boxes: Aabb[], radiusM: number): { state: VehicleState; contact: Contact | null } {
  let next = state;
  let contact: Contact | null = null;
  if (next.positionM.z < radiusM) {
    next = {
      ...next,
      positionM: { ...next.positionM, z: radiusM },
      velocityM_S: {
        ...next.velocityM_S,
        z: next.velocityM_S.z < 0 ? 0 : next.velocityM_S.z,
      },
    };
    contact = { id: "ground", normal: { x: 0, y: 0, z: 1 }, pad: false };
  }
  for (const box of boxes) {
    const hit = sphereAabb(next.positionM, radiusM, box);
    if (!hit) {
      continue;
    }
    next = {
      ...next,
      positionM: {
        x: next.positionM.x + hit.normal.x * hit.depth,
        y: next.positionM.y + hit.normal.y * hit.depth,
        z: next.positionM.z + hit.normal.z * hit.depth,
      },
      velocityM_S: removeInto(next.velocityM_S, hit.normal),
    };
    contact = { id: box.id, normal: hit.normal, pad: box.pad && hit.normal.z > 0.5 };
  }
  return { state: next, contact };
}

export function buildingBox(id: string, x: number, y: number, w: number, d: number, h: number, pad = false): Aabb {
  return {
    id,
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: y - d / 2,
    maxY: y + d / 2,
    minZ: 0,
    maxZ: h,
    pad,
  };
}

function sphereAabb(center: Vec3, radius: number, box: Aabb): { normal: Vec3; depth: number } | null {
  const closest = {
    x: Math.min(box.maxX, Math.max(box.minX, center.x)),
    y: Math.min(box.maxY, Math.max(box.minY, center.y)),
    z: Math.min(box.maxZ, Math.max(box.minZ, center.z)),
  };
  const delta = sub(center, closest);
  const dist = length(delta);
  const inside =
    center.x > box.minX &&
    center.x < box.maxX &&
    center.y > box.minY &&
    center.y < box.maxY &&
    center.z > box.minZ &&
    center.z < box.maxZ;
  if (!inside && dist >= radius) {
    return null;
  }
  if (inside || dist < 1e-8) {
    const overlaps = [
      { depth: center.x - box.minX, normal: { x: -1, y: 0, z: 0 } },
      { depth: box.maxX - center.x, normal: { x: 1, y: 0, z: 0 } },
      { depth: center.y - box.minY, normal: { x: 0, y: -1, z: 0 } },
      { depth: box.maxY - center.y, normal: { x: 0, y: 1, z: 0 } },
      { depth: center.z - box.minZ, normal: { x: 0, y: 0, z: -1 } },
      { depth: box.maxZ - center.z, normal: { x: 0, y: 0, z: 1 } },
    ];
    overlaps.sort((a, b) => a.depth - b.depth);
    const least = overlaps[0];
    return { normal: least.normal, depth: least.depth + radius };
  }
  return { normal: { x: delta.x / dist, y: delta.y / dist, z: delta.z / dist }, depth: radius - dist };
}

function removeInto(velocity: Vec3, normal: Vec3): Vec3 {
  const into = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
  if (into >= 0) {
    return velocity;
  }
  return {
    x: velocity.x - into * normal.x,
    y: velocity.y - into * normal.y,
    z: velocity.z - into * normal.z,
  };
}
