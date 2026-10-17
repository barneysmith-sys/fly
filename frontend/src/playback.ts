import type { Sample } from "./types";

/** Latest sample whose time is at or before `time_s`. */
export function indexAtTime(samples: Sample[], time_s: number): number {
  if (samples.length === 0) {
    return 0;
  }
  if (time_s <= samples[0].time_s) {
    return 0;
  }
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (samples[mid].time_s <= time_s) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}
