import { useEffect, useState } from "react";
import { describeError, fetchHover } from "../api";
import { Readouts } from "../components/Readouts";
import { Transport } from "../components/Transport";
import type { SimulationResponse } from "../types";
import { usePlayback } from "../usePlayback";

const PIPELINE = [
  {
    title: "Sensor observations",
    state: "Not modeled",
    body: "The altitude loop is given the true altitude and true vertical velocity. There is no barometer, IMU, or GPS in this run.",
  },
  {
    title: "State estimation",
    state: "Not modeled",
    body: "Nothing estimates the state. The controller reads the integrator’s state directly.",
  },
  {
    title: "Planning",
    state: "Not modeled",
    body: "The reference is a constant altitude chosen with the scenario. There is no path, waypoint, or mission state.",
  },
  {
    title: "Control commands",
    state: "Classical control",
    body: "The 2 m hover uses a PID with gravity feedforward. That is control theory. It is not machine learning and it is not artificial intelligence.",
  },
  {
    title: "Vehicle response",
    state: "1D plant",
    body: "The command is saturated, then integrated with Newton’s second law and RK4. The plot is that response.",
  },
] as const;

export function AutonomyPage() {
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playback = usePlayback(result?.samples ?? null);
  const sample =
    result && result.samples.length > 0
      ? result.samples[Math.min(playback.index, result.samples.length - 1)]
      : null;

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const trace = await fetchHover(controller.signal);
        if (!controller.signal.aborted) {
          setResult(trace);
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

  return (
    <div className="doc">
      <section className="panel">
        <header className="panel-head">
          <h2>Autonomy</h2>
          <p>What is actually running</p>
        </header>
        <p className="end-state">
          Manual control, a stabilizer, and an autonomous system are different. This repository currently has one
          closed-loop behavior: a PID altitude hold on a vertical point mass. Open-loop thrust in the lab is a held
          force, not a stick and not a pilot.
        </p>
        {error ? (
          <p className="fail" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      <ol className="pipeline">
        {PIPELINE.map((step) => (
          <li key={step.title} className="panel">
            <header className="panel-head">
              <h2>{step.title}</h2>
              <p>{step.state}</p>
            </header>
            <p className="end-state">{step.body}</p>
          </li>
        ))}
      </ol>
      <section className="panel">
        <header className="panel-head">
          <h2>PID terms from the hover trace</h2>
          <p>{sample ? `${sample.time_s.toFixed(2)} s` : "Loading"}</p>
        </header>
        <Readouts sample={sample} unitNotes={result?.model.unit_notes ?? []} controlMode="pid" />
        <Transport playback={playback} sampleCount={result?.samples.length ?? 0} timeS={sample ? sample.time_s : null} />
      </section>
      <section className="panel">
        <h2>Not in this milestone</h2>
        <ul className="criteria">
          <li>
            <span>Altitude hold beyond the PID already shown</span>
            <span>Implemented as classical control</span>
          </li>
          <li>
            <span>Position hold, waypoints, obstacle avoidance</span>
            <span>Coming in a future milestone</span>
          </li>
          <li>
            <span>Mission state machine and human supervision</span>
            <span>Coming in a future milestone</span>
          </li>
          <li>
            <span>A learned controller</span>
            <span>Coming in a future milestone</span>
          </li>
        </ul>
        <p className="milestone">
          Coming in a future milestone. No opaque policy is standing in for those behaviors.
        </p>
      </section>
    </div>
  );
}
