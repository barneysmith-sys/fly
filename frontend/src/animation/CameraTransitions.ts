import * as THREE from "three";
import type { QuatLike, Vec3Like } from "./types.ts";

/**
 * Cameras read the frame and never write to it. Values from design board 12.
 *
 * ChaseRig    critically damped spring, heading-only follow, world-up kept
 * placeFpv    hard-locked to the body (no damping: it must tell the truth)
 * OrbitRig    pointer-driven inspection around a target
 * CameraTween eased blend between two camera poses (FPV is always a cut)
 */

export const CHASE_TRUE_SCALE = { backM: 2.4, rightM: 0.35, upM: 0.9, lookAheadM: 0.8, lookUpM: 0.1, fovDeg: 55, posOmega: 8, headingOmega: 10, minDistanceM: 0.6 };
export const FPV = { fovDeg: 74 };

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Critically damped spring step (exact for constant target). */
function springStep(x: number, v: number, target: number, omega: number, dt: number): [number, number] {
  const e = Math.exp(-omega * dt);
  const d = x - target;
  const temp = (v + omega * d) * dt;
  return [target + (d + temp) * e, (v - omega * temp) * e];
}

export type RaycastFn = (from: THREE.Vector3, to: THREE.Vector3) => number | null;

export class ChaseRig {
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private heading = 0;
  private headingVel = 0;
  private initialised = false;
  constructor(private readonly cfg = CHASE_TRUE_SCALE, private readonly raycast?: RaycastFn) {}

  reset() {
    this.initialised = false;
  }

  /** Returns where the camera should be; apply with apply(). */
  update(position: Vec3Like, quaternion: QuatLike, dt: number) {
    const q = new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const targetHeading = Math.atan2(fwd.y, fwd.x);
    if (!this.initialised) {
      this.heading = targetHeading;
      this.headingVel = 0;
    } else {
      let d = targetHeading - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      [this.heading, this.headingVel] = springStep(this.heading, this.headingVel, this.heading + d, this.cfg.headingOmega, dt);
    }
    const flatFwd = new THREE.Vector3(Math.cos(this.heading), Math.sin(this.heading), 0);
    // Body +y is left, so the camera's right is -left.
    const right = new THREE.Vector3(Math.sin(this.heading), -Math.cos(this.heading), 0);
    const p = new THREE.Vector3(position.x, position.y, position.z);
    const desired = p.clone().addScaledVector(flatFwd, -this.cfg.backM).addScaledVector(right, this.cfg.rightM).add(new THREE.Vector3(0, 0, this.cfg.upM));
    if (this.raycast) {
      const hit = this.raycast(p, desired);
      if (hit !== null) {
        const dir = desired.clone().sub(p).normalize();
        desired.copy(p).addScaledVector(dir, Math.max(this.cfg.minDistanceM, hit - 0.3));
      }
    }
    if (!this.initialised) {
      this.pos.copy(desired);
      this.vel.set(0, 0, 0);
      this.initialised = true;
    } else {
      for (const k of ["x", "y", "z"] as const) {
        const [x, v] = springStep(this.pos[k], this.vel[k], desired[k], this.cfg.posOmega, dt);
        this.pos[k] = x;
        this.vel[k] = v;
      }
    }
    const look = p.clone().addScaledVector(flatFwd, this.cfg.lookAheadM).add(new THREE.Vector3(0, 0, this.cfg.lookUpM));
    return { position: this.pos.clone(), lookAt: look, up: new THREE.Vector3(0, 0, 1), fov: this.cfg.fovDeg };
  }
}

