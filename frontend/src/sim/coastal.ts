import type { Aabb } from "./collision.ts";
import { quatFromAxisAngle, type Quat } from "./math.ts";

/**
 * Fictional civilian test field. Geometry is original. The reference image is
 * not a texture and not a skybox. Coordinates are metres, +x east, +y north, +z up.
 */

export const APRON = { minX: -80, maxX: 180, minY: -2, maxY: 95 };
export const MAINTENANCE = { x0: 4, x1: 46, y0: 36, y1: 58, roofZ: 7.2, h: 11 };
export const MAIN_HANGAR = { minX: 62, maxX: 138, minY: 42, maxY: 70, h: 16 };
export const PRECISION_PAD = { x: 28, y: 16, half: 5, z: 0.04 };
export const LAUNCH = { x: 6, y: 4, z: 0 };

export type Site = {
  id: "coastal-base-01";
  label: string;
  disclaimer: string;
  attribution: string;
  boxes: Aabb[];
  launch: { x: number; y: number; z: number };
  launchQuaternion: Quat;
  pad: { id: string; x: number; y: number; z: number };
};

export function coastalSite(): Site {
  const boxes: Aabb[] = [
    solid("main-hangar", MAIN_HANGAR.minX, MAIN_HANGAR.maxX, MAIN_HANGAR.minY, MAIN_HANGAR.maxY, 0, MAIN_HANGAR.h),
    solid("shed", 136, 158, 28, 44, 0, 8),
    solid("maintenance-west", MAINTENANCE.x0 - 0.4, MAINTENANCE.x0 + 0.4, MAINTENANCE.y0, MAINTENANCE.y1, 0, MAINTENANCE.h),
    solid("maintenance-east", MAINTENANCE.x1 - 0.4, MAINTENANCE.x1 + 0.4, MAINTENANCE.y0, MAINTENANCE.y1, 0, MAINTENANCE.h),
    solid("maintenance-north", MAINTENANCE.x0, MAINTENANCE.x1, MAINTENANCE.y1 - 0.5, MAINTENANCE.y1 + 0.5, 0, MAINTENANCE.h),
    solid("maintenance-roof", MAINTENANCE.x0, MAINTENANCE.x1, MAINTENANCE.y0, MAINTENANCE.y1, MAINTENANCE.roofZ, MAINTENANCE.h),
    solid("mast", 158, 160.2, 58, 60.2, 0, 18),
    solid("ridge", -180, 260, 168, 210, 0, 36),
    solid("cliff", -86, -64, -20, 90, 0, 9),
    solid("precision-pad", PRECISION_PAD.x - PRECISION_PAD.half, PRECISION_PAD.x + PRECISION_PAD.half, PRECISION_PAD.y - PRECISION_PAD.half, PRECISION_PAD.y + PRECISION_PAD.half, 0, PRECISION_PAD.z, true),
  ];
  for (const [x, y] of [
    [-34, 4],
    [-26, 4],
    [-34, 12],
    [-26, 12],
  ] as const) {
    boxes.push(solid(`pole-${x}-${y}`, x - 0.25, x + 0.25, y - 0.25, y + 0.25, 0, 2.6));
  }
  boxes.push(solid("barrier", -36, -24, 16.8, 17.4, 0, 0.9));
  return {
    id: "coastal-base-01",
    label: "Coastal Base 01",
    disclaimer:
      "Fictional coastal test field. Hangars, shore, and peaks are designed geometry, not a survey of a real airfield.",
    attribution: "Original geometry. No third-party environment mesh.",
    boxes,
    launch: LAUNCH,
    launchQuaternion: quatFromAxisAngle({ x: 0, y: 0, z: 1 }, 2.15),
    pad: { id: "precision-pad", x: PRECISION_PAD.x, y: PRECISION_PAD.y, z: 0 },
  };
}

function solid(
  id: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  pad = false,
): Aabb {
  return { id, minX, maxX, minY, maxY, minZ, maxZ, pad };
}
