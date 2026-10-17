import { useState } from "react";
import { quatFromAxisAngle } from "../sim/math";
import { worldAccelerationOf } from "../sim/rigidBody";
import { hoverThrustN, NOMINAL_VEHICLE, vehicleState } from "../sim/vehicle";

type Choice = "forward-down" | "up" | "back" | "";

export function PitchLesson() {
  const [choice, setChoice] = useState<Choice>("");
  const [locked, setLocked] = useState(false);
  const [accel, setAccel] = useState<{ x: number; z: number } | null>(null);

  const run = () => {
    if (!choice) {
      return;
    }
    const pitched = vehicleState({
      positionM: { x: 0, y: 0, z: 8 },
      quaternion: quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.2),
    });
    const result = worldAccelerationOf(pitched, hoverThrustN(NOMINAL_VEHICLE), {
      ...NOMINAL_VEHICLE,
      dragCoefficientKgPerM: 0,
    });
    setAccel({ x: result.x, z: result.z });
    setLocked(true);
  };

  const matches = accel !== null && choice === "forward-down" && accel.x > 0 && accel.z < 0;

  return (
    <div className="lesson">
      <section className="panel">
        <header className="panel-head">
          <h2>Pitch tilts thrust</h2>
          <p>6-DOF</p>
        </header>
        <p className="end-state">
          The city model keeps thrust along the body up-axis. A nose-down pitch of 0.2 rad, with total thrust equal to
          weight and no drag, is the case below. The same <span className="mono">worldAccelerationOf</span> function
          supplies the flight view.
        </p>
        <p className="equation">m*a = R(q)*[0,0,T] + [0,0,-m*g]</p>
        <p className="end-state">
          Positive rotation about the right wing lowers the nose and points part of the thrust east, which is +x in
          this frame. Vertical support falls because the thrust is no longer straight up.
        </p>
      </section>
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <header className="panel-head">
          <h2>Predict, then compute</h2>
          <p>{locked ? "Locked" : "Unlocked"}</p>
        </header>
        <fieldset className="choices" disabled={locked}>
          <legend>With thrust equal to weight, the first acceleration is</legend>
          {(
            [
              ["forward-down", "Forward and downward"],
              ["up", "Straight up"],
              ["back", "Backward"],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="check">
              <input type="radio" name="pitch" checked={choice === id} onChange={() => setChoice(id)} />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="form-actions">
          <button className="primary" type="submit" disabled={locked || choice === ""}>
            Lock prediction and compute
          </button>
          <button
            type="button"
            disabled={!locked}
            onClick={() => {
              setLocked(false);
              setAccel(null);
              setChoice("");
            }}
          >
            Try again
          </button>
        </div>
      </form>
      {accel ? (
        <section className="panel">
          <header className="panel-head">
            <h2>Check</h2>
            <p className={matches ? "pass" : "fail"}>{matches ? "Matches" : "Does not match"}</p>
          </header>
          <p className="end-state">
            East acceleration {accel.x.toFixed(3)} m/s². Vertical acceleration {accel.z.toFixed(3)} m/s². Positive east
            and negative vertical means the thrust vector has pitched forward and no longer cancels weight.
          </p>
          <p className="field-hint">
            Opening the lesson is not recorded. This check is the observation. The flight view uses the same rotation
            when you pitch the nose.
          </p>
        </section>
      ) : null}
    </div>
  );
}
