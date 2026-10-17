import { headingDegFromNorth, rhAngles, tiltFromVerticalRad } from "./math.ts";
import type { ControlMode } from "./control.ts";
import type { VehicleState } from "./vehicle.ts";

export type InstructorQuestion =
  | "drift"
  | "thrust"
  | "axes"
  | "landing"
  | "controller";

export type InstructorContext = {
  state: VehicleState;
  mode: ControlMode;
  thrustN: number;
  massKg: number;
  weightN: number;
  landing: { success: boolean; reason: string; positionErrorM: number } | null;
};

export const INSTRUCTOR_NOTE =
  "Rules-based instructor. It reads the current vehicle state and the documented controller. No language model is connected.";

/** Explanations are computed from the supplied state. They are not generated text. */
export function explain(question: InstructorQuestion, context: InstructorContext): string {
  const tiltDeg = (tiltFromVerticalRad(context.state.quaternion) * 180) / Math.PI;
  const angles = rhAngles(context.state.quaternion);
  const pitchNoseUp = (-angles.pitchRh * 180) / Math.PI;
  const rollRightDown = (angles.rollRh * 180) / Math.PI;
  const speed = Math.hypot(context.state.velocityM_S.x, context.state.velocityM_S.y);
  if (question === "drift") {
    return `Horizontal speed is ${speed.toFixed(2)} m/s and the body up-axis is ${tiltDeg.toFixed(1)} deg from vertical. Thrust is ${context.thrustN.toFixed(2)} N along the body up-axis, so any tilt gives that thrust a horizontal part. Centered sticks in stabilized mode command level attitude; they do not cancel speed the vehicle already has. Drag is the only horizontal force once the vehicle is level.`;
  }
  if (question === "thrust") {
    const margin = context.thrustN - context.weightN;
    return `Weight is ${context.weightN.toFixed(2)} N. Total thrust is ${context.thrustN.toFixed(2)} N, which is ${margin >= 0 ? "above" : "below"} weight by ${Math.abs(margin).toFixed(2)} N. While the vehicle is level and drag is zero, vertical acceleration is ${(margin / context.massKg).toFixed(2)} m/s². Tilt spends part of that thrust horizontally, so the same collective climbs less.`;
  }
  if (question === "axes") {
    return `Pitch, roll, and yaw are body rotations. Right now nose-up pitch is ${pitchNoseUp.toFixed(1)} deg, right-wing-down roll is ${rollRightDown.toFixed(1)} deg, and heading is ${headingDegFromNorth(context.state.quaternion).toFixed(0)} deg clockwise from north. Positive pitch lowers the nose in this model and tips thrust forward. Positive roll lowers the right side. Yaw turns the nose. The world frame is x east, y north, z up.`;
  }
  if (question === "landing") {
    if (!context.landing) {
      return "No landing episode has been run in this session. The trainer scores pad contact from the integrated state: horizontal error, touchdown speed, and tilt. It does not invent a result.";
    }
    return `${context.landing.success ? "The last episode met the pad limits." : "The last episode did not meet the pad limits."} ${context.landing.reason}. Position error at the scored sample was ${context.landing.positionErrorM.toFixed(2)} m.`;
  }
  return `Flight mode is ${context.mode}. Stabilized mode commands a roll angle, a pitch angle, and a yaw rate, then a rate term turns that into motor torque. Acro mode commands the rates directly and does not level the vehicle. Throttle is collective thrust in both modes. Neither mode is an integral PID, and neither is a learned policy. The vertical-only altitude PID still lives in the lab.`;
}
