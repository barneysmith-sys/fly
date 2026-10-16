import { pointInRing, type Prism } from "./collision.ts";
import { quatFromAxisAngle, type Quat } from "./math.ts";
import flatiron from "./flatiron.json";

export type BuildingStyle = "masonry" | "brick" | "glass" | "limestone";

export type Footprint = {
  id: string;
  name: string | null;
  h: number;
  style: BuildingStyle;
  pad: boolean;
  ring: { x: number; y: number }[];
};

export type Street = {
  name: string | null;
  kind: string;
  width: number;
  line: { x: number; y: number }[];
};

export type District = {
  id: "manhattan-flatiron";
  label: string;
  disclaimer: string;
  attribution: string;
  buildings: Footprint[];
  streets: Street[];
  prisms: Prism[];
  launch: { x: number; y: number; z: number };
  /** Body +x points toward the Flatiron Building. */
  launchQuaternion: Quat;
  approach: { x: number; y: number; z: number };
  pad: { id: string; x: number; y: number; z: number };
};

type RawDistrict = {
  attribution: string;
  note: string;
  launch: { x: number; y: number; z: number };
  approach: { x: number; y: number; z: number };
  buildings: {
    id: string;
    name: string | null;
    height: number;
    style: BuildingStyle;
    pad: boolean;
    ring: number[][];
  }[];
  streets: {
    name: string | null;
    kind: string;
    width: number;
    line: number[][];
  }[];
};

/**
 * Flatiron district. Footprints and most heights are OpenStreetMap data,
 * converted to metres with +x east and +y north. This is not a survey.
 */
export function manhattanDistrict(): District {
  const data = flatiron as unknown as RawDistrict;
  const buildings: Footprint[] = data.buildings.map((building) => ({
    id: building.id,
    name: building.name,
    h: building.height,
    style: building.style,
    pad: building.pad,
    ring: building.ring.map(([x, y]) => ({ x, y })),
  }));
  const padBuilding = buildings.find((building) => building.pad);
  if (!padBuilding) {
    throw new Error("district is missing its landing roof");
  }
  const padCenter = centroid(padBuilding.ring);
  const launchInside = buildings.some((building) => pointInRing(data.launch.x, data.launch.y, building.ring));
  if (launchInside) {
    throw new Error("launch point sits inside a building footprint");
  }
  return {
    id: "manhattan-flatiron",
    label: "Manhattan — Flatiron, approximate",
    disclaimer: data.note,
    attribution: data.attribution,
    buildings,
    streets: data.streets.map((street) => ({
      name: street.name,
      kind: street.kind,
      width: street.width,
      line: street.line.map(([x, y]) => ({ x, y })),
    })),
    prisms: buildings.map((building) => ({
      id: building.id,
      ring: building.ring,
      heightM: building.h,
      pad: building.pad,
    })),
    launch: data.launch,
    launchQuaternion: yawToward(data.launch, flatironAim(buildings)),
    approach: data.approach,
    pad: { id: padBuilding.id, x: padCenter.x, y: padCenter.y, z: padBuilding.h },
  };
}

function flatironAim(buildings: Footprint[]): { x: number; y: number } {
  const named = buildings.find((building) => building.name?.includes("Flatiron"));
  return named ? centroid(named.ring) : { x: 0, y: -40 };
}

function yawToward(from: { x: number; y: number }, to: { x: number; y: number }): Quat {
  return quatFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.atan2(to.y - from.y, to.x - from.x));
}

function centroid(ring: { x: number; y: number }[]): { x: number; y: number } {
  let twice = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const cross = start.x * end.y - end.x * start.y;
    twice += cross;
    x += (start.x + end.x) * cross;
    y += (start.y + end.y) * cross;
  }
  if (Math.abs(twice) < 1e-6) {
    return {
      x: ring.reduce((sum, point) => sum + point.x, 0) / ring.length,
      y: ring.reduce((sum, point) => sum + point.y, 0) / ring.length,
    };
  }
  return { x: x / (3 * twice), y: y / (3 * twice) };
}
