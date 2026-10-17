import { useMemo, useRef, useState } from "react";
import type { PartId } from "../animation/explorer4Model";
import { motorLayout, wrenchFromMotors } from "../animation/motorLayout";
import { MotorMixingPanel } from "../components/MotorMixingPanel";
import { InspectCanvas } from "../components/InspectCanvas";
import { EXPLORER_4 } from "../sim/aircraft";
import { hoverThrustN } from "../sim/vehicle";

const HOVER = hoverThrustN(EXPLORER_4.params) / 4;

export function MotorPage() {
  const [motors, setMotors] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [failed, setFailed] = useState<number[]>([]);
  const motorsRef = useRef(motors);
  const failedRef = useRef(failed);
  const selectedRef = useRef<PartId | null>(null);
  const explodeRef = useRef(false);
  motorsRef.current = motors;
  failedRef.current = failed;
  const max = EXPLORER_4.params.thrustMaxN / 4;
  const layout = useMemo(() => motorLayout(EXPLORER_4.params), []);
  const wrench = wrenchFromMotors(motors, EXPLORER_4.params);

  const apply = (next: [number, number, number, number], dead: number[] = []) => {
    setFailed(dead);
    setMotors(next.map((value, index) => (dead.includes(index) ? 0 : value)) as [number, number, number, number]);
  };

  return (
    <section className="inspect-page">
      <InspectCanvas motorsRef={motorsRef} failedRef={failedRef} selectedRef={selectedRef} explodeRef={explodeRef} illustrative />
      <aside className="inspect-panel">
        <header className="panel-head">
          <h2>Motor stand</h2>
          <p>Illustrative · airframe fixed</p>
        </header>
        <p className="field-hint">
          The aircraft is clamped to the stand. These thrusts never enter the flight integrator. The torque below is what the body would feel.
        </p>
        {layout.map((motor) => (
          <label key={motor.index} className="field">
            <span className="field-label">
              M{motor.index} {motor.label} {motor.spin} · {motors[motor.index].toFixed(2)} N
            </span>
            <input
              type="range"
              min={0}
              max={max}
              step={0.01}
              value={motors[motor.index]}
              onChange={(event) => {
                const next = [...motors] as [number, number, number, number];
                next[motor.index] = Number(event.target.value);
                apply(next, failed.filter((index) => index !== motor.index));
              }}
            />
          </label>
        ))}
        <div className="form-actions">
          <button type="button" onClick={() => apply([HOVER, HOVER, HOVER, HOVER])}>Collective</button>
          <button type="button" onClick={() => apply([HOVER * 0.7, HOVER * 0.7, HOVER * 1.3, HOVER * 1.3])}>Pitch</button>
          <button type="button" onClick={() => apply([HOVER * 1.3, HOVER * 0.7, HOVER * 0.7, HOVER * 1.3])}>Roll</button>
          <button type="button" onClick={() => apply([HOVER * 0.7, HOVER * 1.3, HOVER * 0.7, HOVER * 1.3])}>Yaw</button>
          <button type="button" onClick={() => apply([0, HOVER, HOVER, HOVER], [0])}>Fail M0</button>
          <button type="button" onClick={() => apply([0, 0, 0, 0])}>Stop</button>
        </div>
        <MotorMixingPanel motorsN={motors} motorMaxN={max} layout={layout} wrench={wrench} source="illustrative" failed={failed} size={240} />
      </aside>
    </section>
  );
}
