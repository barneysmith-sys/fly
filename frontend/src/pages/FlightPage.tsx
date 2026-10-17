import { useEffect, useState } from "react";
import { describeError, fetchHover } from "../api";
import { AcceptancePanel } from "../components/AcceptancePanel";
import { SimulatorLayout } from "../components/SimulatorLayout";
import { UnitGuide } from "../components/UnitGuide";
import type { SimulationResponse } from "../types";
import { usePlayback } from "../usePlayback";

export function FlightPage() {
  const [result, setResult] = useState<SimulationResponse | null>(null);
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
        setError(null);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(describeError(caught));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  return (
    <SimulatorLayout
      result={result}
      playback={playback}
      loading={loading}
      error={error}
      empty={loading ? "Running the 2 m hover in the Python model." : "No trace loaded."}
      sidebar={
        <>
          <section className="panel">
            <header className="panel-head">
              <h2>Flight</h2>
              <p>1D replay</p>
            </header>
            <p className="end-state">
              The vehicle position in this view is the altitude from the 2 m hover trace. The camera does not pitch,
              roll, or yaw. The simulation state has no attitude.
            </p>
            <p className="milestone">
              Coming in a future milestone: an onboard FPV camera, a chase camera, stabilized mode, acro mode, and
              keyboard commands for throttle, pitch, roll, and yaw. Those require a 6-DOF model. They are not
              approximated here.
            </p>
            <p className="field-hint">
              Simulation clock
              {result ? ` ${result.summary.final_time_s.toFixed(2)} s` : ""}. This is the length of the loaded run, not a
              pilot log.
            </p>
          </section>
          <UnitGuide notes={result?.model.unit_notes ?? []} conventions={result?.model.conventions ?? []} />
          <AcceptancePanel result={result} />
        </>
      }
    />
  );
}