/** FPV pose from the body pose and the model's fpv anchor (body frame). */
export function placeFpv(position: Vec3Like, quaternion: QuatLike, anchorBody: Vec3Like, uptiltRad: number) {
  const q = new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  const pos = new THREE.Vector3(anchorBody.x, anchorBody.y, anchorBody.z).applyQuaternion(q).add(new THREE.Vector3(position.x, position.y, position.z));
  const dirBody = new THREE.Vector3(Math.cos(uptiltRad), 0, Math.sin(uptiltRad));
  const upBody = new THREE.Vector3(-Math.sin(uptiltRad), 0, Math.cos(uptiltRad));
  return { position: pos, lookAt: pos.clone().add(dirBody.applyQuaternion(q)), up: upBody.applyQuaternion(q), fov: FPV.fovDeg };
}

export type CameraPose = { position: THREE.Vector3; lookAt: THREE.Vector3; up: THREE.Vector3; fov: number };

export function applyPose(camera: THREE.PerspectiveCamera, pose: CameraPose) {
  camera.position.copy(pose.position);
  camera.up.copy(pose.up);
  camera.lookAt(pose.lookAt);
  if (Math.abs(camera.fov - pose.fov) > 1e-3) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}

export class OrbitRig {
  azimuth = -2.3;
  polar = 0.45;
  distance = 0.7;
  target = new THREE.Vector3();
  minDistance = 0.12;
  maxDistance = 6;
  pose(): CameraPose {
    const c = Math.cos(this.polar);
    const position = this.target.clone().add(new THREE.Vector3(Math.cos(this.azimuth) * c, Math.sin(this.azimuth) * c, Math.sin(this.polar)).multiplyScalar(this.distance));
    return { position, lookAt: this.target.clone(), up: new THREE.Vector3(0, 0, 1), fov: 40 };
  }
  drag(dxPx: number, dyPx: number) {
    this.azimuth -= dxPx * 0.008;
    this.polar = THREE.MathUtils.clamp(this.polar + dyPx * 0.006, -0.2, 1.45);
  }
  zoom(deltaY: number) {
    this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(deltaY * 0.0012), this.minDistance, this.maxDistance);
  }
}

/**
 * Eased blend from one pose to another. Position lerps, look target lerps,
 * up slerps. Duration defaults to 0.9 s with ease-in-out-sine, which keeps
 * angular velocity low at both ends (less disorienting than linear).
 */
export class CameraTween {
  private t = 1;
  private from: CameraPose | null = null;
  constructor(public durationS = 0.9, public ease: (t: number) => number = easeInOutSine) {}
  start(from: CameraPose, durationS = this.durationS) {
    this.from = { position: from.position.clone(), lookAt: from.lookAt.clone(), up: from.up.clone(), fov: from.fov };
    this.durationS = durationS;
    this.t = 0;
  }
  get active() {
    return this.t < 1 && this.from !== null;
  }
  /** Blend toward a moving target pose. */
  step(to: CameraPose, dt: number): CameraPose {
    if (!this.from || this.t >= 1) return to;
    this.t = Math.min(1, this.t + dt / this.durationS);
    const k = this.ease(this.t);
    return {
      position: this.from.position.clone().lerp(to.position, k),
      lookAt: this.from.lookAt.clone().lerp(to.lookAt, k),
      up: this.from.up.clone().lerp(to.up, k).normalize(),
      fov: this.from.fov + (to.fov - this.from.fov) * k,
    };
  }
}

/** Named transitions from the motion spec. Durations in seconds. */
export const TRANSITIONS = {
  homeToInspection: { durationS: 1.6, ease: "easeInOutSine" },
  inspectionToPad: { durationS: 1.4, ease: "easeInOutSine" },
  chaseToFpv: { durationS: 0, ease: "cut" },
  overviewToFlight: { durationS: 1.2, ease: "easeInOutSine" },
  missionComplete: { durationS: 2.4, ease: "easeInOutSine" },
  anatomySelect: { durationS: 0.7, ease: "easeOutCubic" },
  explodedView: { durationS: 1.4, ease: "easeInOutCubic" },
  debrief: { durationS: 1.8, ease: "easeInOutSine" },
} as const;
