import { useEffect, useState } from "react";
import { EXPLORER_4 } from "../sim/aircraft";
import { coastalSite, type Site } from "../sim/coastal";
import { manhattanDistrict, type District } from "../sim/district";
import type { VehicleParams } from "../sim/vehicle";

const STORAGE_KEY = "fly.boot.v1";

type Ready = {
  site: Site;
  district: District;
  vehicle: VehicleParams;
};

type BootSequenceProps = {
  onReady: (ready: Ready) => void;
};

const STEPS = [
  {
    label: "INITIALIZING SIMULATION",
    run: () => true,
  },
  {
    label: "LOADING COASTAL BASE",
    run: (ready: Partial<Ready>) => {
      ready.site = coastalSite();
      ready.district = manhattanDistrict();
      return Boolean(ready.site.boxes.length);
    },
  },
  {
    label: "CONFIGURING FLIGHT MODEL",
    run: (ready: Partial<Ready>) => {
      ready.vehicle = EXPLORER_4.params;
      return ready.vehicle.massKg > 0;
    },
  },
  {
    label: "ESTABLISHING TELEMETRY",
    run: (ready: Partial<Ready>) => Boolean(ready.site && ready.district && ready.vehicle),
  },
] as const;

export function BootSequence({ onReady }: BootSequenceProps) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState("");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = window.sessionStorage.getItem(STORAGE_KEY) === "1";
    const ready: Partial<Ready> = {};
    if (reduce || seen) {
      for (const step of STEPS) {
        step.run(ready);
      }
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      if (ready.site && ready.district && ready.vehicle) {
        onReady({ site: ready.site, district: ready.district, vehicle: ready.vehicle });
      }
      return;
    }
    let cancelled = false;
    const intervals: number[] = [];
    const timeouts: number[] = [];
    let stepIndex = 0;
    const runStep = () => {
      if (cancelled) {
        return;
      }
      const step = STEPS[stepIndex];
      step.run(ready);
      setIndex(stepIndex);
      let count = 0;
      const type = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(type);
          return;
        }
        count += 1;
        setShown(step.label.slice(0, count));
        if (count >= step.label.length) {
          window.clearInterval(type);
          const wait = window.setTimeout(() => {
            stepIndex += 1;
            if (stepIndex >= STEPS.length) {
              window.sessionStorage.setItem(STORAGE_KEY, "1");
              if (ready.site && ready.district && ready.vehicle) {
                onReady({ site: ready.site, district: ready.district, vehicle: ready.vehicle });
              }
              return;
            }
            runStep();
          }, 220);
          timeouts.push(wait);
        }
      }, 18);
      intervals.push(type);
    };
    runStep();
    return () => {
      cancelled = true;
      intervals.forEach((id) => window.clearInterval(id));
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [onReady]);

  const label = STEPS[index]?.label ?? "";
  return (
    <div className="boot" role="status">
      <p className="eyebrow">FLY / Flight systems</p>
      <p className="boot-line mono">{shown || label}</p>
      <div className="boot-progress" aria-hidden="true">
        {STEPS.map((step, stepIndex) => (
          <span key={step.label} className={stepIndex <= index ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}
