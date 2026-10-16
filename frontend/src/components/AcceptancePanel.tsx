import { formatFixed, formatSigned } from "../format";
import type { SimulationResponse } from "../types";

type AcceptancePanelProps = {
  result: SimulationResponse | null;
};

export function AcceptancePanel({ result }: AcceptancePanelProps) {
  const title = result?.scenario_id === "hover_2m" ? "2 m hover" : "This run";
  return (
    <section className="panel acceptance" aria-label="Acceptance">
      <header className="panel-head">
        <h2>{title}</h2>
        <p className={result ? (result.acceptance.passed ? "pass" : "fail") : undefined}>
          {result ? (result.acceptance.passed ? "Within band" : "Outside band") : "Not run"}
        </p>
      </header>
      {result ? (
        <>
          <p className="end-state">
            End of trace: {formatFixed(result.summary.final_altitude_m, 4)} m,{" "}
            {formatSigned(result.summary.final_vertical_velocity_m_s, 4)} m/s, thrust{" "}
            {formatFixed(result.summary.final_thrust_n, 4)} N. Weight parameter{" "}
            {formatFixed(result.summary.hover_thrust_n, 4)} N.
          </p>
          <ul className="criteria">
            {result.acceptance.criteria.map((item) => (
              <li key={item.name} className={item.passed ? "pass" : "fail"}>
                <span>{item.description}</span>
                <span>
                  {formatFixed(item.observed, 4)} {item.unit}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="empty-copy">The band is scored by the Python run after it returns a trace.</p>
      )}
    </section>
  );
}
