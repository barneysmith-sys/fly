import {
  add,
  cross,
  length,
  quatFromRotVec,
  quatMul,
  quatNormalize,
  rotateBodyToWorld,
  scale,
  sub,
  type Vec3,
} from "./math.ts";
import { type MotorsN, type VehicleParams, type VehicleState } from "./vehicle.ts";

export const EQUATION_TRANSLATION = "m*a = R(q)*[0,0,T] + [0,0,-m*g] - c_d*|v|*v";
export const EQUATION_ROTATION = "I*alpha = tau - omega × (I*omega)";
export const EQUATION_QUATERNION = "q_next = normalize(q ⊗ Exp(omega * dt))";
export const EQUATION_POSITION = "p_next = p + v*dt + 0.5*a*dt*dt";

export type StepResult = {
  state: VehicleState;
  worldAccelerationM_S2: Vec3;
  bodyTorqueN_M: Vec3;
  thrustN: number;
  motorsN: MotorsN;
};

/**
 * Advance the rigid body by one zero-order-held motor command.
 *
 * Translation uses the exact constant-acceleration update because force is
 * frozen for the step. Rotation uses the body torque at the start of the
 * step, then the quaternion exponential map of the angular velocity held
 * from the start of the step. Angular velocity is then explicit-Euler
 * updated. Quaternion is renormalized.
 *
 * Motor thrusts are clamped to [0, T_max/4] before they enter the wrench.
 */
export function stepRigidBody(
  state: VehicleState,
  motorCommandN: MotorsN,
  dt: number,
  params: VehicleParams,
): StepResult {
  if (dt <= 0) {
    throw new Error("dt must be > 0");
  }
  const motorMax = params.thrustMaxN / 4;
  const motorsN = motorCommandN.map((thrust) => clampThrust(thrust, motorMax)) as MotorsN;
  const thrustN = motorsN[0] + motorsN[1] + motorsN[2] + motorsN[3];
  const bodyTorque = motorTorque(motorsN, params);
  const worldAcceleration = worldAccelerationOf(state, thrustN, params);
  const alpha = angularAcceleration(state.angularVelocityRad_S, bodyTorque, params.inertiaKgM2);

  const velocity = add(state.velocityM_S, scale(worldAcceleration, dt));
  const position = add(
    add(state.positionM, scale(state.velocityM_S, dt)),
    scale(worldAcceleration, 0.5 * dt * dt),
  );
  const quaternion = quatNormalize(
    quatMul(state.quaternion, quatFromRotVec(scale(state.angularVelocityRad_S, dt))),
  );
  const angularVelocity = add(state.angularVelocityRad_S, scale(alpha, dt));

  return {
    state: {
      timeS: state.timeS + dt,
      positionM: position,
      velocityM_S: velocity,
      quaternion,
      angularVelocityRad_S: angularVelocity,
    },
    worldAccelerationM_S2: worldAcceleration,
    bodyTorqueN_M: bodyTorque,
    thrustN,
    motorsN,
  };
}

export function worldAccelerationOf(state: VehicleState, thrustN: number, params: VehicleParams): Vec3 {
  const thrustWorld = rotateBodyToWorld(state.quaternion, { x: 0, y: 0, z: thrustN });
  const speed = length(state.velocityM_S);
  const drag = scale(state.velocityM_S, -params.dragCoefficientKgPerM * speed);
  const weight = { x: 0, y: 0, z: -params.massKg * params.gravityM_S2 };
  return scale(add(add(thrustWorld, weight), drag), 1 / params.massKg);
}

/** X-configuration wrench. See docs/RIGID_BODY.md for the motor order. */
export function motorTorque(motorsN: MotorsN, params: VehicleParams): Vec3 {
  const a = params.motorRadiusM * Math.SQRT1_2;
  const [u0, u1, u2, u3] = motorsN;
  const km = params.yawTorquePerNewtonM;
  return {
    x: a * (-u0 + u1 + u2 - u3),
    y: -a * (u0 + u1 - u2 - u3),
    z: km * (u0 - u1 + u2 - u3),
  };
}

export function mixMotors(totalThrustN: number, torqueN_M: Vec3, params: VehicleParams): MotorsN {
  const a = params.motorRadiusM * Math.SQRT1_2;
  const km = params.yawTorquePerNewtonM;
  const dx = torqueN_M.x / (4 * a);
  const dy = torqueN_M.y / (4 * a);
  const dz = Math.abs(km) < 1e-9 ? 0 : torqueN_M.z / (4 * km);
  const c = totalThrustN / 4;
  const motorMax = params.thrustMaxN / 4;
  return [
    clampThrust(c - dx - dy + dz, motorMax),
    clampThrust(c + dx - dy - dz, motorMax),
    clampThrust(c + dx + dy + dz, motorMax),
    clampThrust(c - dx + dy - dz, motorMax),
  ];
}

function angularAcceleration(omega: Vec3, torque: Vec3, inertia: Vec3): Vec3 {
  const iw = { x: inertia.x * omega.x, y: inertia.y * omega.y, z: inertia.z * omega.z };
  const coupling = cross(omega, iw);
  const net = sub(torque, coupling);
  return { x: net.x / inertia.x, y: net.y / inertia.y, z: net.z / inertia.z };
}

function clampThrust(thrustN: number, motorMaxN: number): number {
  if (thrustN < 0) {
    return 0;
  }
  if (thrustN > motorMaxN) {
    return motorMaxN;
  }
  return thrustN;
}
