import { buildingBox, type Aabb } from "./collision.ts";

export type Building = {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  pad: boolean;
};

export type District = {
  id: "manhattan-fictional";
  label: string;
  disclaimer: string;
  buildings: Building[];
  boxes: Aabb[];
  launch: { x: number; y: number; z: number };
  pad: { id: string; x: number; y: number; z: number; half: number };
};

/**
 * A compact street grid with the proportions of a dense downtown, not a
 * survey of Manhattan. Coordinates are metres. +x is east, +y is north.
 */
export function manhattanDistrict(): District {
  const landmarks: Building[] = [
    { id: "tower-east", x: 118, y: 6, w: 22, d: 22, h: 148, pad: false },
    { id: "slab-south", x: 18, y: -62, w: 46, d: 18, h: 34, pad: false },
    { id: "landing-roof", x: 78, y: 36, w: 26, d: 22, h: 28, pad: true },
  ];
  const buildings: Building[] = [...landmarks];
  const plaza = { minX: -22, maxX: 22, minY: -22, maxY: 22 };
  const footprints: [number, number][] = [
    [28, 22],
    [32, 18],
    [22, 24],
    [36, 16],
  ];
  let index = 0;
  for (let i = 0; i < 9; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      const [w, d] = footprints[(i + j * 3) % footprints.length];
      const x = -184 + i * 46;
      const y = -148 + j * 40;
      const height = 16 + ((index * 17) % 11) * 8;
      const block = { id: `block-${i}-${j}`, x, y, w, d, h: height, pad: false };
      if (overlapsPlaza(x, y, w, d, plaza) || landmarks.some((mark) => overlapsFootprint(block, mark))) {
        index += 1;
        continue;
      }
      buildings.push(block);
      index += 1;
    }
  }
  const padBuilding = buildings.find((item) => item.pad);
  if (!padBuilding) {
    throw new Error("district is missing its landing roof");
  }
  return {
    id: "manhattan-fictional",
    label: "Manhattan — fictional district",
    disclaimer:
      "Fictional street grid inspired by a dense downtown. Not surveyed geography and not for navigation.",
    buildings,
    boxes: buildings.map((item) => buildingBox(item.id, item.x, item.y, item.w, item.d, item.h, item.pad)),
    launch: { x: 0, y: 0, z: 2 },
    pad: {
      id: padBuilding.id,
      x: padBuilding.x,
      y: padBuilding.y,
      z: padBuilding.h,
      half: Math.min(padBuilding.w, padBuilding.d) / 2,
    },
  };
}

function overlapsFootprint(a: Building, b: Building): boolean {
  const gap = 4;
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.d + b.d) / 2 + gap;
}

function overlapsPlaza(
  x: number,
  y: number,
  w: number,
  d: number,
  plaza: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  return x + w / 2 > plaza.minX && x - w / 2 < plaza.maxX && y + d / 2 > plaza.minY && y - d / 2 < plaza.maxY;
}
