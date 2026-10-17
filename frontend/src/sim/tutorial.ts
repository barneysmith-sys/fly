export type TutorialSnapshot = {
  altitudeM: number;
  verticalSpeedM_S: number;
  horizontalSpeedM_S: number;
  distanceFromLaunchM: number;
  yawDeltaDeg: number;
  distanceToPadM: number;
  onPad: boolean;
  hoverHeldS: number;
};

export const ACADEMY_STAGES = [
  {
    title: "Take off",
    instruction: "Hold W. Throttle is collective thrust, not a height setting. Release toward hover once you are off the pad.",
  },
  {
    title: "Hover",
    instruction: "Ease W and S until vertical speed is near zero. Keep the arrow keys centered so stabilized mode levels the aircraft.",
  },
  {
    title: "Yaw",
    instruction: "Hold A or D to rotate the nose. The other sticks can stay centered.",
  },
  {
    title: "Move",
    instruction: "Up arrow pitches the nose down and tips thrust forward. Down arrow pitches the nose up.",
  },
  {
    title: "Find the pad",
    instruction: "Fly toward the marked precision pad on the apron. The range in the brief is horizontal distance.",
  },
  {
    title: "Land",
    instruction: "Over the pad, lower the throttle with S until vertical speed is small and the gear meets the surface.",
  },
] as const;

export function academyStageCount(): number {
  return ACADEMY_STAGES.length;
}

export function stageComplete(stage: number, snap: TutorialSnapshot): boolean {
  if (stage <= 0) {
    return snap.altitudeM > 1.2;
  }
  if (stage === 1) {
    return snap.hoverHeldS >= 2;
  }
  if (stage === 2) {
    return Math.abs(snap.yawDeltaDeg) >= 30;
  }
  if (stage === 3) {
    return snap.distanceFromLaunchM >= 6;
  }
  if (stage === 4) {
    return snap.distanceToPadM < 8 && snap.altitudeM > 0.6;
  }
  return snap.onPad && snap.horizontalSpeedM_S <= 1.2 && Math.abs(snap.verticalSpeedM_S) <= 0.9 && snap.altitudeM < 1.2;
}

export function hoverIsStable(snap: Pick<TutorialSnapshot, "altitudeM" | "verticalSpeedM_S" | "horizontalSpeedM_S">): boolean {
  return snap.altitudeM > 1 && snap.altitudeM < 8 && Math.abs(snap.verticalSpeedM_S) < 0.35 && snap.horizontalSpeedM_S < 0.55;
}
