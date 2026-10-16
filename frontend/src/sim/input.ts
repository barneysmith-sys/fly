import { clamp } from "./math.ts";
import type { PilotInput } from "./control.ts";

/** Keyboard and gamepad both fill a PilotInput. A missing pad leaves the sticks to the keyboard. */

const THROTTLE_RATE_PER_S = 0.45;

export function stickFromKeys(keys: ReadonlySet<string>): Pick<PilotInput, "roll" | "pitch" | "yaw"> {
  return {
    roll: axis(keys, "KeyA", "KeyD"),
    pitch: axis(keys, "KeyS", "KeyW"),
    yaw: axis(keys, "KeyQ", "KeyE"),
  };
}

export function integrateThrottle(throttle: number, keys: ReadonlySet<string>, dt: number): number {
  let next = throttle;
  if (keys.has("ShiftLeft") || keys.has("ShiftRight")) {
    next += dt * THROTTLE_RATE_PER_S;
  }
  if (keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyZ")) {
    next -= dt * THROTTLE_RATE_PER_S;
  }
  return clamp(next, 0, 1);
}

export function readPilot(keys: ReadonlySet<string>, throttle: number, dt: number): PilotInput {
  const pad = connectedPad();
  const sticks = pad ? stickFromGamepad(pad) : stickFromKeys(keys);
  let nextThrottle = integrateThrottle(throttle, keys, dt);
  if (pad) {
    const up = pad.buttons[7]?.value ?? 0;
    const down = pad.buttons[6]?.value ?? 0;
    nextThrottle = clamp(nextThrottle + (up - down) * dt * THROTTLE_RATE_PER_S, 0, 1);
  }
  return { throttle: nextThrottle, ...sticks };
}

function stickFromGamepad(pad: Gamepad): Pick<PilotInput, "roll" | "pitch" | "yaw"> {
  return {
    roll: deadband(pad.axes[0] ?? 0),
    pitch: deadband(-(pad.axes[1] ?? 0)),
    yaw: deadband(pad.axes[2] ?? 0),
  };
}

function connectedPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) {
    return null;
  }
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad && pad.connected) {
      return pad;
    }
  }
  return null;
}

function axis(keys: ReadonlySet<string>, negative: string, positive: string): number {
  return (keys.has(positive) ? 1 : 0) - (keys.has(negative) ? 1 : 0);
}

function deadband(value: number): number {
  return Math.abs(value) < 0.12 ? 0 : value;
}
