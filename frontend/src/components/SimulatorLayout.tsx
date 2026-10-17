import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { formatFixed } from "../format";
import type { SimulationResponse } from "../types";
import type { Playback } from "../usePlayback";
import { QuadView } from "./QuadView";
import { Readouts } from "./Readouts";
import { TraceChart } from "./TraceChart";
import { Transport } from "./Transport";

type SeriesId = "altitude" | "velocity" | "acceleration" | "thrust" | "error";

const SERIES: { id: SeriesId; label: string; unit: string }[] = [
  { id: "altitude", label: "Altitude", unit: "m" },
  { id: "velocity", label: "Velocity", unit: "m/s" },
  { id: "acceleration", label: "Acceleration", unit: "m/s²" },
  { id: "thrust", label: "Thrust", unit: "N" },
  { id: "error", label: "Altitude error", unit: "m" },
];

type SimulatorLayoutProps = {
  sidebar: ReactNode;
  result: SimulationResponse | null;
  playback: Playback;
  loading: boolean;
  error: string | null;
  empty: string;
};

export function SimulatorLayout({ sidebar, result, playback, loading, error, empty }: SimulatorLayoutProps) {
  const [seriesId, setSeriesId] = useState<SeriesId>("altitude");
  const sample =
    result && result.samples.length > 0
      ? result.samples[Math.min(playback.index, result.samples.length - 1)]
      : null;
  const timestep =
    result && result.samples.length > 1 ? result.samples[1].time_s - result.samples[0].time_s : null;
  const series = SERIES.find((item) => item.id === seriesId) ?? SERIES[0];
  const weight = result?.summary.hover_thrust_n ?? 0;
  const reader = useMemo(() => {
    return {
      altitude: (item: NonNullable<typeof sample>) => item.altitude_m,
      velocity: (item: NonNullable<typeof sample>) => item.vertical_velocity_m_s,
      acceleration: (item: NonNullable<typeof sample>) => item.vertical_acceleration_m_s2,
      thrust: (item: NonNullable<typeof sample>) => item.thrust_n,
      error: (item: NonNullable<typeof sample>) => item.altitude_error_m,
    };
  }, []);
  const reference = useMemo(() => {
    return {
      altitude: (item: NonNullable<typeof sample>) => item.target_altitude_m,
      velocity: () => 0,
      acceleration: () => 0,
      thrust: () => weight,
      error: () => 0,
    };
  }, [weight]);

  return (
    <>
      {error ? (
        <p className="banner fail" role="alert">
          {error}
        </p>
      ) : null}
      {loading && result ? <p className="banner">Integrating. The plot is still the previous trace.</p> : null}
      <main className="workspace">
        <div className="inputs">{sidebar}</div>
        <section className="panel stage" aria-label="Vehicle view">
          <QuadView
            altitudeM={sample ? sample.altitude_m : null}
            targetAltitudeM={sample ? sample.target_altitude_m : null}
            thrustN={sample ? sample.thrust_n : null}
            weightN={result ? result.summary.hover_thrust_n : null}
          />
        </section>
        <Readouts
          sample={sample}
          unitNotes={result?.model.unit_notes ?? []}
          controlMode={result?.config.control_mode ?? null}
        />
        <section className="panel chart-panel" aria-label="Simulation history">
          <header className="panel-head">
            <h2>{series.label} versus time</h2>
            <p>
              {result ? `${result.summary.sample_count} samples` : "Waiting for samples"}
              {timestep !== null ? ` · Δt ${formatFixed(timestep, 3)} s` : ""}
            </p>
          </header>
          <div className="chart-tabs" role="tablist" aria-label="Telemetry channel">
            {SERIES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === series.id}
                onClick={() => setSeriesId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {result ? (
            <TraceChart
              samples={result.samples}
              index={playback.index}
              label={series.label}
              unit={series.unit}
              value={reader[series.id]}
              reference={reference[series.id]}
            />
          ) : (
            <p className="empty-copy">{empty}</p>
          )}
          <Transport
            playback={playback}
            sampleCount={result?.samples.length ?? 0}
            timeS={sample ? sample.time_s : null}
          />
        </section>
      </main>
    </>
  );
}
