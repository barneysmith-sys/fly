import { useEffect, useState } from "react";
import { describeError, fetchModel, postSimulation } from "../api";
import { QuadView } from "../components/QuadView";
import { Readouts } from "../components/Readouts";
import { TraceChart } from "../components/TraceChart";
import { Transport } from "../components/Transport";
import { recordLesson } from "../progress";
import type { ModelDocument, Motion, SimulationResponse } from "../types";
import { PitchLesson } from "./PitchLesson";
import { usePlayback } from "../usePlayback";

const MODULES = [
  {
    id: "flight",
    title: "How quadcopters fly",
    body: "Weight, thrust, and why a hover is an equilibrium.",
    kind: "hover",
  },
  {
    id: "motors",
    title: "Motors and propellers",
    body: "The 6-DOF mixer treats each motor as an immediate thrust. There is no motor lag, propeller model, or ESC.",
    kind: "later",
  },
  {
    id: "axes",
    title: "Pitch, roll, and yaw",
    body: "Tilting the thrust vector.",
    kind: "pitch",
  },
  {
    id: "physics",
    title: "Flight physics",
    body: "The lab runs the documented 1D experiments: free fall, hover equilibrium, step response, saturation, overshoot, integral residual, and disturbance recovery.",
    kind: "link",
    href: "#lab",
    linkLabel: "Open the lab",
  },
  {
    id: "pid",
    title: "PID controllers",
    body: "The 2 m hover is a classical PID with gravity feedforward. That is control theory. It is not a learned policy.",
    kind: "link",
    href: "#control",
    linkLabel: "Open the control notes",
  },
  {
    id: "fpv",
    title: "FPV flight",
    body: "Stabilized and acro flight are live in FLY. A scored manual-flight lesson is not implemented, so this topic does not record progress.",
    kind: "link",
    href: "#fly",
    linkLabel: "Open FLY",
  },
  {
    id: "sensors",
    title: "Sensors and navigation",
    body: "The controllers read the true state. No IMU, GPS, barometer, or estimator is in the integrator.",
    kind: "later",
  },
  {
    id: "landing",
    title: "Autonomous landing",
    body: "TRAIN runs a deterministic position descent and a vertical-only descent on the same rigid body. Success is scored from that episode.",
    kind: "link",
    href: "#train",
    linkLabel: "Open TRAIN",
  },
  {
    id: "rl",
    title: "Reinforcement learning fundamentals",
    body: "No policy is trained. There is no reward log, success rate from learning, or model checkpoint.",
    kind: "later",
  },
] as const;

type Prediction = Motion | "";

