/** Vectors and quaternions for the z-up rigid-body model. */

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { w: number; x: number; y: number; z: number };

export const GRAVITY_M_S2 = 9.80665;

export function v(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function norm(a: Vec3): Vec3 {
  const mag = length(a);
  if (mag < 1e-12) {
    return { x: 0, y: 0, z: 0 };
  }
  return scale(a, 1 / mag);
}

export function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

export const IDENTITY_QUAT: Quat = { w: 1, x: 0, y: 0, z: 0 };

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatNormalize(q: Quat): Quat {
  const mag = Math.hypot(q.w, q.x, q.y, q.z);
  if (mag < 1e-12) {
    return IDENTITY_QUAT;
  }
  return { w: q.w / mag, x: q.x / mag, y: q.y / mag, z: q.z / mag };
}

/** Unit quaternion for a right-handed rotation of `angleRad` about `axis`. */
export function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const half = angleRad * 0.5;
  const s = Math.sin(half);
  const n = norm(axis);
  return { w: Math.cos(half), x: n.x * s, y: n.y * s, z: n.z * s };
}

/** Quaternion exponential of a rotation vector (axis * angle, radians). */
export function quatFromRotVec(rot: Vec3): Quat {
  const angle = length(rot);
  if (angle < 1e-12) {
    return quatNormalize({ w: 1, x: rot.x * 0.5, y: rot.y * 0.5, z: rot.z * 0.5 });
  }
  const half = angle * 0.5;
  const s = Math.sin(half) / angle;
  return { w: Math.cos(half), x: rot.x * s, y: rot.y * s, z: rot.z * s };
}

/** Rotate a body-frame vector into the world frame. q is body-to-world. */
export function rotateBodyToWorld(q: Quat, body: Vec3): Vec3 {
  const p: Quat = { w: 0, x: body.x, y: body.y, z: body.z };
  const r = quatMul(quatMul(q, p), { w: q.w, x: -q.x, y: -q.y, z: -q.z });
  return { x: r.x, y: r.y, z: r.z };
}

export type BodyAxes = { forward: Vec3; right: Vec3; up: Vec3 };

export function bodyAxes(q: Quat): BodyAxes {
  return {
    forward: rotateBodyToWorld(q, { x: 1, y: 0, z: 0 }),
    right: rotateBodyToWorld(q, { x: 0, y: 1, z: 0 }),
    up: rotateBodyToWorld(q, { x: 0, y: 0, z: 1 }),
  };
}

/**
 * Right-handed Euler angles extracted from the body axes.
 * Body +y is left of the nose. rollRh > 0 lifts that side, so the right wing goes down.
 * pitchRh > 0 lowers the nose.
 * yaw is 0 when the nose points east (+x) and increases toward north (+y).
 */
export function rhAngles(q: Quat): { rollRh: number; pitchRh: number; yaw: number } {
  const axes = bodyAxes(q);
  const pitchRh = Math.atan2(-axes.forward.z, Math.hypot(axes.forward.x, axes.forward.y));
  const yaw = Math.atan2(axes.forward.y, axes.forward.x);
  const rollRh = Math.atan2(axes.right.z, axes.up.z);
  return { rollRh, pitchRh, yaw };
}

/** Degrees clockwise from north. 0 is north, 90 is east. */
export function headingDegFromNorth(q: Quat): number {
  const forward = rotateBodyToWorld(q, { x: 1, y: 0, z: 0 });
  const deg = (Math.atan2(forward.x, forward.y) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

export function tiltFromVerticalRad(q: Quat): number {
  const up = rotateBodyToWorld(q, { x: 0, y: 0, z: 1 });
  const c = clamp(up.z, -1, 1);
  return Math.acos(c);
}
