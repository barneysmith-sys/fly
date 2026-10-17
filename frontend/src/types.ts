export type SimulationConfig = {
  mass_kg: number;
  gravity_m_s2: number;
  thrust_min_n: number;
  thrust_max_n: number;
  drag_coefficient_kg_per_m: number;
  external_force_n: number;
  initial_altitude_m: number;
  initial_vertical_velocity_m_s: number;
  target_altitude_m: number;
  kp_n_per_m: number;
  ki_n_per_m_s: number;
  kd_n_s_per_m: number;
  timestep_s: number;
  duration_s: number;
  ground_contact: boolean;
  velocity_reference_m_s: number;
  natural_frequency_rad_s: number | null;
  damping_ratio: number | null;
  control_mode: "pid" | "open_loop";
  open_loop_thrust_n: number | null;
};

export type Sample = {
  time_s: number;
  altitude_m: number;
  vertical_velocity_m_s: number;
  vertical_acceleration_m_s2: number;
  thrust_n: number;
  thrust_command_n: number;
  target_altitude_m: number;
  altitude_error_m: number;
  integral_m_s: number;
  feedforward_n: number;
  proportional_n: number;
  integral_term_n: number;
  derivative_n: number;
  saturated: boolean;
};

export type Criterion = {
  name: string;
  description: string;
  observed: number;
  limit: number;
  unit: string;
  passed: boolean;
};

export type Acceptance = {
  passed: boolean;
  settle_time_s: number;
  altitude_tolerance_m: number;
  velocity_tolerance_m_s: number;
  criteria: Criterion[];
};

export type Summary = {
  sample_count: number;
  initial_altitude_m: number;
  final_time_s: number;
  final_altitude_m: number;
  final_vertical_velocity_m_s: number;
  final_thrust_n: number;
  final_altitude_error_m: number;
  minimum_altitude_m: number;
  maximum_altitude_m: number;
  maximum_abs_vertical_velocity_m_s: number;
  hover_thrust_n: number;
  initial_vertical_acceleration_m_s2: number;
  final_vertical_acceleration_m_s2: number;
  initial_motion: "climb" | "hold" | "descend";
};

export type UnitNote = {
  quantity: string;
  symbol: string;
  unit: string;
  primary: boolean;
  plain: string;
};

export type ModelDocument = {
  name: string;
  version: string;
  equations: Record<string, string>;
  units: Record<string, string>;
  unit_notes: UnitNote[];
  conventions: string[];
  assumptions: string[];
  limitations: string[];
  hold_acceleration_band_m_s2: number;
  weight_check_tolerance_n: number;
  standard_gravity_m_s2: number;
};

export type SimulationResponse = {
  scenario_id: string | null;
  config: SimulationConfig;
  model: ModelDocument;
  samples: Sample[];
  summary: Summary;
  acceptance: Acceptance;
  /** python when the API answered; browser when this host served HTML instead. */
  plant?: "python" | "browser";
};

export type Motion = "climb" | "hold" | "descend";

export type ExperimentSummary = {
  experiment_id: string;
  title: string;
  summary: string;
  supports: string;
  inputs: string[];
  scores_hover_band: boolean;
};

export type Finding = {
  name: string;
  description: string;
  observed: number;
  expected: number;
  tolerance: number | null;
  unit: string;
  passed: boolean;
};

export type ExperimentReport = ExperimentSummary & {
  passed: boolean;
  findings: Finding[];
};

export type ExperimentResponse = SimulationResponse & {
  experiment: ExperimentReport;
};

export type Draft = {
  mass_kg: string;
  gravity_m_s2: string;
  thrust_min_n: string;
  thrust_max_n: string;
  drag_coefficient_kg_per_m: string;
  external_force_n: string;
  initial_altitude_m: string;
  initial_vertical_velocity_m_s: string;
  target_altitude_m: string;
  kp_n_per_m: string;
  ki_n_per_m_s: string;
  kd_n_s_per_m: string;
  timestep_s: string;
  duration_s: string;
  ground_contact: boolean;
};

const NUMERIC_DRAFT_KEYS = [
  "mass_kg",
  "gravity_m_s2",
  "thrust_min_n",
  "thrust_max_n",
  "drag_coefficient_kg_per_m",
  "external_force_n",
  "initial_altitude_m",
  "initial_vertical_velocity_m_s",
  "target_altitude_m",
  "kp_n_per_m",
  "ki_n_per_m_s",
  "kd_n_s_per_m",
  "timestep_s",
  "duration_s",
] as const satisfies readonly (keyof Draft)[];

export function draftFromConfig(config: SimulationConfig): Draft {
  return {
    mass_kg: String(config.mass_kg),
    gravity_m_s2: String(config.gravity_m_s2),
    thrust_min_n: String(config.thrust_min_n),
    thrust_max_n: String(config.thrust_max_n),
    drag_coefficient_kg_per_m: String(config.drag_coefficient_kg_per_m),
    external_force_n: String(config.external_force_n),
    initial_altitude_m: String(config.initial_altitude_m),
    initial_vertical_velocity_m_s: String(config.initial_vertical_velocity_m_s),
    target_altitude_m: String(config.target_altitude_m),
    kp_n_per_m: String(config.kp_n_per_m),
    ki_n_per_m_s: String(config.ki_n_per_m_s),
    kd_n_s_per_m: String(config.kd_n_s_per_m),
    timestep_s: String(config.timestep_s),
    duration_s: String(config.duration_s),
    ground_contact: config.ground_contact,
  };
}

export function configFromDraft(draft: Draft): SimulationConfig {
  const config: Partial<SimulationConfig> = {
    ground_contact: draft.ground_contact,
    velocity_reference_m_s: 0,
    natural_frequency_rad_s: null,
    damping_ratio: null,
    control_mode: "pid",
    open_loop_thrust_n: null,
  };
  for (const key of NUMERIC_DRAFT_KEYS) {
    const value = Number(draft[key].trim());
    if (!Number.isFinite(value)) {
      throw new Error(`${key} is not a finite number`);
    }
    config[key] = value;
  }
  return config as SimulationConfig;
}
