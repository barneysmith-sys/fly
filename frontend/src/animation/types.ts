/**
 * Structural types shared by every STRATA visual controller.
 *
 * They are deliberately structural (no imports from sim/) so this folder can
 * live at frontend/src/animation in the repo without creating a dependency
 * cycle. `VehicleState`, `MotorsN` and `VehicleParams` from sim/vehicle.ts
 * satisfy these shapes as-is.
 *
 * Frames: world is +x east, +y north, +z up (metres). Body is +x nose, +z up
 * and, because the frame is right-handed, +y points to the LEFT of the nose.
 */

export type Vec3Like = { x: number; y: number; z: number };
export type QuatLike = { w: number; x: number; y: number; z: number };

/** Per-motor thrust in newtons, sim order (see motorLayout.ts). */
export type MotorQuad = readonly [number, number, number, number];

/**
 * Where motor values came from. Every UI that shows motor numbers must show
 * this tag. "sim" = StepResult.motorsN after the motor lag. "illustrative" =
 * a demo or lesson value that never entered the integrator.
 */
export type MotorSource = "sim" | "illustrative";

export type VehicleParamsLike = {
  massKg: number;
  gravityM_S2: number;
  motorRadiusM: number;
  yawTorquePerNewtonM: number;
  thrustMaxN: number;
  radiusM: number;
};

/**
 * One rendered frame of truth. Build it from the latest physics step only.
 * Visual controllers read it; none of them may write back to the sim.
 */
export type VisualFrame = {
  timeS: number;
  positionM: Vec3Like;
  velocityM_S: Vec3Like;
  quaternion: QuatLike;
  /** Lagged thrust that entered stepRigidBody, per motor. */
  motorsN: MotorQuad;
  motorSource: MotorSource;
  /** Proposed arming state. The repo has none yet; adapters pass `true`. */
  armed: boolean;
  onGround: boolean;
  /** Indices of motors whose command is forced to zero (failure demo). */
  failedMotors?: readonly number[];
  /** Any active caution (boundary, contact). Drives the 4 Hz light state. */
  warning?: boolean;
};

export type AircraftLightState = "disarmed" | "armed" | "flight" | "landing" | "warning";
