import { NOMINAL_GAINS, type AttitudeGains } from "./control.ts";
import { hoverThrustN, NOMINAL_VEHICLE, type VehicleParams } from "./vehicle.ts";

/**
 * EXPLORER-4 is an original teaching quadcopter. The numbers are the nominal
 * rigid-body vehicle. They are not specifications of any manufactured aircraft.
 */

export type PartId = "airframe" | "propeller" | "motor" | "controller" | "axes" | "sensors" | "pilot" | "limits";

export type PartBrief = {
  id: PartId;
  title: string;
  short: string;
  detail: string;
};

export type Aircraft = {
  id: "explorer-4";
  name: string;
  role: string;
  params: VehicleParams;
  gains: AttitudeGains;
  /** Motor command time constant, seconds. */
  motorTauS: number;
  parts: PartBrief[];
};

export const EXPLORER_4: Aircraft = {
  id: "explorer-4",
  name: "EXPLORER-4",
  role: "Training quadcopter",
  params: NOMINAL_VEHICLE,
  gains: NOMINAL_GAINS,
  motorTauS: 0.06,
  parts: briefs(NOMINAL_VEHICLE, 0.06),
};

function briefs(params: VehicleParams, tauS: number): PartBrief[] {
  const weight = hoverThrustN(params);
  const tw = params.thrustMaxN / weight;
  return [
    {
      id: "airframe",
      title: "Airframe",
      short: "A small X-layout quadcopter for stabilized training.",
      detail: `Four rotors on a ${params.motorRadiusM.toFixed(2)} m arm. Mass ${params.massKg.toFixed(2)} kg. The body axes are x forward, y right, z up. This is a fictional training airframe, not a copy of a production vehicle.`,
    },
    {
      id: "propeller",
      title: "Propellers",
      short: "Spinning rotors produce an upward force in the body frame.",
      detail: `The simulation does not resolve individual blades. Each motor contributes a force along body z. Together they are the thrust T in m·a = R(q)·[0,0,T] + weight + drag. At hover, T equals weight, ${weight.toFixed(2)} N.`,
    },
    {
      id: "motor",
      title: "Motors",
      short: "A thrust command becomes force after a short lag.",
      detail: `There is no separate electronic speed controller state. The mixer asks each motor for a thrust, then a first-order lag of ${tauS.toFixed(2)} s stands in for spool-up. Each motor is clamped to 0…${(params.thrustMaxN / 4).toFixed(2)} N.`,
    },
    {
      id: "controller",
      title: "Flight controller",
      short: "Stabilized mode levels the aircraft. It is not an autopilot.",
      detail:
        "Stabilized mode commands a roll angle, a pitch angle, and a yaw rate, then a proportional rate loop. Acro mode commands body rates and does not level. There is no integral term and no learned policy. Throttle is collective thrust, not an altitude hold.",
    },
    {
      id: "axes",
      title: "Pitch, roll, and yaw",
      short: "Stick axes tilt or twist the thrust vector.",
      detail:
        "Pitch forward lowers the nose and tips thrust toward body x, so the aircraft moves forward and loses some vertical support. Roll right lowers the right side. Yaw rate spins the nose about body z. With the nose level and the sticks centered, stabilized mode drives roll and pitch back toward zero.",
    },
    {
      id: "sensors",
      title: "Sensors",
      short: "The stabilizer reads the truth state. No IMU or GPS is modeled.",
      detail:
        "Attitude and angular rate on the controller are the integrator's own values, not an estimate. The FPV view is a camera locked to the body pose. It does not detect the scene. Position on the HUD is the simulated position. A navigation filter is not part of this aircraft.",
    },
    {
      id: "pilot",
      title: "Pilot input",
      short: "Held keys keep commanding. Releasing the stick recenters it.",
      detail:
        "W and S raise and lower collective thrust. A and D yaw. The arrow keys pitch and roll. The command lasts while the key is down. A gamepad, when the browser exposes one, uses the left stick, the right-stick X axis, and the triggers for the same channels.",
    },
    {
      id: "limits",
      title: "Limits",
      short: `Thrust saturates at ${tw.toFixed(1)} times weight.`,
      detail: `Maximum thrust is ${params.thrustMaxN.toFixed(2)} N. Stabilized tilt is limited to ${(NOMINAL_GAINS.maxTiltRad * 180 / Math.PI).toFixed(0)}°. There is no wind, no motor failure model, and no landing gear force. Contact is a sphere of radius ${params.radiusM.toFixed(2)} m. The bay surface is solid ground, not water you can sink into.`,
    },
  ];
}
