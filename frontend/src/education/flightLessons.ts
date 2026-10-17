import type { MotorQuad, QuatLike, Vec3Like } from "../animation/types.ts";
import { describeWrench, wrenchFromMotors } from "../animation/motorLayout.ts";

/**
 * Lesson readouts computed from one physics frame. Pure functions, no DOM,
 * no Three.js, so they unit-test with node --test and run inside the HUD,
 * the Academy and the anatomy viewer alike.
 *
 * Every number returned is either a sim value or a direct algebraic
 * consequence of sim values and VehicleParams. Estimates say so in `kind`.
 */

export type LessonParams = {
  massKg: number;
  gravityM_S2: number;
  thrustMaxN: number;
  motorRadiusM: number;
  yawTorquePerNewtonM: number;
  dragCoefficientKgPerM: number;
  maxTiltRad: number;
};

export type LessonInput = {
  quaternion: QuatLike;
  velocityM_S: Vec3Like;
  angularVelocityRad_S: Vec3Like;
  motorsN: MotorQuad;
};

export type Value = { value: number; unit: string; kind: "sim" | "derived" | "estimate" };

function rotate(q: QuatLike, v: Vec3Like): Vec3Like {
  // v' = q v q*, same as sim/math.ts rotateBodyToWorld.
  const { w, x, y, z } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}
const conj = (q: QuatLike): QuatLike => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });

export function forceBreakdown(f: LessonInput, p: LessonParams) {
  const w = wrenchFromMotors(f.motorsN, p);
  const up = rotate(f.quaternion, { x: 0, y: 0, z: 1 });
  const weight = p.massKg * p.gravityM_S2;
  const speed = Math.hypot(f.velocityM_S.x, f.velocityM_S.y, f.velocityM_S.z);
  const drag = { x: -p.dragCoefficientKgPerM * speed * f.velocityM_S.x, y: -p.dragCoefficientKgPerM * speed * f.velocityM_S.y, z: -p.dragCoefficientKgPerM * speed * f.velocityM_S.z };
  const tilt = Math.acos(Math.max(-1, Math.min(1, up.z)));
  const thrustV = w.thrustN * up.z;
  const thrustH = w.thrustN * Math.hypot(up.x, up.y);
  const netZ = thrustV - weight + drag.z;
  return {
    weightN: { value: weight, unit: "N", kind: "derived" } as Value,
    thrustN: { value: w.thrustN, unit: "N", kind: "sim" } as Value,
    verticalThrustN: { value: thrustV, unit: "N", kind: "derived" } as Value,
    horizontalThrustN: { value: thrustH, unit: "N", kind: "derived" } as Value,
    tiltDeg: { value: (tilt * 180) / Math.PI, unit: "°", kind: "derived" } as Value,
    verticalAccel: { value: netZ / p.massKg, unit: "m/s²", kind: "derived" } as Value,
    hoverThrustAtTiltN: { value: weight / Math.max(0.05, Math.cos(tilt)), unit: "N", kind: "derived" } as Value,
    torque: w,
    torqueText: describeWrench(w),
  };
}

/**
 * Stopping distance with maximum stabilized tilt, ignoring drag and spool-up.
 * d = v² / (2 g tan θmax). An estimate: drag shortens it, attitude response lengthens it.
 */
export function stoppingDistance(f: LessonInput, p: LessonParams): Value {
  const vh = Math.hypot(f.velocityM_S.x, f.velocityM_S.y);
  const decel = p.gravityM_S2 * Math.tan(p.maxTiltRad);
  return { value: (vh * vh) / (2 * decel), unit: "m", kind: "estimate" };
}

/**
 * Ideal IMU readings derived from sim truth. No noise, bias or rate limit.
 * Gyro = body angular velocity (the integrator's own state).
 * Accelerometer = specific force in body frame = (thrust + drag) / m.
 * At hover it reads +g on body z, not zero: the classic surprise.
 */
export function idealImu(f: LessonInput, p: LessonParams) {
  const w = wrenchFromMotors(f.motorsN, p);
  const speed = Math.hypot(f.velocityM_S.x, f.velocityM_S.y, f.velocityM_S.z);
  const dragW = { x: -p.dragCoefficientKgPerM * speed * f.velocityM_S.x, y: -p.dragCoefficientKgPerM * speed * f.velocityM_S.y, z: -p.dragCoefficientKgPerM * speed * f.velocityM_S.z };
  const dragB = rotate(conj(f.quaternion), dragW);
  return {
    gyroRad_S: { ...f.angularVelocityRad_S },
    accelM_S2: { x: dragB.x / p.massKg, y: dragB.y / p.massKg, z: (w.thrustN + dragB.z) / p.massKg },
    kind: "derived" as const,
  };
}

