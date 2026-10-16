import { clamp } from "./math.ts";
import type { PilotInput } from "./control.ts";

/** Keyboard, gamepad, and touch all fill one PilotInput. Throttle is collective, not altitude. */

export const THROTTLE_RATE_PER_S = 0.85;

export type Binding = {
  throttleUp: string;
  throttleDown: string;
  yawLeft: string;
  yawRight: string;
  pitchForward: string;
  pitchBack: string;
  rollLeft: string;
  rollRight: string;
};

export const DEFAULT_BINDING: Binding = {
  throttleUp: "KeyW",
  throttleDown: "KeyS",
  yawLeft: "KeyA",
  yawRight: "KeyD",
  pitchForward: "ArrowUp",
  pitchBack: "ArrowDown",
  rollLeft: "ArrowLeft",
  rollRight: "ArrowRight",
};

export const BINDING_STORAGE_KEY = "fly.bindings.v1";
export const DEADZONE_STORAGE_KEY = "fly.deadzone.v1";
export const DEFAULT_DEADZONE = 0.12;

export type StickAxes = { roll: number; pitch: number; yaw: number };

export type TouchCommand = StickAxes & {
  throttleUp: boolean;
  throttleDown: boolean;
};

export const ZERO_TOUCH: TouchCommand = {
  roll: 0,
  pitch: 0,
  yaw: 0,
  throttleUp: false,
  throttleDown: false,
};

export type ReadOptions = {
  binding?: Binding;
  deadzone?: number;
  touch?: TouchCommand;
};

export function stickFromKeys(keys: ReadonlySet<string>, binding: Binding = DEFAULT_BINDING): StickAxes {
  return {
    roll: axis(keys, binding.rollLeft, binding.rollRight),
    pitch: axis(keys, binding.pitchBack, binding.pitchForward),
    yaw: axis(keys, binding.yawLeft, binding.yawRight),
  };
}

export function integrateThrottle(
  throttle: number,
  keys: ReadonlySet<string>,
  dt: number,
  binding: Binding = DEFAULT_BINDING,
  touch: TouchCommand = ZERO_TOUCH,
): number {
  let next = throttle;
  if (held(keys, binding.throttleUp) || touch.throttleUp) {
    next += dt * THROTTLE_RATE_PER_S;
  }
  if (held(keys, binding.throttleDown) || touch.throttleDown) {
    next -= dt * THROTTLE_RATE_PER_S;
  }
  return clamp(next, 0, 1);
}

export function readPilot(
  keys: ReadonlySet<string>,
  throttle: number,
  dt: number,
  options: ReadOptions = {},
): PilotInput {
  const binding = options.binding ?? DEFAULT_BINDING;
  const deadzone = options.deadzone ?? DEFAULT_DEADZONE;
  const touch = options.touch ?? ZERO_TOUCH;
  const pad = connectedPad();
  const fromKeys = stickFromKeys(keys, binding);
  const fromPad = pad ? stickFromGamepad(pad, deadzone) : { roll: 0, pitch: 0, yaw: 0 };
  let nextThrottle = integrateThrottle(throttle, keys, dt, binding, touch);
  if (pad) {
    const up = pad.buttons[7]?.value ?? 0;
    const down = pad.buttons[6]?.value ?? 0;
    nextThrottle = clamp(nextThrottle + (up - down) * dt * THROTTLE_RATE_PER_S, 0, 1);
  }
  return {
    throttle: nextThrottle,
    roll: dominant(fromKeys.roll, dominant(fromPad.roll, touch.roll)),
    pitch: dominant(fromKeys.pitch, dominant(fromPad.pitch, touch.pitch)),
    yaw: dominant(fromKeys.yaw, dominant(fromPad.yaw, touch.yaw)),
  };
}

export function gamepadSummary(deadzone = DEFAULT_DEADZONE): { id: string; axes: StickAxes } | null {
  const pad = connectedPad();
  if (!pad) {
    return null;
  }
  return { id: pad.id || "Gamepad", axes: stickFromGamepad(pad, deadzone) };
}

export function formatCode(code: string): string {
  if (!code) {
    return "—";
  }
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function loadBinding(): Binding {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_BINDING };
  }
  try {
    const raw = localStorage.getItem(BINDING_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_BINDING };
    }
    const parsed = JSON.parse(raw) as Partial<Binding>;
    const next = { ...DEFAULT_BINDING };
    for (const key of Object.keys(DEFAULT_BINDING) as (keyof Binding)[]) {
      const value = parsed[key];
      if (typeof value === "string") {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return { ...DEFAULT_BINDING };
  }
}

export function saveBinding(binding: Binding): void {
  localStorage.setItem(BINDING_STORAGE_KEY, JSON.stringify(binding));
}

export function loadDeadzone(): number {
  if (typeof localStorage === "undefined") {
    return DEFAULT_DEADZONE;
  }
  const raw = Number(localStorage.getItem(DEADZONE_STORAGE_KEY));
  if (!Number.isFinite(raw)) {
    return DEFAULT_DEADZONE;
  }
  return clamp(raw, 0, 0.4);
}

export function saveDeadzone(value: number): void {
  localStorage.setItem(DEADZONE_STORAGE_KEY, String(clamp(value, 0, 0.4)));
}

function stickFromGamepad(pad: Gamepad, deadzone: number): StickAxes {
  return {
    roll: deadband(pad.axes[0] ?? 0, deadzone),
    pitch: deadband(-(pad.axes[1] ?? 0), deadzone),
    yaw: deadband(pad.axes[2] ?? 0, deadzone),
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

function held(keys: ReadonlySet<string>, code: string): boolean {
  return code.length > 0 && keys.has(code);
}

function axis(keys: ReadonlySet<string>, negative: string, positive: string): number {
  return (held(keys, positive) ? 1 : 0) - (held(keys, negative) ? 1 : 0);
}

function dominant(a: number, b: number): number {
  return Math.abs(a) >= Math.abs(b) ? a : b;
}

function deadband(value: number, deadzone: number): number {
  const limit = clamp(deadzone, 0, 0.45);
  if (Math.abs(value) <= limit) {
    return 0;
  }
  const span = 1 - limit;
  return clamp((Math.abs(value) - limit) / span, 0, 1) * Math.sign(value);
}
