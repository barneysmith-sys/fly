import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildingBox, pointInRing, resolveContacts, resolvePrisms } from "./collision.ts";
import { attitudeMotors, hoverInput } from "./control.ts";
import { episodeStart, landingGoalFromPad, runLandingEpisode } from "./landing.ts";
import { GRAVITY_M_S2, quatFromAxisAngle, rhAngles } from "./math.ts";
import {
  EQUATION_POSITION,
  EQUATION_QUATERNION,
  EQUATION_ROTATION,
  EQUATION_TRANSLATION,
  motorTorque,
  mixMotors,
  stepRigidBody,
  worldAccelerationOf,
} from "./rigidBody.ts";
import { equalMotors, hoverThrustN, NOMINAL_VEHICLE, vehicleState, type VehicleParams } from "./vehicle.ts";

const DT = 0.002;

function noDrag(): VehicleParams {
  return { ...NOMINAL_VEHICLE, dragCoefficientKgPerM: 0 };
}

test("free fall matches the constant-acceleration solution", () => {
  let state = vehicleState({ positionM: { x: 1, y: -2, z: 25 } });
  const params = noDrag();
  const steps = Math.round(1 / DT);
  for (let i = 0; i < steps; i += 1) {
    state = stepRigidBody(state, [0, 0, 0, 0], DT, params).state;
  }
  const t = steps * DT;
  assert.ok(Math.abs(state.positionM.z - (25 - 0.5 * GRAVITY_M_S2 * t * t)) < 1e-9);
  assert.ok(Math.abs(state.velocityM_S.z - -GRAVITY_M_S2 * t) < 1e-9);
  assert.equal(state.positionM.x, 1);
  assert.equal(state.positionM.y, -2);
  assert.ok(Math.abs(state.quaternion.w - 1) < 1e-12);
});

test("hover thrust holds a level vehicle", () => {
  const params = noDrag();
  const thrust = hoverThrustN(params);
  let state = vehicleState({ positionM: { x: 0, y: 0, z: 4 } });
  for (let i = 0; i < 500; i += 1) {
    state = stepRigidBody(state, equalMotors(thrust), DT, params).state;
  }
  assert.ok(Math.abs(state.positionM.z - 4) < 1e-8);
  assert.ok(Math.abs(state.velocityM_S.z) < 1e-8);
  assert.ok(Math.abs(state.positionM.x) < 1e-8);
});

test("nose-down pitch tips thrust forward and reduces vertical support", () => {
  const params = noDrag();
  const pitched = vehicleState({
    quaternion: quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.2),
  });
  const accel = worldAccelerationOf(pitched, hoverThrustN(params), params);
  const expectedX = GRAVITY_M_S2 * Math.sin(0.2);
  const expectedZ = GRAVITY_M_S2 * (Math.cos(0.2) - 1);
  assert.ok(Math.abs(accel.x - expectedX) < 1e-9);
  assert.ok(accel.x > 0);
  assert.ok(Math.abs(accel.z - expectedZ) < 1e-9);
  assert.ok(accel.z < 0);
});

test("mixer recovers an unsaturated torque", () => {
  const torque = { x: 0.04, y: -0.03, z: 0.01 };
  const total = hoverThrustN(NOMINAL_VEHICLE);
  const motors = mixMotors(total, torque, NOMINAL_VEHICLE);
  const back = motorTorque(motors, NOMINAL_VEHICLE);
  assert.ok(Math.abs(back.x - torque.x) < 1e-9);
  assert.ok(Math.abs(back.y - torque.y) < 1e-9);
  assert.ok(Math.abs(back.z - torque.z) < 1e-9);
  assert.ok(motors.every((motor) => motor >= 0 && motor <= NOMINAL_VEHICLE.thrustMaxN / 4));
});

test("ground contact stops a drop", () => {
  let state = vehicleState({ positionM: { x: 0, y: 0, z: 1 } });
  for (let i = 0; i < 2000; i += 1) {
    const stepped = stepRigidBody(state, [0, 0, 0, 0], DT, noDrag());
    state = resolveContacts(stepped.state, [], NOMINAL_VEHICLE.radiusM).state;
  }
  assert.ok(Math.abs(state.positionM.z - NOMINAL_VEHICLE.radiusM) < 1e-9);
  assert.equal(state.velocityM_S.z, 0);
});

