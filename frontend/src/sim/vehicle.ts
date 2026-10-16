import { GRAVITY_M_S2, IDENTITY_QUAT, type Quat, type Vec3, v } from "./math.ts";

/**
 * Nominal small quadcopter. The numbers are round teaching values, not a
 * weighed airframe. Inertia is diagonal in the body frame.
 *
 * X layout, viewed from above. Motor 0 is front-left.
 * Distance from the center to each motor is `motorRadiusM`.
 */
export type VehicleParams = {
  massKg: number;
  gravityM_S2: number;
  inertiaKgM2: Vec3;
  motorRadiusM: number;
  yawTorquePerNewtonM: number;
  thrustMaxN: number;
  dragCoefficientKgPerM: number;
  /** Collision sphere around the center of mass. */
  radiusM: number;
};

export type VehicleState = {
  timeS: number;
  positionM: Vec3;
  velocityM_S: Vec3;
  /** Body-to-world attitude. */
  quaternion: Quat;
  /** Body-frame angular velocity, rad/s. */
  angularVelocityRad_S: Vec3;
};

export type MotorsN = [number, number, number, number];

export const NOMINAL_VEHICLE: VehicleParams = {
  massKg: 0.65,
  gravityM_S2: GRAVITY_M_S2,
  inertiaKgM2: { x: 0.003, y: 0.003, z: 0.005 },
  motorRadiusM: 0.12,
  yawTorquePerNewtonM: 0.02,
  thrustMaxN: 0.65 * GRAVITY_M_S2 * 3.2,
  dragCoefficientKgPerM: 0.08,
  radiusM: 0.18,
};

export function hoverThrustN(params: VehicleParams): number {
  return params.massKg * params.gravityM_S2;
}

export function equalMotors(totalThrustN: number): MotorsN {
  const each = totalThrustN / 4;
  return [each, each, each, each];
}

export function vehicleState(partial: Partial<VehicleState> = {}): VehicleState {
  return {
    timeS: partial.timeS ?? 0,
    positionM: partial.positionM ?? v(0, 0, 2),
    velocityM_S: partial.velocityM_S ?? v(),
    quaternion: partial.quaternion ?? IDENTITY_QUAT,
    angularVelocityRad_S: partial.angularVelocityRad_S ?? v(),
  };
}
