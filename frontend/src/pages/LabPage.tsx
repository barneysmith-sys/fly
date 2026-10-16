import { useEffect, useState } from "react";
import { describeError, fetchExperiment, fetchExperiments, fetchHover, postSimulation } from "../api";
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
  const [pidDraft, setPidDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [experiment, setExperiment] = useState<ExperimentResponse["experiment"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const playback = usePlayback(result?.samples ?? null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [items, hover] = await Promise.all([
          fetchExperiments(controller.signal),
          fetchHover(controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setCatalog(items);
          setPidDraft((current) => current ?? draftFromConfig(hover.config));
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(describeError(caught));
        }
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const runExperiment = async (experimentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const trace = await fetchExperiment(experimentId);
      setResult(trace);
      setExperiment(trace.experiment);
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
      const trace = await postSimulation(config);
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
      const trace = await postSimulation(config);
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
              <p>Run by the API</p>
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
              Constant thrust, no PID. Units are SI. The Python model clamps thrust to the limits and integrates with
              RK4.
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
              These inputs run the PID. Load an experiment to fill them from a real config, then edit and run. Ki, mass,
              and thrust limits are the same fields the 2 m hover uses.
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
              <p className="empty-copy">Loading the 2 m hover inputs from the model.</p>
            )}
          </details>
          {experiment?.scores_hover_band ? <AcceptancePanel result={result} /> : null}
        </>
      }
    />
  );
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
