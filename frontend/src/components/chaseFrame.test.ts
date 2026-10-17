import assert from "node:assert/strict";
import test from "node:test";
import { CHASE_FRAME, chaseAircraftAngleDeg } from "./chaseFrame.ts";

test("the chase camera keeps EXPLORER-4 inside the frame", () => {
  const angle = chaseAircraftAngleDeg();
  const halfFov = CHASE_FRAME.fovDeg / 2;
  assert.ok(angle < halfFov - 12, `aircraft is ${angle.toFixed(1)}° off the look axis, half-FOV is ${halfFov}°`);
});
