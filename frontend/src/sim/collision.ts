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

export type Prism = {
  id: string;
  /** Horizontal footprint. Not necessarily closed; the last edge returns to the first point. */
  ring: { x: number; y: number }[];
  heightM: number;
  pad: boolean;
};

/** Even-odd test. Used for street clearance and for prism walls. */
export function pointInRing(x: number, y: number, ring: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    if (start.y > y !== end.y > y) {
      const xCross = ((end.x - start.x) * (y - start.y)) / (end.y - start.y) + start.x;
      if (x < xCross) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Inelastic sphere correction against extruded footprints.
 * Axis-aligned boxes would block the diagonal Manhattan streets, so the
 * flight scene uses these prisms. The response is still frictionless.
 */
export function resolvePrisms(
  state: VehicleState,
  prisms: Prism[],
  radiusM: number,
): { state: VehicleState; contact: Contact | null } {
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
  for (const prism of prisms) {
    const hit = spherePrism(next.positionM, radiusM, prism);
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
    contact = { id: prism.id, normal: hit.normal, pad: prism.pad && hit.normal.z > 0.5 };
  }
  return { state: next, contact };
}

function spherePrism(center: Vec3, radius: number, prism: Prism): { normal: Vec3; depth: number } | null {
  if (prism.ring.length < 3) {
    return null;
  }
  const inside = pointInRing(center.x, center.y, prism.ring);
  const edge = nearestOnRing(center.x, center.y, prism.ring);
  if (inside) {
    if (center.z >= prism.heightM) {
      const gap = center.z - prism.heightM;
      if (gap >= radius) {
        return null;
      }
      return { normal: { x: 0, y: 0, z: 1 }, depth: radius - gap };
    }
    if (center.z <= 0) {
      return null;
    }
    const roof = prism.heightM - center.z;
    const wall = edge.distance;
    if (roof <= wall) {
      return { normal: { x: 0, y: 0, z: 1 }, depth: roof + radius };
    }
    return { normal: outward(center.x, center.y, edge, true), depth: wall + radius };
  }
  const clampedZ = Math.min(prism.heightM, Math.max(0, center.z));
  const dx = center.x - edge.x;
  const dy = center.y - edge.y;
  const dz = center.z - clampedZ;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= radius || distance < 1e-8) {
    return null;
  }
  return {
    normal: { x: dx / distance, y: dy / distance, z: dz / distance },
    depth: radius - distance,
  };
}

function outward(
  x: number,
  y: number,
  edge: { x: number; y: number },
  fromInside: boolean,
): Vec3 {
  const vx = fromInside ? edge.x - x : x - edge.x;
  const vy = fromInside ? edge.y - y : y - edge.y;
  const scale = Math.hypot(vx, vy) || 1;
  return { x: vx / scale, y: vy / scale, z: 0 };
}

function nearestOnRing(x: number, y: number, ring: { x: number; y: number }[]): { x: number; y: number; distance: number } {
  let bestX = ring[0].x;
  let bestY = ring[0].y;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq < 1e-8 ? 0 : Math.min(1, Math.max(0, ((x - start.x) * dx + (y - start.y) * dy) / lengthSq));
    const px = start.x + dx * t;
    const py = start.y + dy * t;
    const distance = Math.hypot(x - px, y - py);
    if (distance < best) {
      best = distance;
      bestX = px;
      bestY = py;
    }
  }
  return { x: bestX, y: bestY, distance: best };
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