export function LearnPage() {
  const [moduleId, setModuleId] = useState<(typeof MODULES)[number]["id"]>("flight");
  const selected = MODULES.find((item) => item.id === moduleId) ?? MODULES[0];

  return (
    <div className="learn-layout">
      <aside className="panel">
        <header className="panel-head">
          <h2>Academy</h2>
          <p>9 topics</p>
        </header>
        <div className="stack">
          {MODULES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="stack-button"
              aria-current={item.id === moduleId ? "true" : undefined}
              onClick={() => setModuleId(item.id)}
            >
              {index + 1}. {item.title}
            </button>
          ))}
        </div>
      </aside>
      {selected.kind === "hover" ? <HoverLesson /> : null}
      {selected.kind === "pitch" ? <PitchLesson /> : null}
      {selected.kind === "link" ? (
        <section className="panel">
          <header className="panel-head">
            <h2>{selected.title}</h2>
            <p>Experiment, not a scored lesson</p>
          </header>
          <p className="end-state">{selected.body}</p>
          <p className="milestone">Opening this topic is not recorded as progress.</p>
          <div className="form-actions">
            <a className="text-link" href={selected.href}>
              {selected.linkLabel}
            </a>
          </div>
        </section>
      ) : null}
      {selected.kind === "later" ? (
        <section className="panel">
          <header className="panel-head">
            <h2>{selected.title}</h2>
            <p>Not yet a lesson</p>
          </header>
          <p className="end-state">{selected.body}</p>
          <p className="milestone">
            Coming in a future milestone. This topic has no interactive lesson yet, and opening it is not recorded as
            progress.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function HoverLesson() {
  const [model, setModel] = useState<ModelDocument | null>(null);
  const [mass, setMass] = useState("1");
  const [thrust, setThrust] = useState("12");
  const [prediction, setPrediction] = useState<Prediction>("");
  const [weightGuess, setWeightGuess] = useState("");
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const playback = usePlayback(result?.samples ?? null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const document = await fetchModel(controller.signal);
        if (!controller.signal.aborted) {
          setModel(document);
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

  const sample =
    result && result.samples.length > 0
      ? result.samples[Math.min(playback.index, result.samples.length - 1)]
      : null;
  const first = result?.samples[0] ?? null;
  const gravity = model?.standard_gravity_m_s2;
  const band = model?.hold_acceleration_band_m_s2;
  const tolerance = model?.weight_check_tolerance_n;

  const motionOk = result !== null && prediction !== "" && prediction === result.summary.initial_motion;
  const parsedWeight = Number(weightGuess);
  const weightOk =
    result !== null &&
    tolerance !== undefined &&
    Number.isFinite(parsedWeight) &&
    Math.abs(parsedWeight - result.summary.hover_thrust_n) <= tolerance;
  const passed = motionOk && weightOk;

  const run = async () => {
    if (!model || gravity === undefined) {
      setError("The model document has not loaded, so the lesson cannot choose g.");
      return;
    }
    if (prediction === "") {
      setError("Choose climb, hold, or descend before the run.");
      return;
    }
    const massKg = Number(mass.trim());
    const thrustN = Number(thrust.trim());
    const guess = Number(weightGuess.trim());
    if (!Number.isFinite(massKg) || massKg <= 0) {
      setError("Mass must be a number greater than 0 kg.");
      return;
    }
    if (!Number.isFinite(thrustN)) {
      setError("Thrust must be a finite number of newtons.");
      return;
    }
    if (!Number.isFinite(guess)) {
      setError("Enter a weight in newtons before the run.");
      return;
    }
    setLocked(true);
    setLoading(true);
    setError(null);
    try {
      const trace = await postSimulation({
        mass_kg: massKg,
        gravity_m_s2: gravity,
        thrust_min_n: 0,
        thrust_max_n: 40,
        drag_coefficient_kg_per_m: 0,
        external_force_n: 0,
        initial_altitude_m: 2,
        initial_vertical_velocity_m_s: 0,
        target_altitude_m: 2,
        kp_n_per_m: 0,
        ki_n_per_m_s: 0,
        kd_n_s_per_m: 0,
        timestep_s: 0.01,
        duration_s: 2,
        ground_contact: true,
        velocity_reference_m_s: 0,
        natural_frequency_rad_s: null,
        damping_ratio: null,
        control_mode: "open_loop",
        open_loop_thrust_n: thrustN,
      });
      setResult(trace);
      const motionMatch = prediction === trace.summary.initial_motion;
      const weightMatch = Math.abs(guess - trace.summary.hover_thrust_n) <= trace.model.weight_check_tolerance_n;
      recordLesson(motionMatch && weightMatch);
    } catch (caught) {
      setLocked(false);
      setError(describeError(caught));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setLocked(false);
    setResult(null);
    setPrediction("");
    setWeightGuess("");
    setError(null);
  };

  const fromForce =
    first && result ? (first.thrust_n - result.summary.hover_thrust_n) / result.config.mass_kg : null;

  return (
    <div className="lesson">
      <section className="panel">
        <header className="panel-head">
          <h2>Why a hover holds</h2>
          <p>Module 1</p>
        </header>
        <p className="end-state">
          A hover is the case where thrust equals weight and vertical velocity is already zero. Weight is mass times
          gravity, in newtons. Along this model’s upward axis, with drag and external force at zero,
        </p>
        <p className="equation">m · a = T − m · g</p>
        <p className="end-state">
          The simulator integrates <code>m*dv/dt = T - m*g - c_d*|v|*v + F_ext</code>. This lesson sets c_d = 0 and
          F_ext = 0. The vehicle starts at rest at 2 m, so the first sample is in the air and the ground reaction is
          not in that acceleration.
        </p>
        <p className="end-state">
          If applied thrust is greater than weight, acceleration is positive and the vehicle climbs. If it is less, the
          vehicle descends. If they are equal, acceleration is zero and altitude stays constant.
        </p>
        <p className="field-hint">
          Gravity used by this lesson: {gravity === undefined ? "loading" : `${gravity} m/s²`}. Thrust is limited to 0–40
          N. Predict the motion from the thrust that will actually be applied.
          {result?.plant === "browser"
            ? " This run used the browser copy of that equation. The Python process is not on this host."
            : ""}
        </p>
      </section>

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <header className="panel-head">
          <h2>Predict, then run</h2>
          <p>{locked ? "Locked" : "Unlocked"}</p>
        </header>
        <label className="field" htmlFor="lesson-mass">
          <span className="field-label">
            Mass
            <span>kg</span>
          </span>
          <input
            id="lesson-mass"
            value={mass}
            disabled={locked}
            inputMode="decimal"
            onChange={(event) => setMass(event.target.value)}
          />
          <span className="field-hint">Must be &gt; 0. Suggested range 0.2 to 5 kg.</span>
        </label>
        <label className="field" htmlFor="lesson-thrust">
          <span className="field-label">
            Thrust command
            <span>N</span>
          </span>
          <input
            id="lesson-thrust"
            value={thrust}
            disabled={locked}
            inputMode="decimal"
            onChange={(event) => setThrust(event.target.value)}
          />
          <span className="field-hint">Held constant. Commands outside 0 to 40 N are clamped before they enter the equation.</span>
        </label>
        <fieldset className="choices" disabled={locked}>
          <legend>At the first sample, the vehicle will</legend>
          {(["climb", "hold", "descend"] as const).map((option) => (
            <label key={option} className="check">
              <input
                type="radio"
                name="motion"
                value={option}
                checked={prediction === option}
                onChange={() => setPrediction(option)}
              />
              {option}
            </label>
          ))}
        </fieldset>
        <label className="field" htmlFor="lesson-weight">
          <span className="field-label">
            Weight of this vehicle
            <span>N</span>
          </span>
          <input
            id="lesson-weight"
            value={weightGuess}
            disabled={locked}
            inputMode="decimal"
            onChange={(event) => setWeightGuess(event.target.value)}
          />
          <span className="field-hint">
            Compute m·g before the run. A match is within{" "}
            {tolerance === undefined ? "the model tolerance" : `${tolerance} N`} of the weight in the returned summary.
          </span>
        </label>
        {error ? (
          <p className="fail" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button className="primary" type="submit" disabled={locked || loading || model === null}>
            Lock prediction and run
          </button>
          <button type="button" onClick={reset} disabled={loading || !locked}>
            Try again
          </button>
        </div>
      </form>

      {result && first ? (
        <section className="panel" aria-label="Lesson result">
          <header className="panel-head">
            <h2>Check against the trace</h2>
            <p className={passed ? "pass" : "fail"}>{passed ? "Matches" : "Does not match"}</p>
          </header>
          <ul className="criteria">
            <li>
              <span>Motion prediction {prediction}</span>
              <span className={motionOk ? "pass" : "fail"}>
                sample says {result.summary.initial_motion}
              </span>
            </li>
            <li>
              <span>Weight guess {Number.isFinite(parsedWeight) ? parsedWeight.toFixed(4) : "—"} N</span>
              <span className={weightOk ? "pass" : "fail"}>
                m·g {result.summary.hover_thrust_n.toFixed(4)} N
              </span>
            </li>
          </ul>
          <p className="end-state">
            First sample: altitude {first.altitude_m.toFixed(3)} m, velocity {first.vertical_velocity_m_s.toFixed(3)}{" "}
            m/s, acceleration {first.vertical_acceleration_m_s2.toFixed(4)} m/s², applied thrust {first.thrust_n.toFixed(4)}{" "}
            N. A hold means acceleration inside ±{band} m/s².
          </p>
          {first.saturated ? (
            <p className="end-state">
              The command was {first.thrust_command_n.toFixed(3)} N. Applied thrust is {first.thrust_n.toFixed(3)} N
              because the limit is 0 to {result.config.thrust_max_n.toFixed(3)} N. Acceleration uses the applied thrust.
            </p>
          ) : null}
          {fromForce !== null ? (
            <p className="end-state">
              (T − m·g) / m = {fromForce.toFixed(4)} m/s². The sample reports {first.vertical_acceleration_m_s2.toFixed(4)}{" "}
              m/s².
              {Math.abs(fromForce - first.vertical_acceleration_m_s2) < 1e-6
                ? " Those agree, so this sample is Newton’s second law, not a separate animation."
                : " They differ. On the ground, a non-positive net force is reported as zero acceleration because the ground reaction cancels it."}
            </p>
          ) : null}
          <p className="field-hint">
            {passed
              ? "Flight fundamentals records this attempt. A later attempt that misses replaces it."
              : "This attempt is not recorded as a pass. Opening the lesson does not count."}
          </p>
          <div className="lesson-stage">
            <QuadView
              altitudeM={sample ? sample.altitude_m : null}
              targetAltitudeM={sample ? sample.target_altitude_m : null}
              thrustN={sample ? sample.thrust_n : null}
              weightN={result.summary.hover_thrust_n}
            />
          </div>
          <Readouts sample={sample} unitNotes={result.model.unit_notes} controlMode={result.config.control_mode} />
          <TraceChart
            samples={result.samples}
            index={playback.index}
            label="Altitude"
            unit="m"
            value={(item) => item.altitude_m}
            reference={(item) => item.target_altitude_m}
          />
          <Transport
            playback={playback}
            sampleCount={result.samples.length}
            timeS={sample ? sample.time_s : null}
          />
        </section>
      ) : null}
    </div>
  );
}
