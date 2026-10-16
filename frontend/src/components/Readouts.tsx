import { formatFixed, formatSigned } from "../format";
import type { Sample } from "../types";

type ReadoutsProps = {
  sample: Sample | null;
};

export function Readouts({ sample }: ReadoutsProps) {
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
        />
        <Readout
          label="Altitude"
          value={sample ? formatFixed(sample.altitude_m, 3) : "—"}
          unit="m"
          detail={sample ? `${formatSigned(sample.altitude_error_m, 4)} m error` : undefined}
        />
        <Readout
          label="Vertical velocity"
          value={sample ? formatSigned(sample.vertical_velocity_m_s, 3) : "—"}
          unit="m/s"
          detail="Positive upward"
        />
        <Readout
          label="Thrust"
          value={sample ? formatFixed(sample.thrust_n, 3) : "—"}
          unit="N"
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
}: {
  label: string;
  value: string;
  unit: string;
  detail?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className="readout-value">{value}</span>
        <span className="readout-unit">{unit}</span>
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
