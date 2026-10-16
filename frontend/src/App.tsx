import { useCallback, useEffect, useState } from "react";
import { fetchHover, postSimulation } from "./api";
import { AcceptancePanel } from "./components/AcceptancePanel";
import { AltitudeChart } from "./components/AltitudeChart";
import { ModelNotes } from "./components/ModelNotes";
import { ParameterForm } from "./components/ParameterForm";
import { QuadView } from "./components/QuadView";
import { Readouts } from "./components/Readouts";
import { UnitGuide } from "./components/UnitGuide";
import { formatFixed } from "./format";
import type { Draft, SimulationResponse } from "./types";
import { configFromDraft, draftFromConfig } from "./types";
import { usePlayback } from "./usePlayback";

export function App() {
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const playback = usePlayback(result?.samples ?? null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const trace = await fetchHover(controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setResult(trace);
        setDraft(draftFromConfig(trace.config));
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted) {
          return;
        }
        setError(describe(caught));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const restoreHover = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const trace = await fetchHover();
      setResult(trace);
      setDraft(draftFromConfig(trace.config));
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  const runDraft = useCallback(async () => {
    if (!draft) {
      return;
    }
    let config;
    try {
      config = configFromDraft(draft);
    } catch (caught) {
      setError(describe(caught));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const trace = await postSimulation(config);
      setResult(trace);
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setLoading(false);
    }
  }, [draft]);

  const sample =
    result && result.samples.length > 0
      ? result.samples[Math.min(playback.index, result.samples.length - 1)]
      : null;
  const timestep =
    result && result.samples.length > 1 ? result.samples[1].time_s - result.samples[0].time_s : null;

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">FLY · vertical dynamics · v0.1</p>
          <h1>AEROSIM</h1>
        </div>
        <p className={result ? (result.acceptance.passed ? "pass" : "fail") : "muted"}>
          {result?.scenario_id === "hover_2m" ? "2 m hover · " : result ? "Edited run · " : ""}
          {result
            ? result.acceptance.passed
              ? "within band"
              : "outside band"
            : loading
              ? "integrating"
              : "no trace"}
        </p>
      </header>

      {error ? (
        <p className="banner fail" role="alert">
          {error}
        </p>
      ) : null}
      {loading && result ? (
        <p className="banner">Integrating. The plot is still the previous trace.</p>
      ) : null}

      <main className="workspace">
        <div className="inputs">
          <UnitGuide notes={result?.model.unit_notes ?? []} conventions={result?.model.conventions ?? []} />
          {draft ? (
            <ParameterForm
              draft={draft}
              disabled={loading}
              onChange={setDraft}
              onRun={runDraft}
              onRestoreHover={restoreHover}
            />
          ) : (
            <section className="panel empty-copy">
              <p>{loading ? "Running the 2 m hover in the Python model." : "No model inputs loaded."}</p>
            </section>
          )}
          <AcceptancePanel result={result} />
          <ModelNotes model={result?.model ?? null} />
        </div>

        <section className="panel stage" aria-label="Vehicle view">
          <QuadView
            altitudeM={sample ? sample.altitude_m : null}
            targetAltitudeM={sample ? sample.target_altitude_m : null}
            thrustN={sample ? sample.thrust_n : null}
            weightN={result ? result.summary.hover_thrust_n : null}
          />
        </section>

        <Readouts sample={sample} unitNotes={result?.model.unit_notes ?? []} />

        <section className="panel chart-panel" aria-label="Altitude history">
          <header className="panel-head">
            <h2>Altitude versus time</h2>
            <p>
              {result
                ? `${result.summary.sample_count} samples`
                : "Waiting for samples"}
              {timestep !== null ? ` · Δt ${formatFixed(timestep, 3)} s` : ""}
            </p>
          </header>
          {result ? (
            <AltitudeChart samples={result.samples} index={playback.index} />
          ) : (
            <p className="empty-copy">The graph is drawn from the returned samples only.</p>
          )}
          <div className="transport">
            <button type="button" onClick={playback.toggle} disabled={!result || result.samples.length < 2}>
              {playback.playing ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={playback.jumpToEnd} disabled={!result}>
              Settled state
            </button>
            <label className="scrubber">
              <span className="sr-only">Simulation time</span>
              <input
                type="range"
                min={0}
                max={Math.max((result?.samples.length ?? 1) - 1, 0)}
                value={result ? Math.min(playback.index, result.samples.length - 1) : 0}
                disabled={!result}
                onChange={(event) => playback.seek(Number(event.target.value))}
              />
            </label>
            <span className="time-readout">
              {sample ? `${formatFixed(sample.time_s, 2)} s` : "—"}
            </span>
          </div>
        </section>
      </main>
    </>
  );
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "The Python API is not reachable. Start it with python -m aerosim.api.server.";
    }
    return error.message;
  }
  return "The model did not respond.";
}
