import { clamp, rhAngles, tiltFromVerticalRad } from "./math.ts";
import { mixMotors } from "./rigidBody.ts";
import { hoverThrustN, type MotorsN, type VehicleParams, type VehicleState } from "./vehicle.ts";

/** Stick axes are dimensionless. Throttle is collective, 0 at zero thrust and 1 at T_max. */
export type PilotInput = {
  throttle: number;
  /** Positive lowers the right side. */
  roll: number;
  /** Positive lowers the nose. */
  pitch: number;
  /** Positive yaws the nose to the pilot's right. */
  yaw: number;
};

export type ControlMode = "stabilized" | "acro";

export type AttitudeGains = {
  maxTiltRad: number;
  maxRollRateRad_S: number;
  maxYawRateRad_S: number;
  attitudeKp_Rad_S: number;
  rateKpN_M_Per_Rad_S: VecRate;
};

type VecRate = { x: number; y: number; z: number };

export const NOMINAL_GAINS: AttitudeGains = {
  maxTiltRad: 0.45,
  maxRollRateRad_S: 2.2,
  maxYawRateRad_S: 1.6,
  attitudeKp_Rad_S: 4.5,
  rateKpN_M_Per_Rad_S: { x: 0.045, y: 0.045, z: 0.03 },
};

export const ZERO_INPUT: PilotInput = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };

/**
 * Cascaded attitude controller.
 * Stabilized: sticks command roll and pitch angles and a yaw rate.
 * Acro: sticks command body rates. There is no self-leveling.
 * Both modes treat throttle as collective thrust, not as an altitude hold.
 * This is not a PID with an integral state, and it is not a learned policy.
 */
export function attitudeMotors(
  state: VehicleState,
  input: PilotInput,
  mode: ControlMode,
  params: VehicleParams,
  gains: AttitudeGains = NOMINAL_GAINS,
): MotorsN {
  const angles = rhAngles(state.quaternion);
  const throttle = clamp(input.throttle, 0, 1);
  const collective = throttle * params.thrustMaxN;
  let rollTarget = 0;
  let pitchTarget = 0;
  let yawRate = 0;
  if (mode === "stabilized") {
    rollTarget = -clamp(input.roll, -1, 1) * gains.maxTiltRad;
    pitchTarget = clamp(input.pitch, -1, 1) * gains.maxTiltRad;
    yawRate = -clamp(input.yaw, -1, 1) * gains.maxYawRateRad_S;
  } else {
    rollTarget = angles.rollRh;
    pitchTarget = angles.pitchRh;
    const rollRate = -clamp(input.roll, -1, 1) * gains.maxRollRateRad_S;
    const pitchRate = clamp(input.pitch, -1, 1) * gains.maxRollRateRad_S;
    yawRate = -clamp(input.yaw, -1, 1) * gains.maxYawRateRad_S;
    return torqueToMotors(
      state,
      collective,
      {
        x: gains.rateKpN_M_Per_Rad_S.x * (rollRate - state.angularVelocityRad_S.x),
        y: gains.rateKpN_M_Per_Rad_S.y * (pitchRate - state.angularVelocityRad_S.y),
        z: gains.rateKpN_M_Per_Rad_S.z * (yawRate - state.angularVelocityRad_S.z),
      },
      params,
    );
  }
  const rateX = gains.attitudeKp_Rad_S * (rollTarget - angles.rollRh);
  const rateY = gains.attitudeKp_Rad_S * (pitchTarget - angles.pitchRh);
  return torqueToMotors(
    state,
    collective,
    {
      x: gains.rateKpN_M_Per_Rad_S.x * (rateX - state.angularVelocityRad_S.x),
      y: gains.rateKpN_M_Per_Rad_S.y * (rateY - state.angularVelocityRad_S.y),
      z: gains.rateKpN_M_Per_Rad_S.z * (yawRate - state.angularVelocityRad_S.z),
    },
    params,
  );
}

