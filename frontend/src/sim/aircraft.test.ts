import assert from "node:assert/strict";
import test from "node:test";
import { EXPLORER_4 } from "./aircraft.ts";
import { hoverInput } from "./control.ts";
import { lagMotors } from "./motorLag.ts";
import { hoverIsStable, stageComplete, type TutorialSnapshot } from "./tutorial.ts";
import { hoverThrustN, NOMINAL_VEHICLE } from "./vehicle.ts";

test("EXPLORER-4 is the nominal teaching quadcopter", () => {
  assert.equal(EXPLORER_4.params.massKg, NOMINAL_VEHICLE.massKg);
  assert.ok(EXPLORER_4.params.thrustMaxN > hoverThrustN(EXPLORER_4.params));
  assert.equal(EXPLORER_4.parts.length, 8);
  assert.ok(EXPLORER_4.parts.some((part) => part.id === "sensors" && part.short.includes("No IMU")));
  const hover = hoverInput(EXPLORER_4.params);
  assert.ok(hover.throttle > 0.2 && hover.throttle < 0.5);
});

test("motor lag moves toward the command without passing it", () => {
  let motors: [number, number, number, number] = [0, 0, 0, 0];
  for (let step = 0; step < 40; step += 1) {
    const next = lagMotors(motors, [2, 2, 2, 2], 0.01, 0.06);
    assert.ok(next[0] > motors[0]);
    assert.ok(next[0] < 2);
    motors = next;
  }
  assert.ok(motors[0] > 1.5);
});

test("academy stages accept the matching maneuver and reject a sit", () => {
  const idle: TutorialSnapshot = {
    altitudeM: 0.18,
    verticalSpeedM_S: 0,
    horizontalSpeedM_S: 0,
    distanceFromLaunchM: 0,
    yawDeltaDeg: 0,
    distanceToPadM: 40,
    onPad: false,
    hoverHeldS: 0,
  };
  assert.equal(stageComplete(0, idle), false);
  assert.equal(stageComplete(0, { ...idle, altitudeM: 1.4 }), true);
  assert.equal(stageComplete(1, { ...idle, altitudeM: 2, hoverHeldS: 2.1 }), true);
  assert.equal(hoverIsStable({ altitudeM: 2, verticalSpeedM_S: 0.1, horizontalSpeedM_S: 0.2 }), true);
  assert.equal(stageComplete(5, { ...idle, onPad: true, altitudeM: 0.3 }), true);
});
