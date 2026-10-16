import { useMemo } from "react";
import { formatFixed } from "../format";
import type { Sample } from "../types";

type TraceChartProps = {
  samples: Sample[];
  index: number;
  label: string;
  unit: string;
  value: (sample: Sample) => number;
  reference?: (sample: Sample) => number;
};

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 32, left: 52 };

export function TraceChart({ samples, index, label, unit, value, reference }: TraceChartProps) {
  const geometry = useMemo(() => buildGeometry(samples, value, reference), [samples, value, reference]);
  if (!geometry) {
    return (
      <figure className="chart-empty" aria-label={`${label} versus time`}>
        <p>No samples yet.</p>
      </figure>
    );
  }

  const cursor = samples[Math.min(Math.max(index, 0), samples.length - 1)];
  const cursorX = geometry.xScale(cursor.time_s);
  const cursorY = geometry.yScale(value(cursor));
  const referenceValue = reference ? reference(cursor) : null;
  const description =
    `${samples.length} samples of ${label.toLowerCase()} versus time. ` +
    `At the playhead, ${formatFixed(value(cursor), 4)} ${unit}.`;

  return (
    <figure className="chart" aria-label={`${label} versus time`}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img">
        <title>{`${label} versus time`}</title>
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
        {referenceValue !== null ? (
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={geometry.yScale(referenceValue)}
            y2={geometry.yScale(referenceValue)}
            className="target-line"
          />
        ) : null}
        <polyline points={geometry.points} className="trace" fill="none" stroke="#d5e4ea" strokeWidth={1.5} />
        <line x1={cursorX} x2={cursorX} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="playhead" />
        <circle cx={cursorX} cy={cursorY} r={3.5} className="playhead-point" />
        <text x={PAD.left} y={12} className="axis-title">
          {`${label.toLowerCase()} (${unit})`}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 10} className="axis-title time-title">
          time (s)
        </text>
      </svg>
    </figure>
  );
}

function buildGeometry(
  samples: Sample[],
  value: (sample: Sample) => number,
  reference?: (sample: Sample) => number,
) {
  if (samples.length === 0) {
    return null;
  }
  const times = samples.map((sample) => sample.time_s);
  const values = samples.map(value);
  const referenceValues = reference ? samples.map(reference) : [];
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const yMin = Math.min(...values, ...referenceValues);
  const yMax = Math.max(...values, ...referenceValues);
  const yPad = Math.max(0.2, (yMax - yMin) * 0.08);
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xScale = (time: number) => PAD.left + ((time - tMin) / (tMax - tMin || 1)) * plotW;
  const yScale = (reading: number) => PAD.top + ((yHi - reading) / (yHi - yLo || 1)) * plotH;
  const points = samples
    .map((sample) => `${xScale(sample.time_s).toFixed(2)},${yScale(value(sample)).toFixed(2)}`)
    .join(" ");
  return {
    points,
    xScale,
    yScale,
    xTicks: ticks(tMin, tMax, 6),
    yTicks: ticks(yLo, yHi, 5),
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
