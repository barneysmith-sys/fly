import { useEffect, useRef, useState } from "react";
import { BaseViewport, type AircraftPose, type CameraMode } from "../components/BaseViewport";
import { Preflight } from "../components/Preflight";
import { useChrome } from "../chrome";
import { EXPLORER_4 } from "../sim/aircraft";
import { attitudeMotors, type ControlMode } from "../sim/control";
import { resolveContacts, type Contact } from "../sim/collision";
import type { Site } from "../sim/coastal";
import {
  DEFAULT_BINDING,
  formatCode,
  gamepadSummary,
  loadBinding,
  loadDeadzone,
  readPilot,
  saveBinding,
  saveDeadzone,
  ZERO_TOUCH,
  type Binding,
  type TouchCommand,
} from "../sim/input";
import { headingDegFromNorth, rhAngles, tiltFromVerticalRad } from "../sim/math";
import { lagMotors } from "../sim/motorLag";
import { stepRigidBody } from "../sim/rigidBody";
import { ACADEMY_STAGES, hoverIsStable, stageComplete } from "../sim/tutorial";
import { equalMotors, hoverThrustN, vehicleState, type MotorsN, type VehicleState } from "../sim/vehicle";

const SIM_DT_S = 0.005;
const SCORE_KEY = "fly.coastalLandings.v1";
const ACADEMY_KEY = "fly.academy.v1";

type Mission = "free" | "academy" | "precision";

type LandingScore = {
  timeS: number;
  positionErrorM: number;
  verticalSpeedM_S: number;
  horizontalSpeedM_S: number;
  collisions: number;
  success: boolean;
};

type Hud = {
  state: VehicleState;
  motors: MotorsN;
  thrustN: number;
  throttle: number;
  contact: Contact | null;
  mode: ControlMode;
  paused: boolean;
  mission: Mission;
  stage: number;
  padDistanceM: number;
  collisions: number;
  score: LandingScore | null;
  gamepad: string | null;
};

type FlyPageProps = {
  site: Site;
};

export function FlyPage({ site }: FlyPageProps) {
  const [phase, setPhase] = useState<"preflight" | "flight">("preflight");
  if (phase === "preflight") {
    return (
      <div className="fly-shell">
        <Preflight onEnter={() => setPhase("flight")} />
      </div>
    );
  }
  return <FlightSession site={site} onPreflight={() => setPhase("preflight")} />;
}

