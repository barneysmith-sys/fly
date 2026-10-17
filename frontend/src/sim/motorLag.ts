import type { MotorsN } from "./vehicle.ts";

/**
 * First-order lag from the mixer command to the thrust that enters the rigid body.
 * This is a stand-in for motor spool-up. It is not an electrical ESC model.
 */
export function lagMotors(current: MotorsN, command: MotorsN, dt: number, tauS: number): MotorsN {
  const tau = Math.max(tauS, 1e-4);
  const alpha = 1 - Math.exp(-dt / tau);
  return current.map((motor, index) => motor + (command[index] - motor) * alpha) as MotorsN;
}
