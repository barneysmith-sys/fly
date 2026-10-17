const KEY = "fly.progress.v1";

export type ProgressState = {
  version: 1;
  lessonAttempts: number;
  lessonPassed: boolean;
  experimentsRun: string[];
};

const EMPTY: ProgressState = {
  version: 1,
  lessonAttempts: 0,
  lessonPassed: false,
  experimentsRun: [],
};

export function loadProgress(): ProgressState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return EMPTY;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return EMPTY;
    }
    const record = parsed as Partial<ProgressState>;
    return {
      version: 1,
      lessonAttempts: typeof record.lessonAttempts === "number" ? record.lessonAttempts : 0,
      lessonPassed: record.lessonPassed === true,
      experimentsRun: Array.isArray(record.experimentsRun)
        ? record.experimentsRun.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return EMPTY;
  }
}

export function recordLesson(passed: boolean): ProgressState {
  const current = loadProgress();
  const next: ProgressState = {
    ...current,
    lessonAttempts: current.lessonAttempts + 1,
    lessonPassed: passed,
  };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function recordExperiment(experimentId: string): ProgressState {
  const current = loadProgress();
  const experimentsRun = current.experimentsRun.includes(experimentId)
    ? current.experimentsRun
    : [...current.experimentsRun, experimentId];
  const next: ProgressState = { ...current, experimentsRun };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export const RANKS = [
  {
    id: "beginner",
    title: "Beginner",
    requirement: "Open the training center. This rank is the starting point.",
  },
  {
    id: "fundamentals",
    title: "Flight Fundamentals",
    requirement:
      "On the latest hover lesson, the motion prediction and the weight both match the returned simulation.",
  },
  {
    id: "fpv",
    title: "FPV Pilot",
    requirement: "Coming in a future milestone. Manual attitude flying is not scored, because the model has no attitude.",
  },
  {
    id: "control",
    title: "Flight-Control Student",
    requirement: "Coming in a future milestone. Reading the PID lesson is not yet an assessment.",
  },
  {
    id: "robotics",
    title: "Robotics Student",
    requirement: "Coming in a future milestone. State estimation is not implemented.",
  },
  {
    id: "autonomy",
    title: "Autonomous Systems Developer",
    requirement: "Coming in a future milestone. No autonomous mission can be demonstrated yet.",
  },
] as const;
