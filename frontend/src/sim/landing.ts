import { resolveContacts, type Aabb } from "./collision.ts";
import { landingMotors, verticalDescentMotors, type LandingGoal } from "./control.ts";
import { length, sub, tiltFromVerticalRad } from "./math.ts";
import { stepRigidBody } from "./rigidBody.ts";
import { NOMINAL_VEHICLE, vehicleState, type VehicleParams, type VehicleState } from "./vehicle.ts";

export const LANDING_DT_S = 0.01;

export type LandingMetrics = {
  controller: "position" | "vertical";
  success: boolean;
  reason: string;
  durationS: number;
  positionErrorM: number;
  touchdownVerticalSpeedM_S: number;
  touchdownHorizontalSpeedM_S: number;
  collision: boolean;
  samples: VehicleState[];
};

const SUCCESS_HORIZONTAL_M = 1.6;
const SUCCESS_VERTICAL_SPEED_M_S = 0.9;
const SUCCESS_HORIZONTAL_SPEED_M_S = 1.2;
const SUCCESS_TILT_RAD = 0.28;

/**
 * Run one landing in sim time. Samples are the integrated state.
 * Success requires a pad contact inside the position, speed, and tilt limits.
 */
export function runLandingEpisode(options: {
  controller: "position" | "vertical";
  initial: VehicleState;
  goal: LandingGoal;
  boxes: Aabb[];
  params?: VehicleParams;
  durationS?: number;
}): LandingMetrics {
  const params = options.params ?? NOMINAL_VEHICLE;
  const durationS = options.durationS ?? 22;
  const steps = Math.round(durationS / LANDING_DT_S);
  let state = options.initial;
  const samples: VehicleState[] = [state];
  let failure: LandingMetrics | null = null;
  for (let index = 0; index < steps; index += 1) {
    const motors =
      options.controller === "position"
        ? landingMotors(state, options.goal, params)
        : verticalDescentMotors(state, options.goal, params);
    const stepped = stepRigidBody(state, motors, LANDING_DT_S, params);
    const resolved = resolveContacts(stepped.state, options.boxes, params.radiusM);
    state = resolved.state;
    if (index % 5 === 0) {
      samples.push(state);
    }
    if (resolved.contact && !resolved.contact.pad) {
      failure = metrics(options.controller, state, options.goal, false, `Contact with ${resolved.contact.id}`, true);
      break;
    }
    if (resolved.contact?.pad) {
      const ok = landedCleanly(state, options.goal);
      failure = metrics(
        options.controller,
        state,
        options.goal,
        ok,
        ok ? "Pad contact within the landing limits" : "Pad contact outside the landing limits",
        !ok,
      );
      break;
    }
  }
  if (!failure) {
    return { ...metrics(options.controller, state, options.goal, false, "Timed out before pad contact", false), samples };
  }
  return { ...failure, samples };
}

export function landingGoalFromPad(pad: { x: number; y: number; z: number }): LandingGoal {
  return { x: pad.x, y: pad.y, z: pad.z + NOMINAL_VEHICLE.radiusM };
}

export function episodeStart(pad: { x: number; y: number; z: number }): VehicleState {
  return vehicleState({
    positionM: { x: pad.x + 5, y: pad.y - 4, z: pad.z + 8 },
  });
}

function landedCleanly(state: VehicleState, goal: LandingGoal): boolean {
  const horizontal = Math.hypot(state.positionM.x - goal.x, state.positionM.y - goal.y);
  const vh = Math.hypot(state.velocityM_S.x, state.velocityM_S.y);
  return (
    horizontal <= SUCCESS_HORIZONTAL_M &&
    Math.abs(state.velocityM_S.z) <= SUCCESS_VERTICAL_SPEED_M_S &&
    vh <= SUCCESS_HORIZONTAL_SPEED_M_S &&
    tiltFromVerticalRad(state.quaternion) <= SUCCESS_TILT_RAD
  );
}

function metrics(
  controller: "position" | "vertical",
  state: VehicleState,
  goal: LandingGoal,
  success: boolean,
  reason: string,
  collision: boolean,
): LandingMetrics {
  return {
    controller,
    success,
    reason,
    durationS: state.timeS,
    positionErrorM: length(sub(state.positionM, { x: goal.x, y: goal.y, z: goal.z })),
    touchdownVerticalSpeedM_S: state.velocityM_S.z,
    touchdownHorizontalSpeedM_S: Math.hypot(state.velocityM_S.x, state.velocityM_S.y),
    collision,
    samples: [state],
  };
}
