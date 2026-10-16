import { useEffect, useState } from "react";
import { describeError } from "../api";
import { runPlant } from "../sim/verticalPlant";
import { AcceptancePanel } from "../components/AcceptancePanel";
import { ParameterForm } from "../components/ParameterForm";
import { SimulatorLayout } from "../components/SimulatorLayout";
import { recordExperiment } from "../progress";
import type { Draft, ExperimentResponse, ExperimentSummary, SimulationResponse } from "../types";
import { configFromDraft, draftFromConfig } from "../types";
import { usePlayback } from "../usePlayback";

type OpenLoopDraft = {
  mass_kg: string;
  gravity_m_s2: string;
  thrust_n: string;
  thrust_max_n: string;
  initial_altitude_m: string;
  duration_s: string;
};

const INITIAL_DRAFT: OpenLoopDraft = {
  mass_kg: "1",
  gravity_m_s2: "9.80665",
  thrust_n: "9.80665",
  thrust_max_n: "19.6133",
  initial_altitude_m: "2",
  duration_s: "4",
};

export function LabPage() {
  const [catalog, setCatalog] = useState<ExperimentSummary[]>([]);
  const [draft, setDraft] = useState<OpenLoopDraft>(INITIAL_DRAFT);
  const [pidDraft, setPidDraft] = useState<Draft | null>(HOVER_DRAFT);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [experiment, setExperiment] = useState<ExperimentResponse["experiment"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const playback = usePlayback(result?.samples ?? null);

  useEffect(() => {
    setCatalog(BROWSER_CASES);
  }, []);

  const runExperiment = async (experimentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const trace = runPlant(browserCase(experimentId));
      setResult(trace);
      setExperiment(reportFor(experimentId, trace));
      if (trace.config.control_mode === "pid") {
        setPidDraft(draftFromConfig(trace.config));
      }
      recordExperiment(experimentId);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setLoading(false);
    }
  };

  const runOpenLoop = async () => {
    let config;
    try {
      config = openLoopConfig(draft);
    } catch (caught) {
      setError(describeError(caught));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const trace = runPlant(config);
      setResult(trace);
      setExperiment(null);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setLoading(false);
    }
  };

  const runClosedLoop = async () => {
    if (!pidDraft) {
      setError("Load the model inputs, then edit and run. If this stays empty, the API did not return the 2 m hover.");
      return;
    }
    let config;
    try {
      config = configFromDraft(pidDraft);
    } catch (caught) {
      setError(describeError(caught));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const trace = runPlant(config);
      setResult(trace);
      setExperiment(null);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setLoading(false);
    }
  };

  const mass = Number(draft.mass_kg);
  const gravity = Number(draft.gravity_m_s2);
  const weight = Number.isFinite(mass) && Number.isFinite(gravity) ? mass * gravity : null;

  return (
    <SimulatorLayout
      result={result}
      playback={playback}
      loading={loading}
      error={error}
      empty="Choose an experiment or run a mass and thrust. The plot is drawn only from returned samples."
      sidebar={
        <>
          <section className="panel">
            <header className="panel-head">
              <h2>Experiments</h2>
              <p>Browser plant</p>
            </header>
            <div className="stack">
              {catalog.map((item) => (
                <button
                  key={item.experiment_id}
                  type="button"
                  className="stack-button"
                  disabled={loading}
                  onClick={() => void runExperiment(item.experiment_id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
            {experiment ? (
              <div className="findings">
                <p className={experiment.passed ? "pass" : "fail"}>
                  {experiment.passed ? "Checks passed" : "Checks failed"} · {experiment.title}
                </p>
                <p className="end-state">{experiment.summary}</p>
                <ul className="criteria">
                  {experiment.findings.map((finding) => (
                    <li key={finding.name}>
                      <span>
                        {finding.description} {finding.passed ? "Pass" : "Fail"}
                      </span>
                      <span>
                        {finding.observed.toFixed(4)} {finding.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                {experiment.scores_hover_band ? (
                  <p className="field-hint">The 2 m hover acceptance band is the score for this experiment.</p>
                ) : (
                  <p className="field-hint">
                    The 2 m hover acceptance band is not the score for this experiment. The checks above are.
                  </p>
                )}
              </div>
            ) : result ? (
              <p className="field-hint">
                Custom run. Initial motion from the first sample: {result.summary.initial_motion}. Acceleration{" "}
                {result.summary.initial_vertical_acceleration_m_s2.toFixed(3)} m/s². The hover acceptance band does not
                score an arbitrary thrust.
              </p>
            ) : null}
          </section>

          <form
            className="panel"
            onSubmit={(event) => {
              event.preventDefault();
              void runOpenLoop();
            }}
          >
            <header className="panel-head">
              <h2>Mass and thrust</h2>
              <p>Open loop</p>
            </header>
            <p className="end-state">
              Constant thrust, no PID. This page integrates the documented equation in the browser with classical RK4.
              It does not call <code>/api</code>. The Python module remains the reference for regression tests.
            </p>
            <LabField
              id="lab-mass"
              label="Mass"
              unit="kg"
              value={draft.mass_kg}
              hint="Must be > 0. Suggested 0.2 to 5 kg."
              onChange={(value) => setDraft({ ...draft, mass_kg: value })}
            />
            <LabField
              id="lab-gravity"
              label="Gravity"
              unit="m/s²"
              value={draft.gravity_m_s2}
              hint="Must be > 0. Standard gravity is 9.80665 m/s²."
              onChange={(value) => setDraft({ ...draft, gravity_m_s2: value })}
            />
            <LabField
              id="lab-thrust"
              label="Thrust command"
              unit="N"
              value={draft.thrust_n}
              hint="Held constant. Applied thrust cannot leave [0, thrust max]."
              onChange={(value) => setDraft({ ...draft, thrust_n: value })}
            />
            <LabField
              id="lab-tmax"
              label="Thrust max"
              unit="N"
              value={draft.thrust_max_n}
              hint="Must be ≥ 0. Nominal hover uses 2·m·g."
              onChange={(value) => setDraft({ ...draft, thrust_max_n: value })}
            />
            <LabField
              id="lab-z0"
              label="Initial altitude"
              unit="m"
              value={draft.initial_altitude_m}
              hint="Must be ≥ 0. Start above 0 to see acceleration. On the ground, a downward net force is reported as 0."
              onChange={(value) => setDraft({ ...draft, initial_altitude_m: value })}
            />
            <LabField
              id="lab-duration"
              label="Duration"
              unit="s"
              value={draft.duration_s}
              hint="0.20 to 20 s. Rounded to the 0.01 s timestep."
              onChange={(value) => setDraft({ ...draft, duration_s: value })}
            />
            <p className="parameter-note">
              From these fields, m·g = {weight === null ? "—" : `${weight.toFixed(5)} N`}. This product is not a sample.
              After a run, the trace’s hover thrust is the simulated weight. Hover equilibrium is thrust equal to that
              weight, with vertical velocity already zero.
            </p>
            <p className="milestone">
              Coming in a future milestone: wind and sensor noise. This plant does not have those inputs, so they are
              not on this form.
            </p>
            <div className="form-actions">
              <button className="primary" type="submit" disabled={loading}>
                Run open loop
              </button>
            </div>
          </form>

          <details className="panel">
            <summary>Closed-loop altitude controller</summary>
            <p className="end-state">
              These inputs run the same PID law as the Python module, in the browser. The 2 m hover gains are already filled. Named Python catalog checks are not served by GitHub Pages.
            </p>
            {pidDraft ? (
              <ParameterForm
                draft={pidDraft}
                disabled={loading}
                onChange={setPidDraft}
                onRun={() => void runClosedLoop()}
                onRestoreHover={() => void runExperiment("step-response")}
              />
            ) : (
              <p className="empty-copy">The 2 m hover inputs are part of this page.</p>
            )}
          </details>
          {experiment?.scores_hover_band ? <AcceptancePanel result={result} /> : null}
        </>
      }
    />
  );
}

const HOVER_DRAFT: Draft = {
  mass_kg: "1",
  gravity_m_s2: "9.80665",
  thrust_min_n: "0",
  thrust_max_n: String(2 * 9.80665),
  drag_coefficient_kg_per_m: "0",
  external_force_n: "0",
  initial_altitude_m: "0",
  initial_vertical_velocity_m_s: "0",
  target_altitude_m: "2",
  kp_n_per_m: "2.25",
  ki_n_per_m_s: "0",
  kd_n_s_per_m: "3",
  timestep_s: "0.01",
  duration_s: "12",
  ground_contact: true,
};

const BROWSER_CASES: ExperimentSummary[] = [
  {
    experiment_id: "free-fall",
    title: "Free fall",
    summary: "Thrust is zero from rest at 5 m.",
    supports: "Open-loop specific force.",
    inputs: ["thrust", "altitude"],
    scores_hover_band: false,
  },
  {
    experiment_id: "hover-hold",
    title: "Hover equilibrium",
    summary: "Thrust equals weight at 2 m with zero vertical speed.",
    supports: "Open-loop equilibrium.",
    inputs: ["mass", "gravity", "thrust"],
    scores_hover_band: false,
  },
  {
    experiment_id: "excess-thrust",
    title: "Excess thrust",
    summary: "14 N on a 1 kg vehicle at rest.",
    supports: "Open-loop climb.",
    inputs: ["thrust"],
    scores_hover_band: false,
  },
  {
    experiment_id: "hover-2m",
    title: "2 m hover",
    summary: "PID step from the ground to 2 m. Ki is 0.",
    supports: "Closed-loop altitude.",
    inputs: ["kp", "kd", "target"],
    scores_hover_band: false,
  },
];

function browserCase(id: string) {
  const gravity = 9.80665;
  const shared = {
    mass_kg: 1,
    gravity_m_s2: gravity,
    thrust_min_n: 0,
    thrust_max_n: 40,
    drag_coefficient_kg_per_m: 0,
    external_force_n: 0,
    initial_vertical_velocity_m_s: 0,
    kp_n_per_m: 0,
    ki_n_per_m_s: 0,
    kd_n_s_per_m: 0,
    timestep_s: 0.01,
    ground_contact: true,
    velocity_reference_m_s: 0,
    natural_frequency_rad_s: null,
    damping_ratio: null,
    control_mode: "open_loop" as const,
  };
  if (id === "free-fall") {
    return { ...shared, initial_altitude_m: 5, target_altitude_m: 5, duration_s: 1.5, open_loop_thrust_n: 0 };
  }
  if (id === "hover-hold") {
    return { ...shared, initial_altitude_m: 2, target_altitude_m: 2, duration_s: 2, open_loop_thrust_n: gravity };
  }
  if (id === "excess-thrust") {
    return { ...shared, initial_altitude_m: 2, target_altitude_m: 2, duration_s: 1.5, open_loop_thrust_n: 14 };
  }
  if (id === "hover-2m") {
    return configFromDraft(HOVER_DRAFT);
  }
  throw new Error(`Unknown experiment ${id}`);
}

function reportFor(id: string, trace: SimulationResponse): ExperimentResponse["experiment"] {
  const item = BROWSER_CASES.find((entry) => entry.experiment_id === id) ?? BROWSER_CASES[0];
  const accel = trace.summary.initial_vertical_acceleration_m_s2;
  const finalAltitude = trace.summary.final_altitude_m;
  const finding =
    id === "hover-2m"
      ? {
          name: "final_altitude",
          description: "Altitude at the last sample",
          observed: finalAltitude,
          expected: 2,
          tolerance: 0.2,
          unit: "m",
          passed: Math.abs(finalAltitude - 2) <= 0.2,
        }
      : {
          name: "initial_acceleration",
          description: "Vertical acceleration of the first airborne sample",
          observed: accel,
          expected: id === "hover-hold" ? 0 : id === "free-fall" ? -9.80665 : 14 - 9.80665,
          tolerance: 1e-6,
          unit: "m/s^2",
          passed:
            id === "hover-hold"
              ? Math.abs(accel) <= 1e-6
              : id === "free-fall"
                ? accel < -9
                : accel > 1,
        };
  return { ...item, passed: finding.passed, findings: [finding] };
}

function openLoopConfig(draft: OpenLoopDraft) {
  const mass_kg = numberField("mass_kg", draft.mass_kg);
  const gravity_m_s2 = numberField("gravity_m_s2", draft.gravity_m_s2);
  const thrust_n = numberField("thrust", draft.thrust_n);
  const thrust_max_n = numberField("thrust_max_n", draft.thrust_max_n);
  const initial_altitude_m = numberField("initial_altitude_m", draft.initial_altitude_m);
  const requested = numberField("duration_s", draft.duration_s);
  const steps = Math.round(requested / 0.01);
  const duration_s = Math.min(20, Math.max(0.2, steps * 0.01));
  if (mass_kg <= 0) {
    throw new Error("mass_kg must be > 0");
  }
  if (gravity_m_s2 <= 0) {
    throw new Error("gravity_m_s2 must be > 0");
  }
  if (thrust_max_n < 0) {
    throw new Error("thrust_max_n must be ≥ 0");
  }
  if (initial_altitude_m < 0) {
    throw new Error("initial_altitude_m must be ≥ 0");
  }
  return {
    mass_kg,
    gravity_m_s2,
    thrust_min_n: 0,
    thrust_max_n,
    drag_coefficient_kg_per_m: 0,
    external_force_n: 0,
    initial_altitude_m,
    initial_vertical_velocity_m_s: 0,
    target_altitude_m: initial_altitude_m,
    kp_n_per_m: 0,
    ki_n_per_m_s: 0,
    kd_n_s_per_m: 0,
    timestep_s: 0.01,
    duration_s: Number(duration_s.toFixed(2)),
    ground_contact: true,
    velocity_reference_m_s: 0,
    natural_frequency_rad_s: null,
    damping_ratio: null,
    control_mode: "open_loop" as const,
    open_loop_thrust_n: thrust_n,
  };
}

function numberField(name: string, value: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} is not a finite number`);
  }
  return parsed;
}

function LabField({
  id,
  label,
  unit,
  value,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  hint: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">
        {label}
        <span>{unit}</span>
      </span>
      <input id={id} value={value} inputMode="decimal" onChange={(event) => onChange(event.target.value)} />
      <span className="field-hint">{hint}</span>
    </label>
  );
}
