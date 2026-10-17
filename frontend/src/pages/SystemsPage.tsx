import { useState } from "react";

const COMPONENTS = [
  {
    name: "Airframe",
    role: "Carries the other parts and sets the geometry that would produce torque in a 6-DOF model.",
    here: "Not simulated as a structure. The vehicle is a point mass.",
  },
  {
    name: "Propellers",
    role: "Produce aerodynamic thrust and torque when spun.",
    here: "Not simulated. Thrust is an ideal bounded force.",
  },
  {
    name: "Brushless motors",
    role: "Convert electrical power into propeller speed.",
    here: "Not simulated. There is no motor lag or RPM state.",
  },
  {
    name: "Electronic speed controllers",
    role: "Drive the motors from a throttle command.",
    here: "Not simulated. The plant receives total thrust, not four throttle channels.",
  },
  {
    name: "Flight controller",
    role: "Runs the control law from sensor data and pilot or autonomy commands.",
    here: "Represented only by the altitude PID, or skipped entirely in open loop.",
  },
  {
    name: "IMU",
    role: "Measures angular rate and specific force.",
    here: "Not simulated. The controller is given the true vertical state.",
  },
  {
    name: "Battery",
    role: "Stores the energy the motors and avionics draw.",
    here: "Not simulated. Mass is constant and thrust has no voltage limit.",
  },
  {
    name: "Power distribution",
    role: "Feeds the ESCs and the flight electronics from the battery.",
    here: "Not simulated. No current or voltage is computed.",
  },
  {
    name: "Radio receiver",
    role: "Turns a pilot’s stick commands into signals for the flight controller.",
    here: "Not simulated. There is no radio link and no stick.",
  },
  {
    name: "FPV camera",
    role: "Looks forward from the aircraft for the pilot’s goggles.",
    here: "Not simulated. The 3D view is an external drawing of altitude.",
  },
  {
    name: "Video transmitter",
    role: "Sends the camera image to the goggles.",
    here: "Not simulated.",
  },
  {
    name: "Antennas",
    role: "Radiate the control link and the video link.",
    here: "Not simulated.",
  },
  {
    name: "Onboard computer",
    role: "Would run estimation, planning, or a learned policy beside the flight controller.",
    here: "Not simulated. No second computer is in the loop.",
  },
  {
    name: "GPS/GNSS module",
    role: "Measures position and velocity in a navigation frame.",
    here: "Not simulated. Altitude in this model is the true state, not a fix.",
  },
] as const;

const FLOW = [
  "A constant altitude reference, or a constant open-loop thrust command.",
  "True altitude and true vertical velocity. These are not sensor readings.",
  "PID terms m·g, P, I, and D, or zeros when the run is open loop.",
  "Thrust command, then the clamp to [T_min, T_max].",
  "Newton’s second law on the vertical axis.",
  "One classical RK4 step with thrust held constant.",
  "A recorded sample: time, altitude, velocity, acceleration, and thrust.",
];

export function SystemsPage() {
  const [selected, setSelected] = useState(0);
  const component = COMPONENTS[selected];
  return (
    <div className="learn-layout">
      <aside className="panel">
        <header className="panel-head">
          <h2>Components</h2>
          <p>Described, not simulated</p>
        </header>
        <div className="stack">
          {COMPONENTS.map((item, index) => (
            <button
              key={item.name}
              type="button"
              className="stack-button"
              aria-current={index === selected ? "true" : undefined}
              onClick={() => setSelected(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </aside>
      <div className="lesson">
        <section className="panel">
          <header className="panel-head">
            <h2>{component.name}</h2>
            <p>Described, not simulated</p>
          </header>
          <p className="end-state">{component.role}</p>
          <p className="end-state">{component.here}</p>
        </section>
        <section className="panel">
          <header className="panel-head">
            <h2>Command and data path in this model</h2>
            <p>1D</p>
          </header>
          <ol className="flow">
            {FLOW.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="milestone">
            Coming in a future milestone: a 3D airframe you can select, individual motors, and electrical measurements.
            None of those are drawn as if they were in the integrator.
          </p>
        </section>
      </div>
    </div>
  );
}
