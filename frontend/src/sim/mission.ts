/**
 * Mission 01 is scored from the rigid-body state. The educational copy does
 * not move the aircraft.
 */

export const MISSION_ID = "mission-01";
export const HOVER_TARGET_M = 2;
export const HOVER_HOLD_S = 5;

export type MissionStage = "inspect" | "controls" | "takeoff" | "hover" | "land" | "debrief";

export const STAGE_ORDER: MissionStage[] = ["inspect", "controls", "takeoff", "hover", "land", "debrief"];

export type InspectedParts = {
  propeller: boolean;
  motor: boolean;
  controller: boolean;
};

export type ControlSeen = {
  throttleUp: boolean;
  throttleDown: boolean;
  yaw: boolean;
  pitch: boolean;
  roll: boolean;
};

export type HoverSample = {
  altitudeM: number;
  verticalSpeedM_S: number;
  horizontalSpeedM_S: number;
  tiltRad: number;
};

export type LandingSample = {
  onPad: boolean;
  onGround: boolean;
  altitudeM: number;
  verticalSpeedM_S: number;
  horizontalSpeedM_S: number;
  tiltRad: number;
  positionErrorM: number;
};

export type LandingVerdict = "airborne" | "success" | "hard" | "miss" | "tilted";

export type SessionRecord = {
  flightTimeS: number;
  maxAltitudeM: number;
  hoverHeldS: number;
  landingErrorM: number | null;
  touchdownVerticalM_S: number | null;
  touchdownHorizontalM_S: number | null;
  resets: number;
};

export type InstructorNote = {
  id: string;
  title: string;
  body: string;
  why: string;
};

export function inspectionComplete(parts: InspectedParts): boolean {
  return parts.propeller && parts.motor && parts.controller;
}

export function controlsComplete(seen: ControlSeen): boolean {
  return seen.throttleUp && seen.throttleDown && seen.yaw && seen.pitch && seen.roll;
}

export function takeoffReached(altitudeM: number, buildingStrike: boolean): boolean {
  return altitudeM >= HOVER_TARGET_M && !buildingStrike;
}

export function hoverIsStable(sample: HoverSample): boolean {
  return (
    Math.abs(sample.altitudeM - HOVER_TARGET_M) <= 0.45 &&
    Math.abs(sample.verticalSpeedM_S) <= 0.4 &&
    sample.horizontalSpeedM_S <= 0.7 &&
    sample.tiltRad <= 0.22
  );
}

export function hoverProgress(heldS: number): number {
  return Math.max(0, Math.min(1, heldS / HOVER_HOLD_S));
}

export function judgeLanding(sample: LandingSample): LandingVerdict {
  if (!sample.onGround && !sample.onPad) {
    return "airborne";
  }
  if (!sample.onPad || sample.positionErrorM > 5) {
    return "miss";
  }
  if (sample.tiltRad > 0.4) {
    return "tilted";
  }
  if (Math.abs(sample.verticalSpeedM_S) > 1.15 || sample.horizontalSpeedM_S > 1.15) {
    return "hard";
  }
  return "success";
}

export function nextStage(stage: MissionStage): MissionStage {
  const index = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(index + 1, STAGE_ORDER.length - 1)];
}

export function verticalForceNote(thrustUpN: number, weightN: number): string {
  const gap = thrustUpN - weightN;
  if (gap > 0.35) {
    return "Upward thrust is greater than weight. A level aircraft accelerates upward.";
  }
  if (gap < -0.35) {
    return "Upward thrust is less than weight. The aircraft accelerates downward.";
  }
  return "Upward thrust is close to weight. Vertical acceleration is near zero if drag is small.";
}

export function instructorFor(kind: string, detail: { thrustUpN: number; weightN: number; tiltRad: number }): InstructorNote | null {
  if (kind === "climb-fast") {
    return {
      id: kind,
      title: "Climbing quickly",
      body: "Vertical speed is high. Ease the throttle as you near 2 m.",
      why: "Throttle commands collective thrust. With the nose near level, extra thrust above weight becomes upward acceleration.",
    };
  }
  if (kind === "thrust-high") {
    return {
      id: kind,
      title: "Gaining altitude",
      body: "You're gaining altitude because upward thrust exceeds weight.",
      why: `The vertical part of thrust is ${detail.thrustUpN.toFixed(2)} N and weight is ${detail.weightN.toFixed(2)} N. For a tilted aircraft the vertical part is less than the total thrust.`,
    };
  }
  if (kind === "thrust-low") {
    return {
      id: kind,
      title: "Losing altitude",
      body: "Upward thrust is currently less than weight, so the aircraft accelerates downward.",
      why: "Adding throttle increases total thrust. That raises the vertical component only while the thrust axis still points mostly up.",
    };
  }
  if (kind === "drift") {
    return {
      id: kind,
      title: "Sliding sideways",
      body: "The aircraft is tilted, so part of the thrust acts horizontally.",
      why: `Tilt is ${((detail.tiltRad * 180) / Math.PI).toFixed(0)}°. Thrust stays along the body axis. The horizontal piece accelerates the aircraft across the pad.`,
    };
  }
  if (kind === "hover") {
    return {
      id: kind,
      title: "Hover",
      body: "Altitude is near 2 m and vertical speed is small.",
      why: "A hover here means the vertical acceleration is near zero and the aircraft is not translating quickly. Stabilized mode levels the tilt when the arrow keys are centered.",
    };
  }
  if (kind === "hard") {
    return {
      id: kind,
      title: "Hard touchdown",
      body: "The touchdown speed was too high. This landing is not counted.",
      why: "Contact uses the sphere against the pad. A successful landing needs that contact, a small vertical speed, a small horizontal speed, and a modest tilt.",
    };
  }
  if (kind === "miss") {
    return {
      id: kind,
      title: "Off the pad",
      body: "The aircraft met the ground outside the landing zone.",
      why: "The zone is the precision pad. Position error is the horizontal distance from the pad center at contact.",
    };
  }
  if (kind === "landed") {
    return {
      id: kind,
      title: "Landed",
      body: "Contact, speed, and tilt were inside the landing limits.",
      why: "The score uses the collision result and the velocity at that step. The aircraft was not moved onto the pad.",
    };
  }
  return null;
}

export const FUTURE_MISSIONS = [
  { id: "02", title: "Stable hover", state: "preview" },
  { id: "03", title: "Pitch, roll, and yaw", state: "preview" },
  { id: "04", title: "Controlled navigation", state: "preview" },
  { id: "05", title: "Precision landing", state: "preview" },
  { id: "06", title: "Flight modes", state: "preview" },
  { id: "07", title: "Sensors and estimation", state: "preview" },
  { id: "08", title: "Autonomous flight", state: "preview" },
] as const;