test("stabilized mode levels a tilted hover", () => {
  const params = NOMINAL_VEHICLE;
  let state = vehicleState({
    positionM: { x: 0, y: 0, z: 6 },
    quaternion: quatFromAxisAngle({ x: 1, y: 0, z: 0 }, 0.35),
  });
  const input = hoverInput(params);
  for (let i = 0; i < 2000; i += 1) {
    const motors = attitudeMotors(state, input, "stabilized", params);
    state = stepRigidBody(state, motors, DT, params).state;
  }
  const angles = rhAngles(state.quaternion);
  assert.ok(Math.abs(angles.rollRh) < 0.05, `roll ${angles.rollRh}`);
  assert.ok(Math.abs(angles.pitchRh) < 0.05, `pitch ${angles.pitchRh}`);
  assert.ok(state.positionM.z > 2);
});

test("position landing reaches the pad and vertical descent misses", () => {
  const pad = { x: 78, y: 36, z: 28 };
  const goal = landingGoalFromPad(pad);
  const box = buildingBox("landing-roof", pad.x, pad.y, 26, 22, pad.z, true);
  const initial = episodeStart(pad);
  const guided = runLandingEpisode({
    controller: "position",
    initial,
    goal,
    boxes: [box],
    params: noDrag(),
  });
  const vertical = runLandingEpisode({
    controller: "vertical",
    initial,
    goal,
    boxes: [box],
    params: noDrag(),
  });
  assert.equal(guided.success, true, guided.reason);
  assert.ok(guided.positionErrorM < 2);
  assert.equal(vertical.success, false);
  assert.ok(guided.samples.length > 5);
  const withDrag = runLandingEpisode({
    controller: "position",
    initial,
    goal,
    boxes: [box],
    params: NOMINAL_VEHICLE,
  });
  assert.equal(withDrag.success, true, withDrag.reason);
});

test("a rotated footprint blocks its interior and leaves the axis-aligned corner open", () => {
  const diamond = [
    { x: 0, y: 6 },
    { x: 6, y: 0 },
    { x: 0, y: -6 },
    { x: -6, y: 0 },
  ];
  assert.equal(pointInRing(0, 0, diamond), true);
  assert.equal(pointInRing(5.5, 5.5, diamond), false);
  const prism = { id: "diamond", ring: diamond, heightM: 20, pad: true };
  const inside = vehicleState({ positionM: { x: 0, y: 0, z: 10 } });
  const pushed = resolvePrisms(inside, [prism], 0.5);
  assert.ok(Math.hypot(pushed.state.positionM.x, pushed.state.positionM.y) > 1);
  const corner = vehicleState({ positionM: { x: 5.5, y: 5.5, z: 10 } });
  const open = resolvePrisms(corner, [prism], 0.5);
  assert.equal(open.contact, null);
  const roof = vehicleState({ positionM: { x: 0, y: 0, z: 20.2 } });
  const landed = resolvePrisms(roof, [prism], 0.5);
  assert.equal(landed.contact?.pad, true);
  assert.ok(landed.state.positionM.z >= 20.2);
});

test("the Flatiron extract keeps the launch in the street and the pad reachable", () => {
  const data = JSON.parse(readFileSync(new URL("./flatiron.json", import.meta.url), "utf8")) as {
    launch: { x: number; y: number; z: number };
    approach: { x: number; y: number; z: number };
    buildings: { id: string; name: string | null; height: number; pad: boolean; ring: number[][] }[];
  };
  const prisms = data.buildings.map((building) => ({
    id: building.id,
    ring: building.ring.map(([x, y]) => ({ x, y })),
    heightM: building.height,
    pad: building.pad,
  }));
  assert.equal(
    prisms.some((prism) => pointInRing(data.launch.x, data.launch.y, prism.ring)),
    false,
  );
  assert.equal(
    prisms.some((prism) => pointInRing(data.approach.x, data.approach.y, prism.ring)),
    false,
  );
  assert.ok(data.buildings.some((building) => building.name === "Flatiron Building"));
  const pad = data.buildings.find((building) => building.pad);
  assert.ok(pad);
  const ring = pad.ring.map(([x, y]) => ({ x, y }));
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const cross = start.x * end.y - end.x * start.y;
    area += cross;
    cx += (start.x + end.x) * cross;
    cy += (start.y + end.y) * cross;
  }
  const guided = runLandingEpisode({
    controller: "position",
    initial: vehicleState({ positionM: data.approach }),
    goal: landingGoalFromPad({ x: cx / (3 * area), y: cy / (3 * area), z: pad.height }),
    boxes: [],
    prisms,
  });
  assert.equal(guided.success, true, guided.reason);
});

test("the rigid-body note contains the equation strings", () => {
  const manual = readFileSync(new URL("../../../docs/RIGID_BODY.md", import.meta.url), "utf8");
  for (const equation of [EQUATION_TRANSLATION, EQUATION_ROTATION, EQUATION_QUATERNION, EQUATION_POSITION]) {
    assert.ok(manual.includes(equation), equation);
  }
});
