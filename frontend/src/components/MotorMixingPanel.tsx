import type { MotorInfo, Wrench } from "../animation/motorLayout.ts";
import { describeWrench, motorDeltas } from "../animation/motorLayout.ts";
import type { MotorQuad, MotorSource } from "../animation/types.ts";

/**
 * Top-down motor mixing view. Nose up. Viewed from above, so body +y (left)
 * is screen-left and CW on screen is CW from above.
 *
 * Feed it the lagged motorsN the integrator used and the wrench from
 * wrenchFromMotors(). `highlight` only chooses which explanation to stress;
 * it never changes a number.
 */

export type MixingHighlight = "collective" | "pitch" | "roll" | "yaw" | null;

export type MotorMixingPanelProps = {
  motorsN: MotorQuad;
  motorMaxN: number;
  layout: MotorInfo[];
  wrench: Wrench;
  source: MotorSource;
  failed?: readonly number[];
  highlight?: MixingHighlight;
  size?: number;
};

const C = { ground: "#0b1218", line: "#2b3946", ink: "#e8eff5", muted: "#8798a8", steel: "#75a9cb", amber: "#c7a46b", fail: "#c77474", pass: "#7fae91" };
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export function MotorMixingPanel({ motorsN, motorMaxN, layout, wrench, source, failed = [], highlight = null, size = 300 }: MotorMixingPanelProps) {
  const cx = size / 2;
  const cy = size / 2 + 6;
  const k = (size * 0.3) / 0.085;
  const deltas = motorDeltas(motorsN);
  const text = describeWrench(wrench);
  const toScreen = (m: MotorInfo) => ({ x: cx - m.bodyY * k, y: cy - m.bodyX * k });
  const ringR = size * 0.115;
  const stress = (m: MotorInfo): boolean => {
    if (highlight === "collective") return true;
    if (highlight === "yaw") return Math.abs(deltas[m.index]) > 0.02;
    if (highlight === "pitch" || highlight === "roll") return Math.abs(deltas[m.index]) > 0.02;
    return false;
  };
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8, fontFamily: MONO, color: C.ink }}>
      <svg width={size} height={size + 12} viewBox={`0 0 ${size} ${size + 12}`} role="img" aria-label={`Motor mixing. Total thrust ${wrench.thrustN.toFixed(2)} newtons. Roll ${text.roll}. Pitch ${text.pitch}. Yaw ${text.yaw}.`}>
        <rect width={size} height={size + 12} fill={C.ground} />
        <text x={cx} y={14} fill={C.muted} fontSize={10} textAnchor="middle">NOSE ▲</text>
        {layout.map((m) => {
          const p = toScreen(m);
          return <line key={`arm${m.index}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3c4650" strokeWidth={size * 0.035} />;
        })}
        <rect x={cx - size * 0.07} y={cy - size * 0.12} width={size * 0.14} height={size * 0.24} fill="#2a3138" stroke="#9aa6b0" />
        {layout.map((m) => {
          const p = toScreen(m);
          const cmd = Math.max(0, Math.min(1, motorsN[m.index] / motorMaxN));
          const isFailed = failed.includes(m.index);
          const color = isFailed ? C.fail : stress(m) ? (deltas[m.index] >= 0 ? C.amber : C.steel) : C.steel;
          const arc = 2 * Math.PI * ringR;
          const d = deltas[m.index];
          const spinPath = m.spin === "CW"
            ? `M ${p.x - ringR * 1.25} ${p.y - 4} A ${ringR * 1.25} ${ringR * 1.25} 0 0 1 ${p.x + ringR * 0.9} ${p.y - ringR * 0.9}`
            : `M ${p.x + ringR * 1.25} ${p.y - 4} A ${ringR * 1.25} ${ringR * 1.25} 0 0 0 ${p.x - ringR * 0.9} ${p.y - ringR * 0.9}`;
          return (
            <g key={m.index}>
              <circle cx={p.x} cy={p.y} r={ringR} fill="#111923" stroke={C.line} strokeWidth={5} />
              <circle cx={p.x} cy={p.y} r={ringR} fill="none" stroke={color} strokeWidth={5} strokeDasharray={`${arc * cmd} ${arc}`} transform={`rotate(-90 ${p.x} ${p.y})`} />
              <path d={spinPath} fill="none" stroke={C.muted} strokeWidth={1} markerEnd="url(#mixArrow)" />
              <text x={p.x} y={p.y - 2} fill={C.ink} fontSize={11} textAnchor="middle">M{m.index}</text>
              <text x={p.x} y={p.y + 11} fill={C.muted} fontSize={9} textAnchor="middle">{m.short} {m.spin}</text>
              <text x={p.x} y={p.y + ringR + 16} fill={isFailed ? C.fail : C.ink} fontSize={11} textAnchor="middle">{isFailed ? "FAILED" : `${motorsN[m.index].toFixed(2)} N`}</text>
              <text x={p.x} y={p.y + ringR + 28} fill={d > 0.005 ? C.amber : d < -0.005 ? C.steel : C.muted} fontSize={10} textAnchor="middle">{d >= 0 ? "+" : "−"}{Math.abs(d).toFixed(2)}</text>
            </g>
          );
        })}
        <defs>
          <marker id="mixArrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill={C.muted} /></marker>
        </defs>
      </svg>
      <figcaption style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 11 }}>
        <span style={{ color: C.muted }}>SOURCE</span><span style={{ color: source === "sim" ? C.pass : C.amber }}>{source === "sim" ? "SIM · lagged motor thrust" : "ILLUSTRATIVE · not from the integrator"}</span>
        <span style={{ color: highlight === "collective" ? C.amber : C.muted }}>ΣT</span><span>{wrench.thrustN.toFixed(2)} N</span>
        <span style={{ color: highlight === "roll" ? C.amber : C.muted }}>τx</span><span>{wrench.tauX.toFixed(4)} N·m · {text.roll}</span>
        <span style={{ color: highlight === "pitch" ? C.amber : C.muted }}>τy</span><span>{wrench.tauY.toFixed(4)} N·m · {text.pitch}</span>
        <span style={{ color: highlight === "yaw" ? C.amber : C.muted }}>τz</span><span>{wrench.tauZ.toFixed(4)} N·m · {text.yaw}</span>
      </figcaption>
    </figure>
  );
}
