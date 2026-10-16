import type { ModelDocument, Sample, SimulationConfig, SimulationResponse, Summary } from "../types";

/**
 * Browser copy of the open-loop 1D plant. It is the same equation as the Python
 * model, used when this host has no Python process. It is not a second physics
 * theory and it does not run the closed-loop experiments.
 */

export const BROWSER_MODEL: ModelDocument = {
  name: "AEROSIM vertical point mass",
  version: "0.2.0",
  equations: {
    kinematics: "dz/dt = v",
    translation: "m*dv/dt = T - m*g - c_d*|v|*v + F_ext",
    saturation: "T = clamp(T_cmd, T_min, T_max)",
    rk4: "x_next = x + (dt/6) * (k1 + 2*k2 + 2*k3 + k4)",
  },
  units: { altitude: "m", force: "N", mass: "kg" },
  unit_notes: [
    {
      quantity: "Weight",
      symbol: "mg",
      unit: "N",
      primary: true,
      plain: "Mass times the gravity used by this run.",
    },
  ],
  conventions: ["z is positive upward."],
  assumptions: ["Thrust is held constant between samples."],
  limitations: [
    "This browser copy integrates the open-loop vertical equation only. Closed-loop lab experiments stay on the Python API.",
  ],
  hold_acceleration_band_m_s2: 0.05,
  weight_check_tolerance_n: 0.05,
  standard_gravity_m_s2: 9.80665,
};

export function runOpenLoop(config: SimulationConfig): SimulationResponse {
  return runPlant({ ...config, control_mode: "open_loop" });
}

/** Same sample clock as the Python runner: command, record, then RK4. */
export function runPlant(config: SimulationConfig): SimulationResponse {
  const steps = Math.round(config.duration_s / config.timestep_s);
  let altitude = config.initial_altitude_m;
  let velocity = config.initial_vertical_velocity_m_s;
  let integral = 0;
  const samples: Sample[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const command = commandAt(config, altitude, velocity, integral);
    integral = command.integral;
    const accel = reportedAccel(altitude, velocity, command.thrust, config);
    samples.push({
      time_s: index * config.timestep_s,
      altitude_m: altitude,
      vertical_velocity_m_s: velocity,
      vertical_acceleration_m_s2: accel,
      thrust_n: command.thrust,
      thrust_command_n: command.command,
      target_altitude_m: config.target_altitude_m,
      altitude_error_m: command.error,
      integral_m_s: command.integral,
      feedforward_n: command.feedforward,
      proportional_n: command.proportional,
      integral_term_n: command.integralTerm,
      derivative_n: command.derivative,
      saturated: command.saturated,
    });
    if (index === steps) {
      break;
    }
    const next = stepVertical(altitude, velocity, command.thrust, config);
    altitude = next.altitude;
    velocity = next.velocity;
  }
  return {
    scenario_id: null,
    config,
    model: BROWSER_MODEL,
    samples,
    summary: summarize(samples, config),
    acceptance: {
      passed: false,
      settle_time_s: config.duration_s,
      altitude_tolerance_m: 0,
      velocity_tolerance_m_s: 0,
      criteria: [],
    },
    plant: "browser",
  };
}

export function classifyMotion(acceleration: number): Summary["initial_motion"] {
  if (acceleration > BROWSER_MODEL.hold_acceleration_band_m_s2) {
    return "climb";
  }
  if (acceleration < -BROWSER_MODEL.hold_acceleration_band_m_s2) {
    return "descend";
  }
  return "hold";
}

function summarize(samples: Sample[], config: SimulationConfig): Summary {
  const final = samples[samples.length - 1];
  return {
    sample_count: samples.length,
    initial_altitude_m: samples[0].altitude_m,
    final_time_s: final.time_s,
    final_altitude_m: final.altitude_m,
    final_vertical_velocity_m_s: final.vertical_velocity_m_s,
    final_thrust_n: final.thrust_n,
    final_altitude_error_m: final.altitude_error_m,
    minimum_altitude_m: Math.min(...samples.map((sample) => sample.altitude_m)),
    maximum_altitude_m: Math.max(...samples.map((sample) => sample.altitude_m)),
    maximum_abs_vertical_velocity_m_s: Math.max(...samples.map((sample) => Math.abs(sample.vertical_velocity_m_s))),
    hover_thrust_n: config.mass_kg * config.gravity_m_s2,
    initial_vertical_acceleration_m_s2: samples[0].vertical_acceleration_m_s2,
    final_vertical_acceleration_m_s2: final.vertical_acceleration_m_s2,
    initial_motion: classifyMotion(samples[0].vertical_acceleration_m_s2),
  };
}

