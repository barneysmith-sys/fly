import assert from "node:assert/strict";
import test from "node:test";
import { CHASE_FRAME } from "../components/chaseFrame.ts";
import { attitudeMotors, NOMINAL_GAINS } from "./control.ts";
import { lagMotors } from "./motorLag.ts";
import { cross, norm, rotateBodyToWorld, sub, type Vec3 } from "./math.ts";
import { stepRigidBody } from "./rigidBody.ts";
import { equalMotors, hoverThrustN, NOMINAL_VEHICLE, vehicleState } from "./vehicle.ts";

function chaseBasis(position: Vec3, quaternion: { w: number; x: number; y: number; z: number }) {
  const forward = rotateBodyToWorld(quaternion, { x: 1, y: 0, z: 0 });
  const bodyY = rotateBodyToWorld(quaternion, { x: 0, y: 1, z: 0 });
  const camera = {
    x: position.x - forward.x * CHASE_FRAME.backM + bodyY.x * CHASE_FRAME.rightM,
    y: position.y - forward.y * CHASE_FRAME.backM + bodyY.y * CHASE_FRAME.rightM,
    z: position.z + CHASE_FRAME.upM,
  };
  const look = {
    x: position.x + forward.x * CHASE_FRAME.lookAheadM,
    y: position.y + forward.y * CHASE_FRAME.lookAheadM,
    z: position.z + CHASE_FRAME.lookUpM,
  };
  const lookDir = norm(sub(look, camera));
  const right = norm(cross(lookDir, { x: 0, y: 0, z: 1 }));
  return { camera, right };
}

function screenRight(camera: Vec3, right: Vec3, point: Vec3) {
  const offset = sub(point, camera);
  return offset.x * right.x + offset.y * right.y + offset.z * right.z;
}

test("arrow-right roll moves the aircraft toward screen-right", () => {
  const start = vehicleState({ positionM: { x: 0, y: 0, z: 8 } });
  const { camera, right } = chaseBasis(start.positionM, start.quaternion);
  const before = screenRight(camera, right, start.positionM);
  const throttle = hoverThrustN(NOMINAL_VEHICLE) / NOMINAL_VEHICLE.thrustMaxN;
  let state = start;
  let motors = equalMotors(hoverThrustN(NOMINAL_VEHICLE));
  for (let step = 0; step < 100; step += 1) {
    const command = attitudeMotors(
      state,
      { throttle, roll: 1, pitch: 0, yaw: 0 },
      "stabilized",
      NOMINAL_VEHICLE,
      NOMINAL_GAINS,
    );
    motors = lagMotors(motors, command, 0.005, 0.06);
    state = stepRigidBody(state, motors, 0.005, NOMINAL_VEHICLE).state;
  }
  const after = screenRight(camera, right, state.positionM);
  assert.ok(after > before + 0.02, `screen-right shifted ${(after - before).toFixed(3)} m`);
});
