import { useRef, useState } from "react";
import { CityViewport, type CityPose } from "../components/CityViewport";
import { buildingBox } from "../sim/collision";
import type { District } from "../sim/district";
import { useChrome } from "../chrome";
import { episodeStart, landingGoalFromPad, runLandingEpisode, type LandingMetrics } from "../sim/landing";
import { IDENTITY_QUAT } from "../sim/math";
import { NOMINAL_VEHICLE } from "../sim/vehicle";

type TrainPageProps = { district: District };

export function TrainPage({ district }: TrainPageProps) {
  const pad = district.pad;
  const goal = landingGoalFromPad(pad);
  const box = buildingBox(pad.id, pad.x, pad.y, 26, 22, pad.z, true);
  const [controller, setController] = useState<"position" | "vertical">("position");
  const [runs, setRuns] = useState<LandingMetrics[]>([]);
  const [active, setActive] = useState<LandingMetrics | null>(null);
  const poseRef = useRef<CityPose>({
    position: { x: pad.x, y: pad.y, z: pad.z + 8 },
    quaternion: IDENTITY_QUAT,
    motors: [0, 0, 0, 0],
  });
  const renderRef = useRef<() => void>(() => {});
  const playRef = useRef(0);

  const run = () => {
    const result = runLandingEpisode({
      controller,
      initial: episodeStart(pad),
      goal,
      boxes: [box],
    });
    setRuns((current) => [...current, result]);
    setActive(result);
    play(result);
  };

  const play = (result: LandingMetrics) => {
    window.cancelAnimationFrame(playRef.current);
    let index = 0;
    let last = performance.now();
    const step = (now: number) => {
      if (now - last >= 50) {
        last = now;
        const sample = result.samples[Math.min(index, result.samples.length - 1)];
        poseRef.current = {
          position: sample.positionM,
          quaternion: sample.quaternion,
          motors: [0, 0, 0, 0],
        };
        renderRef.current();
        index += 1;
      } else {
        renderRef.current();
      }
      if (index < result.samples.length) {
        playRef.current = requestAnimationFrame(step);
      }
    };
    playRef.current = requestAnimationFrame(step);
  };

  const successes = runs.filter((item) => item.success).length;
  useChrome(
    active ? "Episode scored" : "No episode",
    controller === "position" ? "Position descent" : "Vertical descent",
  );

  return (
    <div className="fly-shell">
      <div className="fly-stage">
        <CityViewport district={district} poseRef={poseRef} cameraMode="external" renderRef={renderRef} />
      </div>
      <aside className="hud hud-left">
        <header className="panel-head">
          <h2>Landing</h2>
          <p>Deterministic</p>
        </header>
        <p className="end-state">
          The episode integrates the same 6-DOF model used in Flight. The position controller steers toward the marked
          roof, then descends. Vertical descent holds attitude level and does not correct horizontally. Neither
          controller learns.
        </p>
        <label className="field">
          <span className="field-label">Controller</span>
          <select value={controller} onChange={(event) => setController(event.target.value as "position" | "vertical")}>
            <option value="position">Position, then descend</option>
            <option value="vertical">Vertical descent only</option>
          </select>
        </label>
        <p className="field-hint">
          Start is 5 m east and 4 m south of the pad, 8 m above the roof. Pad {pad.x.toFixed(0)} m east, {pad.y.toFixed(0)}{" "}
          m north, roof {pad.z.toFixed(0)} m. Touchdown height adds the {NOMINAL_VEHICLE.radiusM} m body radius.
        </p>
        <div className="form-actions">
          <button type="button" className="primary" onClick={run}>
            Run episode
          </button>
          {active ? (
            <button type="button" onClick={() => play(active)}>
              Replay
            </button>
          ) : null}
        </div>
        <p className="milestone">
          Coming in a future milestone: a learned policy. There is no training curve because nothing is being trained.
          The controller interface is <span className="mono">landingMotors(state) → motor thrusts</span>.
        </p>
      </aside>
      <aside className="hud hud-right">
        <header className="panel-head">
          <h2>Last episode</h2>
          <p>{active ? active.controller : "none"}</p>
        </header>
        {active ? (
          <dl className="hud-metrics">
            <div>
              <dt>Result</dt>
              <dd className={active.success ? "pass" : "fail"}>{active.success ? "Within limits" : "Outside limits"}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{active.reason}</dd>
            </div>
            <div>
              <dt>Position error</dt>
              <dd className="mono">{active.positionErrorM.toFixed(2)} m</dd>
            </div>
            <div>
              <dt>Vertical speed</dt>
              <dd className="mono">{active.touchdownVerticalSpeedM_S.toFixed(2)} m/s</dd>
            </div>
            <div>
              <dt>Horizontal speed</dt>
              <dd className="mono">{active.touchdownHorizontalSpeedM_S.toFixed(2)} m/s</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd className="mono">{active.durationS.toFixed(2)} s</dd>
            </div>
          </dl>
        ) : (
          <p className="empty-copy">No episode yet. A success rate is not shown until a run finishes.</p>
        )}
        <h3>Completed runs</h3>
        {runs.length === 0 ? (
          <p className="field-hint">0 episodes. Nothing has been scored.</p>
        ) : (
          <p className="field-hint">
            {successes} of {runs.length} met the pad limits. That count is only the episodes run in this browser
            session.
          </p>
        )}
        <ul className="criteria">
          {runs.slice(-6).map((item, index) => (
            <li key={`${item.controller}-${item.durationS}-${index}`}>
              <span>{item.controller}</span>
              <span className={item.success ? "pass" : "fail"}>
                {item.positionErrorM.toFixed(2)} m
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