export type LessonId = "gravity" | "thrust" | "equilibrium" | "climb" | "pitch" | "roll" | "yaw" | "momentum" | "imu" | "pid";

export type LessonNote = { id: LessonId; title: string; body: string; equation: string };

export type PilotLike = { throttle: number; roll: number; pitch: number; yaw: number };

/**
 * Picks the note that explains what the aircraft is doing right now.
 * Uses mission.ts's ±0.35 N band for thrust vs weight. Notes are worded
 * with physical left/right.
 */
export function activeNote(f: LessonInput, pilot: PilotLike, p: LessonParams, onGround: boolean): LessonNote {
  const fb = forceBreakdown(f, p);
  const T = fb.thrustN.value;
  const W = fb.weightN.value;
  const Tv = fb.verticalThrustN.value;
  const fmt = (n: number) => n.toFixed(2);
  if (Math.abs(pilot.pitch) > 0 && fb.tiltDeg.value > 2) {
    return { id: "pitch", title: pilot.pitch > 0 ? "Pitching forward" : "Pitching back", body: `The thrust vector tilts ${fb.tiltDeg.value.toFixed(1)}° with the airframe. ${fmt(fb.horizontalThrustN.value)} N now pushes horizontally; ${fmt(Tv)} N still holds you up against ${fmt(W)} N.`, equation: `T_h = T·sin θ = ${fmt(T)} × sin ${fb.tiltDeg.value.toFixed(1)}°` };
  }
  if (Math.abs(pilot.roll) > 0 && fb.tiltDeg.value > 2) {
    return { id: "roll", title: pilot.roll > 0 ? "Rolling right" : "Rolling left", body: `Rolling tips thrust sideways: ${fmt(fb.horizontalThrustN.value)} N of lateral force. Keep ${fmt(fb.hoverThrustAtTiltN.value)} N total to hold height at this tilt.`, equation: "T_needed = mg / cos θ" };
  }
  if (Math.abs(pilot.yaw) > 0) {
    return { id: "yaw", title: pilot.yaw > 0 ? "Yawing right" : "Yawing left", body: `Counter-rotating pairs change speed in opposite directions. Total thrust stays ${fmt(T)} N, but the reaction torques no longer cancel: τz = ${fb.torque.tauZ.toFixed(4)} N·m.`, equation: "τz = k(T0 − T1 + T2 − T3)" };
  }
  if (onGround && T < W - 0.35) {
    return T < 0.05
      ? { id: "gravity", title: "Gravity", body: `Weight pulls down with ${fmt(W)} N. With no thrust the ground carries all of it.`, equation: `W = m·g = ${p.massKg} × ${p.gravityM_S2}` }
      : { id: "thrust", title: "Building thrust", body: `Propellers push ${fmt(T)} N up. Still less than weight (${fmt(W)} N), so the ground carries the rest.`, equation: "lift-off when T > mg" };
  }
  if (Tv > W + 0.35) {
    return { id: "climb", title: "Climbing", body: `Vertical thrust ${fmt(Tv)} N exceeds weight ${fmt(W)} N. Net acceleration ${fb.verticalAccel.value.toFixed(2)} m/s² upward (drag included).`, equation: "a = (T_v − mg + D_z) / m" };
  }
  if (Tv < W - 0.35) {
    return { id: "thrust", title: "Descending", body: `Vertical thrust ${fmt(Tv)} N is below weight ${fmt(W)} N, so the aircraft accelerates downward.`, equation: "a = (T_v − mg + D_z) / m" };
  }
  const vh = Math.hypot(f.velocityM_S.x, f.velocityM_S.y);
  if (vh > 0.8) {
    const d = stoppingDistance(f, p);
    return { id: "momentum", title: "Carrying momentum", body: `Level sticks do not stop you. At ${vh.toFixed(1)} m/s, full braking tilt needs about ${d.value.toFixed(1)} m (estimate, no drag).`, equation: "d ≈ v² / (2 g tan θmax)" };
  }
  return { id: "equilibrium", title: "Hover", body: `Thrust ${fmt(T)} N balances weight ${fmt(W)} N. Net force near zero, so vertical speed stops changing.`, equation: "T ≈ mg" };
}
