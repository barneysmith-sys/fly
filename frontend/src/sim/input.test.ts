import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BINDING, integrateThrottle, readPilot, stickFromKeys } from "./input.ts";

test("W and S change collective thrust while arrows pitch and roll", () => {
  const up = integrateThrottle(0.2, new Set(["KeyW"]), 0.1, DEFAULT_BINDING);
  const down = integrateThrottle(0.2, new Set(["KeyS"]), 0.1, DEFAULT_BINDING);
  assert.ok(up > 0.2);
  assert.ok(down < 0.2);
  const pitched = stickFromKeys(new Set(["ArrowUp"]), DEFAULT_BINDING);
  const rolled = stickFromKeys(new Set(["ArrowRight"]), DEFAULT_BINDING);
  const yawed = stickFromKeys(new Set(["KeyA"]), DEFAULT_BINDING);
  assert.equal(pitched.pitch, 1);
  assert.equal(rolled.roll, 1);
  assert.equal(yawed.yaw, -1);
  assert.equal(pitched.roll, 0);
});

test("a held key keeps commanding on the next step", () => {
  const keys = new Set(["ArrowUp", "KeyW"]);
  const first = readPilot(keys, 0.3, 0.05);
  const second = readPilot(keys, first.throttle, 0.05);
  assert.equal(first.pitch, 1);
  assert.equal(second.pitch, 1);
  assert.ok(second.throttle > first.throttle);
});
