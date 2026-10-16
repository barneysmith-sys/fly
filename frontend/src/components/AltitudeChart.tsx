import { useMemo } from "react";
import { formatFixed } from "../format";
import type { Sample } from "../types";

type AltitudeChartProps = {
  samples: Sample[];
  index: number;
};

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 32, left: 48 };

export function AltitudeChart({ samples, index }: AltitudeChartProps) {
  const geometry = useMemo(() => buildGeometry(samples), [samples]);
  if (!geometry) {
    return (
      <figure className="chart-empty" aria-label="Altitude versus time">
        <p>No samples yet.</p>
      </figure>
    );
  }

  const cursor = samples[Math.min(Math.max(index, 0), samples.length - 1)];
  const cursorX = geometry.xScale(cursor.time_s);
  const cursorY = geometry.yScale(cursor.altitude_m);
  const description =
    `${samples.length} samples of altitude versus time. ` +
    `Final altitude ${formatFixed(samples[samples.length - 1].altitude_m, 4)} m. ` +
    `Target ${formatFixed(cursor.target_altitude_m, 4)} m.`;

  return (
    <figure className="chart" aria-label="Altitude versus time">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img">
        <title>Altitude versus time</title>
        <desc>{description}</desc>
        {geometry.yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={geometry.yScale(tick)}
              y2={geometry.yScale(tick)}
              className="grid"
            />
            <text x={PAD.left - 8} y={geometry.yScale(tick) + 3} className="tick y-tick">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {geometry.xTicks.map((tick) => (
          <text key={`x-${tick}`} x={geometry.xScale(tick)} y={HEIGHT - 10} className="tick x-tick">
            {formatTick(tick)}
          </text>
        ))}
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={geometry.yScale(cursor.target_altitude_m)}
          y2={geometry.yScale(cursor.target_altitude_m)}
          className="target-line"
        />
        <polyline points={geometry.points} className="trace" fill="none" stroke="#e4ebf1" strokeWidth={1.5} />
        <line x1={cursorX} x2={cursorX} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="playhead" />
        <circle cx={cursorX} cy={cursorY} r={3.5} className="playhead-point" />
        <text x={PAD.left} y={12} className="axis-title">
          altitude (m)
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 10} className="axis-title time-title">
          time (s)
        </text>
      </svg>
    </figure>
  );
}

function buildGeometry(samples: Sample[]) {
  if (samples.length === 0) {
    return null;
  }
  const times = samples.map((sample) => sample.time_s);
  const altitudes = samples.map((sample) => sample.altitude_m);
  const target = samples[0].target_altitude_m;
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const zMin = Math.min(0, target, ...altitudes);
  const zMax = Math.max(target, ...altitudes);
  const zPad = Math.max(0.2, (zMax - zMin) * 0.08);
  const zLo = zMin - zPad * 0.2;
  const zHi = zMax + zPad;
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xScale = (time: number) => PAD.left + ((time - tMin) / (tMax - tMin || 1)) * plotW;
  const yScale = (altitude: number) => PAD.top + ((zHi - altitude) / (zHi - zLo || 1)) * plotH;
  const points = samples
    .map((sample) => `${xScale(sample.time_s).toFixed(2)},${yScale(sample.altitude_m).toFixed(2)}`)
    .join(" ");
  return {
    points,
    xScale,
    yScale,
    xTicks: ticks(tMin, tMax, 6),
    yTicks: ticks(zLo, zHi, 5),
  };
}

function ticks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const step = niceStep(span / count);
  const start = Math.ceil(min / step) * step;
  const values: number[] = [];
  for (let value = start; value <= max + step * 1e-6; value += step) {
    values.push(Number(value.toFixed(6)));
    if (values.length > 12) {
      break;
    }
  }
  return values;
}

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}
