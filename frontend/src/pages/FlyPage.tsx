import { useEffect, useRef, useState } from "react";
import { useChrome } from "../chrome";
import { CityViewport, type CameraMode, type CityPose } from "../components/CityViewport";
import { attitudeMotors, hoverInput, type ControlMode } from "../sim/control";
import { resolveContacts, type Contact } from "../sim/collision";
import type { District } from "../sim/district";
import { explain, INSTRUCTOR_NOTE, type InstructorQuestion } from "../sim/instructor";
import { integrateThrottle, readPilot } from "../sim/input";
import { headingDegFromNorth, length, rhAngles } from "../sim/math";
import { stepRigidBody } from "../sim/rigidBody";
import { equalMotors, hoverThrustN, NOMINAL_VEHICLE, vehicleState, type MotorsN, type VehicleState } from "../sim/vehicle";

const SIM_DT_S = 0.005;

type FlyPageProps = {
  district: District;
};

type Hud = {
  state: VehicleState;
  motors: MotorsN;
  thrustN: number;
  contact: Contact | null;
  mode: ControlMode;
  paused: boolean;
  trace: { timeS: number; altitudeM: number }[];
};

export function FlyPage({ district }: FlyPageProps) {
  const launch = vehicleState({
    positionM: { x: district.launch.x, y: district.launch.y, z: district.launch.z },
  });
  const hoverMotors = equalMotors(hoverThrustN(NOMINAL_VEHICLE));
  const stateRef = useRef<VehicleState>(launch);
  const motorsRef = useRef<MotorsN>(hoverMotors);
  const contactRef = useRef<Contact | null>(null);
  const keysRef = useRef(new Set<string>());
  const throttleRef = useRef(hoverInput(NOMINAL_VEHICLE).throttle);
  const pausedRef = useRef(false);
  const modeRef = useRef<ControlMode>("stabilized");
  const traceRef = useRef<{ timeS: number; altitudeM: number }[]>([]);
  const poseRef = useRef<CityPose>({
    position: launch.positionM,
    quaternion: launch.quaternion,
    motors: hoverMotors,
  });
  const renderRef = useRef<() => void>(() => {});
  const [cameraMode, setCameraMode] = useState<CameraMode>("chase");
  const [mode, setMode] = useState<ControlMode>("stabilized");
  const [paused, setPaused] = useState(false);
  const [panels, setPanels] = useState({ left: true, right: true, bottom: true });
  const [question, setQuestion] = useState<InstructorQuestion | null>(null);
  const [hud, setHud] = useState<Hud>({
    state: launch,
    motors: hoverMotors,
    thrustN: hoverThrustN(NOMINAL_VEHICLE),
    contact: null,
    mode: "stabilized",
    paused: false,
    trace: [],
  });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (typing(event)) {
        return;
      }
      if (isFlightKey(event.code)) {
        event.preventDefault();
      }
      keysRef.current.add(event.code);
      if (event.code === "KeyP" && !event.repeat) {
        setPaused((value) => !value);
      }
      if (event.code === "KeyR" && !event.repeat && !event.metaKey) {
        reset();
      }
    };
    const onUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };
    const reset = () => {
      const next = vehicleState({
        positionM: { x: district.launch.x, y: district.launch.y, z: district.launch.z },
      });
      stateRef.current = next;
      throttleRef.current = hoverInput(NOMINAL_VEHICLE).throttle;
      contactRef.current = null;
      traceRef.current = [];
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let hudTimer = 0;
    const frame = (now: number) => {
      const frameDt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) {
        accumulator = Math.min(accumulator + frameDt, 0.05);
        let steps = 0;
        while (accumulator >= SIM_DT_S && steps < 12) {
          const pilot = readPilot(keysRef.current, throttleRef.current, SIM_DT_S);
          throttleRef.current = pilot.throttle;
          const motors = attitudeMotors(stateRef.current, pilot, modeRef.current, NOMINAL_VEHICLE);
          const stepped = stepRigidBody(stateRef.current, motors, SIM_DT_S, NOMINAL_VEHICLE);
          const resolved = resolveContacts(stepped.state, district.boxes, NOMINAL_VEHICLE.radiusM);
          stateRef.current = resolved.state;
          motorsRef.current = stepped.motorsN;
          contactRef.current = resolved.contact;
          accumulator -= SIM_DT_S;
          steps += 1;
        }
        const state = stateRef.current;
        const lastSample = traceRef.current[traceRef.current.length - 1];
        if (!lastSample || state.timeS - lastSample.timeS >= 0.1) {
          traceRef.current = [...traceRef.current, { timeS: state.timeS, altitudeM: state.positionM.z }].slice(-120);
        }
      } else {
        throttleRef.current = integrateThrottle(throttleRef.current, keysRef.current, frameDt);
      }
      poseRef.current = {
        position: stateRef.current.positionM,
        quaternion: stateRef.current.quaternion,
        motors: motorsRef.current,
      };
      renderRef.current();
      hudTimer += frameDt;
      if (hudTimer >= 0.1) {
        hudTimer = 0;
        const thrust = motorsRef.current.reduce((sum, motor) => sum + motor, 0);
        setHud({
          state: stateRef.current,
          motors: motorsRef.current,
          thrustN: thrust,
          contact: contactRef.current,
          mode: modeRef.current,
          paused: pausedRef.current,
          trace: traceRef.current,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [district]);

  useChrome(paused ? "Paused" : "Running", mode === "stabilized" ? "Stabilized" : "Acro");

  const angles = rhAngles(hud.state.quaternion);
  const horizontal = Math.hypot(hud.state.velocityM_S.x, hud.state.velocityM_S.y);
  const answer = question
    ? explain(question, {
        state: hud.state,
        mode: hud.mode,
        thrustN: hud.thrustN,
        massKg: NOMINAL_VEHICLE.massKg,
        weightN: hoverThrustN(NOMINAL_VEHICLE),
        landing: null,
      })
    : null;

  return (
    <div className="fly-shell">
      <div className="fly-stage">
        <CityViewport district={district} poseRef={poseRef} cameraMode={cameraMode} renderRef={renderRef} />
      </div>
      <div className="fly-status">
        <span>{paused ? "Paused" : "Running"}</span>
        <span>{mode === "stabilized" ? "Stabilized" : "Acro"}</span>
        <span>{cameraMode === "fpv" ? "FPV" : cameraMode === "chase" ? "Chase" : "External"}</span>
        <span className="mono">{hud.state.timeS.toFixed(1)} s</span>
      </div>
      <div className="fly-toggles">
        <button type="button" aria-pressed={panels.left} onClick={() => setPanels((p) => ({ ...p, left: !p.left }))}>
          Controls
        </button>
        <button type="button" aria-pressed={panels.right} onClick={() => setPanels((p) => ({ ...p, right: !p.right }))}>
          Telemetry
        </button>
        <button type="button" aria-pressed={panels.bottom} onClick={() => setPanels((p) => ({ ...p, bottom: !p.bottom }))}>
          Timeline
        </button>
        <label>
          Camera
          <select value={cameraMode} onChange={(event) => setCameraMode(event.target.value as CameraMode)}>
            <option value="fpv">FPV</option>
            <option value="chase">Chase</option>
            <option value="external">External</option>
          </select>
        </label>
        <label>
          Mode
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as ControlMode)}
          >
            <option value="stabilized">Stabilized</option>
            <option value="acro">Acro</option>
          </select>
        </label>
        <button type="button" onClick={() => setPaused((value) => !value)}>
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      {panels.left ? (
        <aside className="hud hud-left">
          <header className="panel-head">
            <h2>Flight</h2>
            <p>{district.label}</p>
          </header>
          <p className="end-state">{district.disclaimer}</p>
          <p className="field-hint">
            W/S nose down/up. A/D roll. Q/E yaw. Shift/Ctrl throttle. P pause. R reset. A connected gamepad uses the
            left stick, right stick X, and the triggers for the same axes.
          </p>
          <p className="field-hint">
            {mode === "stabilized"
              ? "Stabilized mode levels roll and pitch when the sticks are centered. Throttle is collective thrust, not an altitude hold."
              : "Acro mode commands body rates and does not level the vehicle."}
          </p>
          <p className="mono">
            Mass {NOMINAL_VEHICLE.massKg.toFixed(2)} kg · T/W{" "}
            {(NOMINAL_VEHICLE.thrustMaxN / hoverThrustN(NOMINAL_VEHICLE)).toFixed(1)} · arm{" "}
            {NOMINAL_VEHICLE.motorRadiusM.toFixed(2)} m
          </p>
          <h3>Environment</h3>
          <ul className="criteria">
            <li>
              <span>Manhattan, fictional district</span>
              <span className="pass">Loaded</span>
            </li>
            <li>
              <span>Washington, London, San Francisco</span>
              <span>Not built</span>
            </li>
          </ul>
          <details>
            <summary>Instructor</summary>
            <p className="field-hint">{INSTRUCTOR_NOTE}</p>
            <div className="stack">
              {(
                [
                  ["drift", "Why is it drifting?"],
                  ["thrust", "What does thrust do?"],
                  ["axes", "Pitch, roll, and yaw"],
                  ["controller", "What is this controller?"],
                  ["landing", "Why did a landing fail?"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className="stack-button" onClick={() => setQuestion(id)}>
                  {label}
                </button>
              ))}
            </div>
            {answer ? <Typewriter text={answer} /> : null}
          </details>
        </aside>
      ) : null}
      {panels.right ? (
        <aside className="hud hud-right">
          <header className="panel-head">
            <h2>State</h2>
            <p className="mono">{hud.contact ? hud.contact.id : "airborne"}</p>
          </header>
          <dl className="hud-metrics">
            <Metric label="Altitude" value={`${hud.state.positionM.z.toFixed(2)} m`} />
            <Metric label="Vertical speed" value={`${signed(hud.state.velocityM_S.z)} m/s`} />
            <Metric label="Horizontal speed" value={`${horizontal.toFixed(2)} m/s`} />
            <Metric label="Heading" value={`${headingDegFromNorth(hud.state.quaternion).toFixed(0)}°`} />
            <Metric label="Pitch nose up" value={`${signed((-angles.pitchRh * 180) / Math.PI)}°`} />
            <Metric label="Roll right down" value={`${signed((-angles.rollRh * 180) / Math.PI)}°`} />
            <Metric label="Speed" value={`${length(hud.state.velocityM_S).toFixed(2)} m/s`} />
            <Metric label="Thrust" value={`${hud.thrustN.toFixed(2)} N`} />
            <Metric label="Weight" value={`${hoverThrustN(NOMINAL_VEHICLE).toFixed(2)} N`} />
          </dl>
          <h3>Motors</h3>
          <ul className="criteria">
            {["FL", "FR", "RR", "RL"].map((name, index) => (
              <li key={name}>
                <span>{name}</span>
                <span>{hud.motors[index].toFixed(2)} N</span>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      {panels.bottom ? (
        <section className="hud hud-bottom">
          <header className="panel-head">
            <h2>Altitude</h2>
            <p className="mono">10 Hz from the integrator</p>
          </header>
          <AltitudeSpark samples={hud.trace} />
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}

function AltitudeSpark({ samples }: { samples: { timeS: number; altitudeM: number }[] }) {
  if (samples.length < 2) {
    return <p className="empty-copy">Altitude samples appear after the vehicle moves.</p>;
  }
  const width = 640;
  const height = 72;
  const minZ = Math.min(...samples.map((sample) => sample.altitudeM), 0);
  const maxZ = Math.max(...samples.map((sample) => sample.altitudeM), minZ + 1);
  const t0 = samples[0].timeS;
  const t1 = samples[samples.length - 1].timeS;
  const points = samples
    .map((sample) => {
      const x = ((sample.timeS - t0) / (t1 - t0 || 1)) * width;
      const y = height - ((sample.altitudeM - minZ) / (maxZ - minZ || 1)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="spark" role="img" aria-label="Altitude versus simulation time">
      <polyline points={points} fill="none" stroke="#75a9cb" strokeWidth="1.5" />
    </svg>
  );
}

function Typewriter({ text }: { text: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const id = window.setInterval(() => {
      setCount((value) => (value < text.length ? value + 2 : value));
    }, 16);
    return () => window.clearInterval(id);
  }, [text]);
  return <p className="end-state">{text.slice(0, count)}</p>;
}

function typing(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function isFlightKey(code: string): boolean {
  return ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyP", "KeyR", "KeyZ", "Space"].includes(code);
}

function signed(value: number): string {
  const text = value.toFixed(2);
  return value > 0 ? `+${text}` : text;
}
