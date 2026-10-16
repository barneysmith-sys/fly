import assert from "node:assert/strict";
import test from "node:test";
import {
  controlsComplete,
  hoverIsStable,
  hoverProgress,
  inspectionComplete,
  judgeLanding,
  nextStage,
  takeoffReached,
  verticalForceNote,
} from "./mission.ts";
import { classifyMotion, runOpenLoop, runPlant } from "./verticalPlant.ts";

test("mission stages advance only when the measured condition is met", () => {
  assert.equal(inspectionComplete({ propeller: true, motor: true, controller: false }), false);
  assert.equal(inspectionComplete({ propeller: true, motor: true, controller: true }), true);
  assert.equal(
    controlsComplete({ throttleUp: true, throttleDown: true, yaw: true, pitch: true, roll: false }),
    false,
  );
  assert.equal(takeoffReached(2.05, false), true);
  assert.equal(takeoffReached(2.4, true), false);
  assert.equal(nextStage("takeoff"), "hover");
  assert.equal(nextStage("debrief"), "debrief");
});

test("hover progress follows the stable samples and resets when the check fails", () => {
  const stable = { altitudeM: 2.1, verticalSpeedM_S: 0.1, horizontalSpeedM_S: 0.2, tiltRad: 0.05 };
  assert.equal(hoverIsStable(stable), true);
  assert.equal(hoverIsStable({ ...stable, altitudeM: 4 }), false);
  assert.equal(hoverIsStable({ ...stable, verticalSpeedM_S: 1.2 }), false);
  let held = 0;
  for (let step = 0; step < 60; step += 1) {
    held = hoverIsStable(stable) ? held + 0.1 : 0;
  }
  assert.ok(hoverProgress(held) >= 1);
  held = hoverIsStable({ ...stable, altitudeM: 0.4 }) ? held : 0;
  assert.equal(held, 0);
  assert.equal(hoverProgress(0), 0);
});

test("a hard touchdown is not a success and a miss stays a miss", () => {
  const base = {
    onPad: true,
    onGround: true,
    altitudeM: 0.2,
    verticalSpeedM_S: -0.3,
    horizontalSpeedM_S: 0.2,
    tiltRad: 0.1,
    positionErrorM: 0.8,
  };
  assert.equal(judgeLanding(base), "success");
  assert.equal(judgeLanding({ ...base, verticalSpeedM_S: -2.4 }), "hard");
  assert.equal(judgeLanding({ ...base, onPad: false, positionErrorM: 8 }), "miss");
  assert.equal(judgeLanding({ ...base, onPad: false, onGround: false }), "airborne");
});

test("the browser plant labels thrust against weight without calling Python", () => {
  const config = {
    mass_kg: 1,
    gravity_m_s2: 9.80665,
    thrust_min_n: 0,
    thrust_max_n: 40,
    drag_coefficient_kg_per_m: 0,
    external_force_n: 0,
    initial_altitude_m: 2,
    initial_vertical_velocity_m_s: 0,
    target_altitude_m: 2,
    kp_n_per_m: 0,
    ki_n_per_m_s: 0,
    kd_n_s_per_m: 0,
    timestep_s: 0.01,
    duration_s: 0.2,
    ground_contact: true,
    velocity_reference_m_s: 0,
    natural_frequency_rad_s: null,
    damping_ratio: null,
    control_mode: "open_loop" as const,
    open_loop_thrust_n: 12,
  };
  const climb = runOpenLoop(config);
  assert.equal(climb.summary.initial_motion, "climb");
  assert.equal(climb.plant, "browser");
  assert.ok(climb.summary.final_altitude_m > 2);
  const hold = runOpenLoop({ ...config, open_loop_thrust_n: 9.80665 });
  assert.equal(hold.summary.initial_motion, "hold");
  assert.equal(classifyMotion(-1), "descend");
  assert.match(verticalForceNote(8, 6.37), /greater than weight/);
});

test("browser plant matches the Python reference within 1e-6", () => {
  const gravity = 9.80665;
  const shared = {
    mass_kg: 1,
    gravity_m_s2: gravity,
    thrust_min_n: 0,
    thrust_max_n: 40,
    drag_coefficient_kg_per_m: 0,
    external_force_n: 0,
    initial_vertical_velocity_m_s: 0,
    kp_n_per_m: 0,
    ki_n_per_m_s: 0,
    kd_n_s_per_m: 0,
    timestep_s: 0.01,
    ground_contact: true,
    velocity_reference_m_s: 0,
    natural_frequency_rad_s: null,
    damping_ratio: null,
    control_mode: "open_loop" as const,
  };
  const fall = runPlant({ ...shared, initial_altitude_m: 5, target_altitude_m: 5, duration_s: 1.5, open_loop_thrust_n: 0 });
  assert.ok(Math.abs(fall.summary.initial_vertical_acceleration_m_s2 - -9.80665) < 1e-9);
  assert.equal(fall.summary.final_altitude_m, 0);
  const hold = runPlant({ ...shared, initial_altitude_m: 2, target_altitude_m: 2, duration_s: 2, open_loop_thrust_n: gravity });
  assert.ok(Math.abs(hold.summary.final_altitude_m - 2) < 1e-9);
  const climb = runPlant({ ...shared, initial_altitude_m: 2, target_altitude_m: 2, duration_s: 1.5, open_loop_thrust_n: 14 });
  assert.ok(Math.abs(climb.summary.final_altitude_m - 6.71751875) < 1e-6);
  assert.ok(Math.abs(climb.summary.final_vertical_velocity_m_s - 6.290025) < 1e-6);
  const hover = runPlant({
    ...shared,
    control_mode: "pid",
    thrust_max_n: 2 * gravity,
    initial_altitude_m: 0,
    target_altitude_m: 2,
    duration_s: 12,
    kp_n_per_m: 2.25,
    kd_n_s_per_m: 3,
    open_loop_thrust_n: null,
  });
  assert.ok(Math.abs(hover.summary.initial_vertical_acceleration_m_s2 - 4.5) < 1e-9);
  assert.ok(Math.abs(hover.summary.final_altitude_m - 2) < 1e-4);
  assert.ok(Math.abs(hover.summary.final_thrust_n - gravity) < 1e-4);
});