function FlightSession({ site, onPreflight }: { site: Site; onPreflight: () => void }) {
  const aircraft = EXPLORER_4;
  const spawn = () =>
    vehicleState({
      positionM: {
        x: site.launch.x,
        y: site.launch.y,
        z: site.launch.z + aircraft.params.radiusM,
      },
      quaternion: site.launchQuaternion,
    });
  const initial = spawn();
  const stateRef = useRef<VehicleState>(initial);
  const motorsRef = useRef<MotorsN>(equalMotors(0));
  const contactRef = useRef<Contact | null>(null);
  const keysRef = useRef(new Set<string>());
  const throttleRef = useRef(0);
  const pausedRef = useRef(false);
  const modeRef = useRef<ControlMode>("stabilized");
  const missionRef = useRef<Mission>(localStorage.getItem(ACADEMY_KEY) === "done" ? "free" : "academy");
  const stageRef = useRef(0);
  const hoverHeldRef = useRef(0);
  const launchHeadingRef = useRef(headingDegFromNorth(initial.quaternion));
  const collisionsRef = useRef(0);
  const lastContactRef = useRef<string | null>(null);
  const scoredRef = useRef(false);
  const scoreRef = useRef<LandingScore | null>(null);
  const bindingRef = useRef<Binding>(loadBinding());
  const deadzoneRef = useRef(loadDeadzone());
  const touchRef = useRef<TouchCommand>({ ...ZERO_TOUCH });
  const captureRef = useRef<keyof Binding | null>(null);
  const poseRef = useRef<AircraftPose>({
    position: initial.positionM,
    quaternion: initial.quaternion,
    motors: motorsRef.current,
  });
  const renderRef = useRef<() => void>(() => {});
  const [cameraMode, setCameraMode] = useState<CameraMode>("chase");
  const [mode, setMode] = useState<ControlMode>("stabilized");
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [chromeOn, setChromeOn] = useState(true);
  const [help, setHelp] = useState(false);
  const [mission, setMission] = useState<Mission>(missionRef.current);
  const [binding, setBinding] = useState<Binding>(bindingRef.current);
  const [deadzone, setDeadzone] = useState(deadzoneRef.current);
  const [capture, setCapture] = useState<keyof Binding | null>(null);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [hud, setHud] = useState<Hud>({
    state: initial,
    motors: motorsRef.current,
    thrustN: 0,
    throttle: 0,
    contact: null,
    mode: "stabilized",
    paused: false,
    mission: missionRef.current,
    stage: 0,
    padDistanceM: padDistance(initial, site),
    collisions: 0,
    score: null,
    gamepad: null,
  });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    missionRef.current = mission;
  }, [mission]);
  useEffect(() => {
    bindingRef.current = binding;
  }, [binding]);
  useEffect(() => {
    deadzoneRef.current = deadzone;
  }, [deadzone]);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  useEffect(() => {
    const reset = () => {
      const next = spawn();
      stateRef.current = next;
      motorsRef.current = equalMotors(0);
      throttleRef.current = 0;
      contactRef.current = null;
      hoverHeldRef.current = 0;
      launchHeadingRef.current = headingDegFromNorth(next.quaternion);
      collisionsRef.current = 0;
      lastContactRef.current = null;
      scoredRef.current = false;
      scoreRef.current = null;
      stageRef.current = 0;
    };
    const onDown = (event: KeyboardEvent) => {
      if (typing(event)) {
        return;
      }
      if (captureRef.current) {
        event.preventDefault();
        const slot = captureRef.current;
        if (event.code === "Escape") {
          setCapture(null);
          return;
        }
        setBinding((current) => {
          const next = { ...current, [slot]: event.code };
          saveBinding(next);
          return next;
        });
        setCapture(null);
        return;
      }
      const bound = Object.values(bindingRef.current);
      if (bound.includes(event.code) || event.code === "Space" || event.code === "ArrowUp" || event.code === "ArrowDown" || event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
      }
      keysRef.current.add(event.code);
      if (event.repeat) {
        return;
      }
      if (event.code === "Space") {
        setPaused((value) => !value);
      }
      if (event.code === "Escape") {
        setMenu((value) => !value);
        setPaused(true);
      }
      if (event.code === "KeyC") {
        setCameraMode((value) => (value === "fpv" ? "chase" : "fpv"));
      }
      if (event.code === "KeyH") {
        setHelp((value) => !value);
      }
      if (event.code === "KeyR" && !event.metaKey && !event.ctrlKey) {
        reset();
      }
    };
    const onUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
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
          const pilot = readPilot(keysRef.current, throttleRef.current, SIM_DT_S, {
            binding: bindingRef.current,
            deadzone: deadzoneRef.current,
            touch: touchRef.current,
          });
          throttleRef.current = pilot.throttle;
          const command = attitudeMotors(stateRef.current, pilot, modeRef.current, aircraft.params, aircraft.gains);
          const lagged = lagMotors(motorsRef.current, command, SIM_DT_S, aircraft.motorTauS);
          const stepped = stepRigidBody(stateRef.current, lagged, SIM_DT_S, aircraft.params);
          const resolved = resolveContacts(stepped.state, site.boxes, aircraft.params.radiusM);
          stateRef.current = resolved.state;
          motorsRef.current = lagged;
          contactRef.current = resolved.contact;
          const contactId = resolved.contact?.id ?? null;
          if (contactId && contactId !== "ground" && contactId !== "precision-pad" && contactId !== lastContactRef.current) {
            collisionsRef.current += 1;
          }
          lastContactRef.current = contactId;
          if (missionRef.current === "academy") {
            const snap = snapshot(resolved.state, site, hoverHeldRef.current, launchHeadingRef.current);
            if (hoverIsStable(snap)) {
              hoverHeldRef.current += SIM_DT_S;
            } else {
              hoverHeldRef.current = 0;
            }
            const live = {
              ...snap,
              hoverHeldS: hoverHeldRef.current,
              onPad: resolved.contact?.pad === true,
            };
            if (stageComplete(stageRef.current, live) && stageRef.current < ACADEMY_STAGES.length) {
              stageRef.current += 1;
              if (stageRef.current >= ACADEMY_STAGES.length) {
                localStorage.setItem(ACADEMY_KEY, "done");
              }
            }
          }
          if (missionRef.current === "precision" && !scoredRef.current && resolved.contact?.pad) {
            const error = padDistance(resolved.state, site);
            const vh = Math.hypot(resolved.state.velocityM_S.x, resolved.state.velocityM_S.y);
            const success = error <= 1.6 && Math.abs(resolved.state.velocityM_S.z) <= 0.9 && vh <= 1.2 && tiltFromVerticalRad(resolved.state.quaternion) <= 0.28;
            if (success || (Math.abs(resolved.state.velocityM_S.z) < 0.2 && vh < 0.4)) {
              const score: LandingScore = {
                timeS: resolved.state.timeS,
                positionErrorM: error,
                verticalSpeedM_S: resolved.state.velocityM_S.z,
                horizontalSpeedM_S: vh,
                collisions: collisionsRef.current,
                success,
              };
              scoreRef.current = score;
              scoredRef.current = true;
              const prior = loadScores();
              localStorage.setItem(SCORE_KEY, JSON.stringify([...prior, score].slice(-12)));
            }
          }
          accumulator -= SIM_DT_S;
          steps += 1;
        }
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
        const pad = gamepadSummary(deadzoneRef.current);
        setHud({
          state: stateRef.current,
          motors: motorsRef.current,
          thrustN: motorsRef.current.reduce((sum, motor) => sum + motor, 0),
          throttle: throttleRef.current,
          contact: contactRef.current,
          mode: modeRef.current,
          paused: pausedRef.current,
          mission: missionRef.current,
          stage: stageRef.current,
          padDistanceM: padDistance(stateRef.current, site),
          collisions: collisionsRef.current,
          score: scoreRef.current,
          gamepad: pad ? pad.id : null,
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
  }, [aircraft, site]);

  useChrome(paused ? "Paused" : "Running", mode === "stabilized" ? "Stabilized" : "Acro");

  const angles = rhAngles(hud.state.quaternion);
  const horizontal = Math.hypot(hud.state.velocityM_S.x, hud.state.velocityM_S.y);
  const stage = ACADEMY_STAGES[Math.min(hud.stage, ACADEMY_STAGES.length - 1)];
  const academyDone = hud.stage >= ACADEMY_STAGES.length;

  const chooseMission = (next: Mission) => {
    setMission(next);
    missionRef.current = next;
    setMenu(false);
  };

  return (
    <div className="fly-shell">
      <div className="fly-stage">
        <BaseViewport
          site={site}
          poseRef={poseRef}
          cameraMode={cameraMode}
          paused={paused}
          quality={quality}
          renderRef={renderRef}
        />
      </div>
      <div className="vignette" />
      {chromeOn ? (
        <>
          <div className="fly-status">
            <span>{paused ? "Paused" : "Running"}</span>
            <span>{mode === "stabilized" ? "Stabilized" : "Acro"}</span>
            <span>{cameraMode === "fpv" ? "FPV" : cameraMode === "chase" ? "Chase" : "Orbit"}</span>
            <span className="mono">{hud.state.timeS.toFixed(1)} s</span>
            <span className="mono">THR {Math.round(hud.throttle * 100)}%</span>
          </div>
          <div className="fly-toggles">
            <button type="button" aria-pressed={help} onClick={() => setHelp((value) => !value)}>
              Controls
            </button>
            <label>
              Camera
              <select value={cameraMode} onChange={(event) => setCameraMode(event.target.value as CameraMode)}>
                <option value="fpv">FPV</option>
                <option value="chase">Chase</option>
                <option value="orbit">Orbit</option>
              </select>
            </label>
            <label>
              Mode
              <select value={mode} onChange={(event) => setMode(event.target.value as ControlMode)}>
                <option value="stabilized">Stabilized</option>
                <option value="acro">Acro</option>
              </select>
            </label>
            <label>
              Task
              <select value={mission} onChange={(event) => chooseMission(event.target.value as Mission)}>
                <option value="free">Free flight</option>
                <option value="academy">Flight academy</option>
                <option value="precision">Precision landing</option>
              </select>
            </label>
            <button type="button" onClick={() => setPaused((value) => !value)}>
              {paused ? "Resume" : "Pause"}
            </button>
            <button type="button" onClick={() => setChromeOn(false)}>
              Hide
            </button>
          </div>
          <aside className="hud hud-right">
            <header className="panel-head">
              <h2>State</h2>
              <p className="mono">{hud.contact ? hud.contact.id : "airborne"}</p>
            </header>
            <Attitude
              pitchDeg={(-angles.pitchRh * 180) / Math.PI}
              rollDeg={(-angles.rollRh * 180) / Math.PI}
            />
            <dl className="hud-metrics">
              <Metric label="Altitude" value={`${hud.state.positionM.z.toFixed(2)} m`} />
              <Metric label="Vertical speed" value={`${signed(hud.state.velocityM_S.z)} m/s`} />
              <Metric label="Horizontal speed" value={`${horizontal.toFixed(2)} m/s`} />
              <Metric label="Heading" value={`${headingDegFromNorth(hud.state.quaternion).toFixed(0)}°`} />
              <Metric label="Pitch nose up" value={`${signed((-angles.pitchRh * 180) / Math.PI)}°`} />
              <Metric label="Roll right down" value={`${signed((-angles.rollRh * 180) / Math.PI)}°`} />
              <Metric label="Thrust" value={`${hud.thrustN.toFixed(2)} N`} />
              <Metric label="Weight" value={`${hoverThrustN(aircraft.params).toFixed(2)} N`} />
            </dl>
            <div className="throttle-bar" aria-hidden="true">
              <span style={{ width: `${Math.round(hud.throttle * 100)}%` }} />
            </div>
            <p className="field-hint">
              Pad {hud.padDistanceM.toFixed(1)} m · contacts {hud.collisions}
              {hud.gamepad ? ` · ${hud.gamepad}` : " · no gamepad"}
            </p>
            {mission === "precision" && hud.score ? (
              <p className={hud.score.success ? "pass" : "fail"}>
                {hud.score.success ? "Within limits" : "Outside limits"} · {hud.score.positionErrorM.toFixed(2)} m ·{" "}
                {hud.score.verticalSpeedM_S.toFixed(2)} m/s · {hud.score.timeS.toFixed(1)} s
              </p>
            ) : null}
          </aside>
          {help ? (
            <aside className="hud hud-left control-card">
              <header className="panel-head">
                <h2>Controls</h2>
                <p>Hold to command</p>
              </header>
              <ControlMap binding={binding} />
              <p className="field-hint">
                Throttle changes thrust through the mixer. It does not set altitude. C switches FPV and chase. Space pauses. Esc opens the menu. R resets.
              </p>
              <p className="field-hint">
                {mode === "stabilized"
                  ? "Stabilized mode levels roll and pitch when the arrows are centered."
                  : "Acro commands body rates and does not level the aircraft."}
              </p>
              <h3>Remap</h3>
              <div className="remap">
                {(Object.keys(DEFAULT_BINDING) as (keyof Binding)[]).map((key) => (
                  <button key={key} type="button" onClick={() => setCapture(key)}>
                    {labelFor(key)} {capture === key ? "…" : formatCode(binding[key])}
                  </button>
                ))}
              </div>
              <label className="field">
                <span className="field-label">Gamepad dead zone {deadzone.toFixed(2)}</span>
                <input
                  type="range"
                  min={0}
                  max={0.35}
                  step={0.01}
                  value={deadzone}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setDeadzone(value);
                    saveDeadzone(value);
                  }}
                />
              </label>
              <label className="field">
                <span className="field-label">Graphics</span>
                <select value={quality} onChange={(event) => setQuality(event.target.value as "high" | "low")}>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <button type="button" onClick={onPreflight}>
                Aircraft
              </button>
            </aside>
          ) : null}
          {mission === "academy" ? (
            <section className="hud academy-card">
              <p className="eyebrow">Flight academy</p>
              <h2>
                {academyDone ? "Complete" : `${String(hud.stage + 1).padStart(2, "0")} ${stage.title}`}
              </h2>
              <p>{academyDone ? "The six stages were met on this flight. Free flight stays available." : stage.instruction}</p>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(ACADEMY_KEY, "done");
                  chooseMission("free");
                }}
              >
                Skip tutorial
              </button>
            </section>
          ) : null}
          {mission === "precision" ? (
            <section className="hud academy-card">
              <p className="eyebrow">Precision landing</p>
              <h2>{hud.padDistanceM.toFixed(1)} m</h2>
              <p>Lift off the launch ring and land on the amber pad. The score uses this touchdown only.</p>
            </section>
          ) : null}
        </>
      ) : (
        <button type="button" className="show-hud" onClick={() => setChromeOn(true)}>
          Show instruments
        </button>
      )}
      <TouchDeck
        onChange={(command) => {
          touchRef.current = command;
        }}
      />
      {menu ? (
        <div className="pause-menu" role="dialog" aria-label="Pause menu">
          <p className="eyebrow">Paused</p>
          <h2>Coastal Base 01</h2>
          <div className="stack">
            <button type="button" className="primary" onClick={() => { setPaused(false); setMenu(false); }}>
              Resume
            </button>
            <button type="button" onClick={() => chooseMission("free")}>Free flight</button>
            <button type="button" onClick={() => chooseMission("academy")}>Flight academy</button>
            <button type="button" onClick={() => chooseMission("precision")}>Precision landing</button>
            <button type="button" onClick={onPreflight}>Aircraft systems</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TouchDeck({ onChange }: { onChange: (command: TouchCommand) => void }) {
  const command = useRef<TouchCommand>({ ...ZERO_TOUCH });
  const setStick = (side: "left" | "right", x: number, y: number) => {
    if (side === "left") {
      command.current = {
        ...command.current,
        yaw: x,
        throttleUp: y < -0.25,
        throttleDown: y > 0.25,
      };
    } else {
      command.current = { ...command.current, roll: x, pitch: -y };
    }
    onChange({ ...command.current });
  };
  const clear = (side: "left" | "right") => {
    if (side === "left") {
      command.current = { ...command.current, yaw: 0, throttleUp: false, throttleDown: false };
    } else {
      command.current = { ...command.current, roll: 0, pitch: 0 };
    }
    onChange({ ...command.current });
  };
  return (
    <div className="touch-deck">
      <Stick label="Throttle / yaw" onChange={(x, y) => setStick("left", x, y)} onRelease={() => clear("left")} />
      <Stick label="Pitch / roll" onChange={(x, y) => setStick("right", x, y)} onRelease={() => clear("right")} />
    </div>
  );
}

function Stick({
  label,
  onChange,
  onRelease,
}: {
  label: string;
  onChange: (x: number, y: number) => void;
  onRelease: () => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const emit = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) {
      return;
    }
    const rect = pad.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
    onChange(x, y);
  };
  return (
    <div
      ref={padRef}
      className="stick"
      role="slider"
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        emit(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          emit(event.clientX, event.clientY);
        }
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onRelease();
      }}
    />
  );
}

