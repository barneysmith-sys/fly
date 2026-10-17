import { formatFixed, formatSigned } from "../format";
import type { Sample, UnitNote } from "../types";

type ReadoutsProps = {
  sample: Sample | null;
  unitNotes: UnitNote[];
  controlMode?: "pid" | "open_loop" | null;
};

export function Readouts({ sample, unitNotes, controlMode = null }: ReadoutsProps) {
  const explain = (quantity: string) => unitNotes.find((note) => note.quantity === quantity)?.plain;
  return (
    <section className="panel readouts" aria-label="Simulation sample">
      <header className="panel-head">
        <h2>At playhead</h2>
        <p>{sample ? `${formatFixed(sample.time_s, 2)} s` : "No sample"}</p>
      </header>
      <dl>
        <Readout
          label="Target altitude"
          value={sample ? formatFixed(sample.target_altitude_m, 3) : "—"}
          unit="m"
          hint={explain("Altitude")}
        />
        <Readout
          label="Altitude"
          value={sample ? formatFixed(sample.altitude_m, 3) : "—"}
          unit="m"
          hint={explain("Altitude")}
          detail={sample ? `${formatSigned(sample.altitude_error_m, 4)} m error` : undefined}
        />
        <Readout
          label="Vertical velocity"
          value={sample ? formatSigned(sample.vertical_velocity_m_s, 3) : "—"}
          unit="m/s"
          hint={explain("Vertical velocity")}
          detail="Positive upward"
        />
        <Readout
          label="Acceleration"
          value={sample ? formatSigned(sample.vertical_acceleration_m_s2, 3) : "—"}
          unit="m/s²"
          hint={explain("Acceleration")}
          detail="Positive upward"
        />
        <Readout
          label="Thrust"
          value={sample ? formatFixed(sample.thrust_n, 3) : "—"}
          unit="N"
          hint={explain("Thrust and weight")}
          detail={
            sample
              ? sample.saturated
                ? `Saturated. Command ${formatFixed(sample.thrust_command_n, 3)} N`
                : `Command ${formatFixed(sample.thrust_command_n, 3)} N`
              : undefined
          }
        />
      </dl>
      <h3>Control terms</h3>
      {controlMode === "open_loop" ? (
        <p className="field-hint">
          Open loop. The PID was not evaluated. These recorded terms are zero and are not part of the thrust command.
        </p>
      ) : (
        <p className="field-hint">Classical PID with gravity feedforward. This is not an artificial intelligence.</p>
      )}
      <ul className="terms">
        <Term label="m·g" value={sample?.feedforward_n} />
        <Term label="P" value={sample?.proportional_n} />
        <Term label="I" value={sample?.integral_term_n} />
        <Term label="D" value={sample?.derivative_n} />
      </ul>
    </section>
  );
}

function Readout({
  label,
  value,
  unit,
  detail,
  hint,
}: {
  label: string;
  value: string;
  unit: string;
  detail?: string;
  hint?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className="readout-value">{value}</span>
        <span className="readout-unit" title={hint}>
          {unit}
        </span>
        {detail ? <span className="readout-detail">{detail}</span> : null}
      </dd>
    </div>
  );
}

function Term({ label, value }: { label: string; value: number | undefined }) {
  return (
    <li>
      <span>{label}</span>
      <span>{value === undefined ? "—" : `${formatSigned(value, 3)} N`}</span>
    </li>
  );
}