export function hoverInput(params: VehicleParams): PilotInput {
  return { ...ZERO_INPUT, throttle: hoverThrustN(params) / params.thrustMaxN };
}

export type LandingGoal = { x: number; y: number; z: number };

/**
 * Deterministic position controller for the landing pad.
 * It commands the same attitude mixer as stabilized mode. It does not learn.
 */
export function landingMotors(state: VehicleState, goal: LandingGoal, params: VehicleParams): MotorsN {
  const ex = goal.x - state.positionM.x;
  const ey = goal.y - state.positionM.y;
  const horizontal = Math.hypot(ex, ey);
  const approachZ = goal.z + 4;
  const targetZ = horizontal > 1.1 || state.positionM.z > goal.z + 5 ? approachZ : goal.z;
  const vzDes = clamp(1.15 * (targetZ - state.positionM.z), -0.65, 1.4);
  const az = clamp(2.4 * (vzDes - state.velocityM_S.z), -3.5, 5);
  const axesUp = Math.cos(tiltFromVerticalRad(state.quaternion));
  const thrust = clamp(
    (params.massKg * (params.gravityM_S2 + az)) / Math.max(0.55, axesUp),
    0,
    params.thrustMaxN,
  );
  const ax = clamp(1.05 * ex - 1.7 * state.velocityM_S.x, -2.5, 2.5);
  const ay = clamp(1.05 * ey - 1.7 * state.velocityM_S.y, -2.5, 2.5);
  const specific = Math.max(thrust / params.massKg, 1);
  const pitchTarget = clamp(ax / specific, -0.35, 0.35);
  const rollTarget = clamp(-ay / specific, -0.35, 0.35);
  const angles = rhAngles(state.quaternion);
  const gains = NOMINAL_GAINS;
  const rateX = gains.attitudeKp_Rad_S * (rollTarget - angles.rollRh);
  const rateY = gains.attitudeKp_Rad_S * (pitchTarget - angles.pitchRh);
  const yawRate = clamp(-1.2 * angles.yaw, -0.8, 0.8);
  return torqueToMotors(
    state,
    thrust,
    {
      x: gains.rateKpN_M_Per_Rad_S.x * (rateX - state.angularVelocityRad_S.x),
      y: gains.rateKpN_M_Per_Rad_S.y * (rateY - state.angularVelocityRad_S.y),
      z: gains.rateKpN_M_Per_Rad_S.z * (yawRate - state.angularVelocityRad_S.z),
    },
    params,
  );
}

/** Same vehicle, no horizontal correction. Used as the comparison baseline. */
export function verticalDescentMotors(state: VehicleState, goal: LandingGoal, params: VehicleParams): MotorsN {
  const vzDes = clamp(1.15 * (goal.z - state.positionM.z), -0.65, 1.4);
  const az = clamp(2.4 * (vzDes - state.velocityM_S.z), -3.5, 5);
  const thrust = clamp(params.massKg * (params.gravityM_S2 + az), 0, params.thrustMaxN);
  const angles = rhAngles(state.quaternion);
  const gains = NOMINAL_GAINS;
  return torqueToMotors(
    state,
    thrust,
    {
      x: gains.rateKpN_M_Per_Rad_S.x * (gains.attitudeKp_Rad_S * (0 - angles.rollRh) - state.angularVelocityRad_S.x),
      y: gains.rateKpN_M_Per_Rad_S.y * (gains.attitudeKp_Rad_S * (0 - angles.pitchRh) - state.angularVelocityRad_S.y),
      z: gains.rateKpN_M_Per_Rad_S.z * (0 - state.angularVelocityRad_S.z),
    },
    params,
  );
}

function torqueToMotors(
  _state: VehicleState,
  collectiveN: number,
  torqueN_M: { x: number; y: number; z: number },
  params: VehicleParams,
): MotorsN {
  return mixMotors(collectiveN, torqueN_M, params);
}
