import type { MotorQuad, VehicleParamsLike } from "./types.ts";

/**
 * Motor geometry derived from the repo's own math, not from its comments.
 *
 * sim/rigidBody.ts motorTorque():
 *   tau.x =  a(-u0 + u1 + u2 - u3)
 *   tau.y = -a( u0 + u1 - u2 - u3)
 *   tau.z = km( u0 - u1 + u2 - u3)
 * with tau = r x F and F = (0, 0, u) this places
 *   u0 at (+a, -a), u1 at (+a, +a), u2 at (-a, +a), u3 at (-a, -a).
 *
 * Body +y is LEFT of the nose (right-handed, z up), so physically:
 *   M0 front-right, M1 front-left, M2 rear-left, M3 rear-right.
 * The repo comments say "Motor 0 is front-left"; that is the mirrored reading.
 *
 * Spin: body torque from motor i is +km*u for i = 0, 2. A rotor's drag torque
 * on the body opposes its spin, so rotors 0 and 2 spin clockwise seen from
 * above, rotors 1 and 3 counter-clockwise. In a z-up Three.js scene a
 * positive rotation about +z is counter-clockwise from above.
 *
 * This is STRATA's convention. It is not PX4's default Quad X numbering.
 */

export type MotorInfo = {
  index: 0 | 1 | 2 | 3;
  /** Body-frame centre, metres (y is left). */
  bodyX: number;
  bodyY: number;
  label: "front right" | "front left" | "rear left" | "rear right";
  short: "FR" | "FL" | "RL" | "RR";
  /** Seen from above. */
  spin: "CW" | "CCW";
  /** Sign for rotation.z += sign * omega * dt in a z-up scene. */
  spinSign: 1 | -1;
};

export function motorLayout(params: Pick<VehicleParamsLike, "motorRadiusM">): MotorInfo[] {
  const a = params.motorRadiusM * Math.SQRT1_2;
  return [
    { index: 0, bodyX: a, bodyY: -a, label: "front right", short: "FR", spin: "CW", spinSign: -1 },
    { index: 1, bodyX: a, bodyY: a, label: "front left", short: "FL", spin: "CCW", spinSign: 1 },
    { index: 2, bodyX: -a, bodyY: a, label: "rear left", short: "RL", spin: "CW", spinSign: -1 },
    { index: 3, bodyX: -a, bodyY: -a, label: "rear right", short: "RR", spin: "CCW", spinSign: 1 },
  ];
}

export type Wrench = {
  /** Sum of motor thrusts along body +z, N. */
  thrustN: number;
  /** Body torque, N·m, right-handed about body x (nose), y (left), z (up). */
  tauX: number;
  tauY: number;
  tauZ: number;
};

/**
 * Same formula as sim/rigidBody.ts motorTorque() plus the thrust sum.
 * tests/motorLayout.test.ts asserts equality against the repo function.
 * Clamping to [0, T_max/4] is the caller's job, exactly as in the sim.
 */
export function wrenchFromMotors(m: MotorQuad, params: Pick<VehicleParamsLike, "motorRadiusM" | "yawTorquePerNewtonM">): Wrench {
  const a = params.motorRadiusM * Math.SQRT1_2;
  const km = params.yawTorquePerNewtonM;
  const [u0, u1, u2, u3] = m;
  return {
    thrustN: u0 + u1 + u2 + u3,
    tauX: a * (-u0 + u1 + u2 - u3),
    tauY: -a * (u0 + u1 - u2 - u3),
    tauZ: km * (u0 - u1 + u2 - u3),
  };
}

/** Plain-language reading of a body wrench, using physical left/right. */
export function describeWrench(w: Wrench, epsilonNm = 1e-4): { roll: string; pitch: string; yaw: string } {
  // tau.x > 0 rotates +y (left side) UP about +x: right side drops, aircraft rolls right.
  const roll = Math.abs(w.tauX) < epsilonNm ? "none" : w.tauX > 0 ? "rolls right (right side down)" : "rolls left (left side down)";
  // tau.y > 0 rotates +x (nose) down about +y.
  const pitch = Math.abs(w.tauY) < epsilonNm ? "none" : w.tauY > 0 ? "pitches nose down" : "pitches nose up";
  // tau.z > 0 is counter-clockwise from above: nose turns left.
  const yaw = Math.abs(w.tauZ) < epsilonNm ? "none" : w.tauZ > 0 ? "yaws left (CCW from above)" : "yaws right (CW from above)";
  return { roll, pitch, yaw };
}

/** Each motor's deviation from the mean, N. Positive = working harder than average. */
export function motorDeltas(m: MotorQuad): [number, number, number, number] {
  const mean = (m[0] + m[1] + m[2] + m[3]) / 4;
  return [m[0] - mean, m[1] - mean, m[2] - mean, m[3] - mean];
}