function commandAt(config: SimulationConfig, altitude: number, velocity: number, integral: number): {
  thrust: number;
  command: number;
  error: number;
  integral: number;
  feedforward: number;
  proportional: number;
  integralTerm: number;
  derivative: number;
  saturated: boolean;
} {
  if (config.control_mode === "open_loop") {
    const requested = config.open_loop_thrust_n ?? 0;
    const thrust = clamp(requested, config.thrust_min_n, config.thrust_max_n);
    return {
      thrust,
      command: requested,
      error: config.target_altitude_m - altitude,
      integral: 0,
      feedforward: 0,
      proportional: 0,
      integralTerm: 0,
      derivative: 0,
      saturated: thrust !== requested,
    };
  }
  const error = config.target_altitude_m - altitude;
  const feedforward = config.mass_kg * config.gravity_m_s2;
  const proportional = config.kp_n_per_m * error;
  const derivative = config.kd_n_s_per_m * (config.velocity_reference_m_s - velocity);
  const candidateIntegral = integral + error * config.timestep_s;
  let command = feedforward + proportional + config.ki_n_per_m_s * candidateIntegral + derivative;
  const winding =
    (command > config.thrust_max_n && error > 0) || (command < config.thrust_min_n && error < 0);
  const integralOut = winding ? integral : candidateIntegral;
  const integralTerm = config.ki_n_per_m_s * integralOut;
  if (winding) {
    command = feedforward + proportional + integralTerm + derivative;
  }
  const thrust = clamp(command, config.thrust_min_n, config.thrust_max_n);
  return {
    thrust,
    command,
    error,
    integral: integralOut,
    feedforward,
    proportional,
    integralTerm,
    derivative,
    saturated: thrust !== command,
  };
}

function stepVertical(
  altitude: number,
  velocity: number,
  thrust: number,
  config: SimulationConfig,
): { altitude: number; velocity: number } {
  if (config.ground_contact && altitude <= 0 && velocity <= 0) {
    const accel = specific(0, thrust, config);
    if (accel <= 0) {
      return { altitude: 0, velocity: 0 };
    }
  }
  const dt = config.timestep_s;
  const k1 = deriv(altitude, velocity, thrust, config);
  const k2 = deriv(altitude + 0.5 * dt * k1.z, velocity + 0.5 * dt * k1.v, thrust, config);
  const k3 = deriv(altitude + 0.5 * dt * k2.z, velocity + 0.5 * dt * k2.v, thrust, config);
  const k4 = deriv(altitude + dt * k3.z, velocity + dt * k3.v, thrust, config);
  let nextZ = altitude + (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z);
  let nextV = velocity + (dt / 6) * (k1.v + 2 * k2.v + 2 * k3.v + k4.v);
  if (config.ground_contact && nextZ < 0) {
    nextZ = 0;
    nextV = 0;
  }
  return { altitude: nextZ, velocity: nextV };
}

function deriv(altitude: number, velocity: number, thrust: number, config: SimulationConfig): { z: number; v: number } {
  void altitude;
  return { z: velocity, v: specific(velocity, thrust, config) };
}

function specific(velocity: number, thrust: number, config: SimulationConfig): number {
  const drag = -config.drag_coefficient_kg_per_m * Math.abs(velocity) * velocity;
  return (thrust + drag + config.external_force_n) / config.mass_kg - config.gravity_m_s2;
}

function reportedAccel(altitude: number, velocity: number, thrust: number, config: SimulationConfig): number {
  const accel = specific(velocity, thrust, config);
  if (config.ground_contact && altitude <= 0 && velocity <= 0 && accel <= 0) {
    return 0;
  }
  return accel;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}