function ControlMap({ binding }: { binding: Binding }) {
  return (
    <ul className="criteria">
      <li><span>{formatCode(binding.throttleUp)} / {formatCode(binding.throttleDown)}</span><span>Throttle</span></li>
      <li><span>{formatCode(binding.yawLeft)} / {formatCode(binding.yawRight)}</span><span>Yaw</span></li>
      <li><span>{formatCode(binding.pitchForward)} / {formatCode(binding.pitchBack)}</span><span>Pitch</span></li>
      <li><span>{formatCode(binding.rollLeft)} / {formatCode(binding.rollRight)}</span><span>Roll</span></li>
    </ul>
  );
}

function Attitude({ pitchDeg, rollDeg }: { pitchDeg: number; rollDeg: number }) {
  const y = Math.max(-28, Math.min(28, pitchDeg));
  return (
    <svg className="attitude" viewBox="0 0 160 70" role="img" aria-label="Attitude">
      <line x1="20" y1="35" x2="140" y2="35" stroke="#2b3946" />
      <g transform={`translate(80 35) rotate(${rollDeg}) translate(0 ${y})`}>
        <line x1="-46" y1="0" x2="46" y2="0" stroke="#75a9cb" strokeWidth="2" />
      </g>
    </svg>
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

function padDistance(state: VehicleState, site: Site): number {
  return Math.hypot(state.positionM.x - site.pad.x, state.positionM.y - site.pad.y);
}

function snapshot(state: VehicleState, site: Site, hoverHeldS: number, launchHeading: number) {
  const heading = headingDegFromNorth(state.quaternion);
  let yawDelta = heading - launchHeading;
  if (yawDelta > 180) yawDelta -= 360;
  if (yawDelta < -180) yawDelta += 360;
  return {
    altitudeM: state.positionM.z,
    verticalSpeedM_S: state.velocityM_S.z,
    horizontalSpeedM_S: Math.hypot(state.velocityM_S.x, state.velocityM_S.y),
    distanceFromLaunchM: Math.hypot(state.positionM.x - site.launch.x, state.positionM.y - site.launch.y),
    yawDeltaDeg: yawDelta,
    distanceToPadM: padDistance(state, site),
    onPad: false,
    hoverHeldS,
  };
}

function loadScores(): LandingScore[] {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LandingScore[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function labelFor(key: keyof Binding): string {
  const labels: Record<keyof Binding, string> = {
    throttleUp: "Throttle up",
    throttleDown: "Throttle down",
    yawLeft: "Yaw left",
    yawRight: "Yaw right",
    pitchForward: "Pitch forward",
    pitchBack: "Pitch back",
    rollLeft: "Roll left",
    rollRight: "Roll right",
  };
  return labels[key];
}

function typing(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function signed(value: number): string {
  const text = value.toFixed(2);
  return value > 0 ? `+${text}` : text;
}
