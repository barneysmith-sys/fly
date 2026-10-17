// Run inside the repo after copying to frontend/src/animation/:
//   node --experimental-strip-types --test src/animation/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { motorTorque, stepRigidBody } from "../sim/rigidBody.ts";
import { attitudeMotors } from "../sim/control.ts";
import { lagMotors } from "../sim/motorLag.ts";
import { rotateBodyToWorld } from "../sim/math.ts";
import { NOMINAL_VEHICLE as P, equalMotors, hoverThrustN, vehicleState } from "../sim/vehicle.ts";
import { describeWrench, motorLayout, wrenchFromMotors } from "./motorLayout.ts";

test("wrenchFromMotors matches sim motorTorque exactly", () => {
  for (const m of [[1, 2, 3, 4], [5.1, 0, 5.1, 0], [1.6, 1.6, 1.6, 1.6]] as const) {
    const a = motorTorque([...m] as [number, number, number, number], P);
    const b = wrenchFromMotors(m, P);
    assert.ok(Math.abs(a.x - b.tauX) < 1e-12 && Math.abs(a.y - b.tauY) < 1e-12 && Math.abs(a.z - b.tauZ) < 1e-12);
  }
});

test("layout positions reproduce motorTorque signs", () => {
  for (const m of motorLayout(P)) {
    const u = [0, 0, 0, 0] as [number, number, number, number];
    u[m.index] = 1;
    const t = motorTorque(u, P);
    // tau = r x F with F = (0,0,1): tau.x = y, tau.y = -x
    assert.ok(Math.abs(t.x - m.bodyY) < 1e-12);
    assert.ok(Math.abs(t.y + m.bodyX) < 1e-12);
    // CW-from-above rotors (spinSign -1) put +z reaction torque on the body
    assert.equal(Math.sign(t.z), -m.spinSign);
  }
});

test("body +y is left of the nose in the world frame", () => {
  const s = vehicleState(); // identity: nose east (+x)
  const left = rotateBodyToWorld(s.quaternion, { x: 0, y: 1, z: 0 });
  // Facing east, north (+y) is on the pilot's left.
  assert.equal(left.y, 1);
});

test("describeWrench words match a real stabilized roll response", () => {
  let s = vehicleState({ positionM: { x: 0, y: 0, z: 10 } });
  const cmd = attitudeMotors(s, { throttle: hoverThrustN(P) / P.thrustMaxN, roll: 1, pitch: 0, yaw: 0 }, "stabilized", P);
  const words = describeWrench(wrenchFromMotors(cmd, P)).roll;
  let m = equalMotors(hoverThrustN(P));
  for (let i = 0; i < 60; i += 1) {
    m = lagMotors(m, attitudeMotors(s, { throttle: hoverThrustN(P) / P.thrustMaxN, roll: 1, pitch: 0, yaw: 0 }, "stabilized", P), 0.005, 0.06);
    s = stepRigidBody(s, m, 0.005, P).state;
  }
  const leftZ = rotateBodyToWorld(s.quaternion, { x: 0, y: 1, z: 0 }).z;
  // If the left side went down, the words must say "rolls left".
  assert.equal(leftZ < 0, words.startsWith("rolls left"));
});
