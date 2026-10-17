import type { QuatLike, Vec3Like } from "../animation/types.ts";

/**
 * Ground-control instruments. Every prop is a sim value; when a value is
 * unavailable pass null and the instrument shows "n/a" instead of moving.
 * Motion comes from re-rendering with new state (10 Hz HUD rate is enough);
 * CSS transitions of 100 ms smooth the steps without inventing data.
 */

const C = { ground: "#0b1218", line: "#2b3946", ink: "#e8eff5", muted: "#8798a8", steel: "#75a9cb", amber: "#c7a46b", fail: "#c77474", sky: "#24364a", earth: "#2b241c" };
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SMOOTH = "transform 100ms linear";

/** Roll, pitch (deg) and heading (deg clockwise from north) from the body quaternion. Physical left/right. */
export function attitudeFromQuat(q: QuatLike) {
  const rot = (v: Vec3Like) => {
    const { w, x, y, z } = q;
    const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
    return { x: ix * w - iw * x - iy * z + iz * y, y: iy * w - iw * y - iz * x + ix * z, z: iz * w - iw * z - ix * y + iy * x };
  };
  const fwd = rot({ x: 1, y: 0, z: 0 });
  const left = rot({ x: 0, y: 1, z: 0 });
  const up = rot({ x: 0, y: 0, z: 1 });
  const pitchNoseUpDeg = (Math.atan2(fwd.z, Math.hypot(fwd.x, fwd.y)) * 180) / Math.PI;
  // Right wing down positive: the left side rising means left.z > 0.
  const rollRightDownDeg = (Math.atan2(left.z, up.z) * 180) / Math.PI;
  const headingDeg = ((90 - (Math.atan2(fwd.y, fwd.x) * 180) / Math.PI) % 360 + 360) % 360;
  return { pitchNoseUpDeg, rollRightDownDeg, headingDeg };
}

export function AttitudeIndicator({ quaternion, size = 180 }: { quaternion: QuatLike | null; size?: number }) {
  if (!quaternion) return <NotAvailable label="Attitude" size={size} />;
  const a = attitudeFromQuat(quaternion);
  const pxPerDeg = size / 70;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Attitude: pitch ${a.pitchNoseUpDeg.toFixed(1)} degrees, roll ${a.rollRightDownDeg.toFixed(1)} degrees`} style={{ fontFamily: MONO }}>
      <defs><clipPath id="ai-clip"><circle cx={size / 2} cy={size / 2} r={size / 2 - 2} /></clipPath></defs>
      <g clipPath="url(#ai-clip)">
        <g style={{ transition: SMOOTH, transformOrigin: "50% 50%", transform: `rotate(${-a.rollRightDownDeg}deg) translateY(${a.pitchNoseUpDeg * pxPerDeg}px)` }}>
          <rect x={-size} y={-size * 2 + size / 2} width={size * 3} height={size * 2} fill={C.sky} />
          <rect x={-size} y={size / 2} width={size * 3} height={size * 2} fill={C.earth} />
          <line x1={-size} y1={size / 2} x2={size * 2} y2={size / 2} stroke={C.ink} strokeWidth={1.5} />
          {[-20, -10, 10, 20].map((d) => (
            <g key={d}>
              <line x1={size / 2 - 18} y1={size / 2 - d * pxPerDeg} x2={size / 2 + 18} y2={size / 2 - d * pxPerDeg} stroke={C.ink} strokeOpacity={0.6} />
              <text x={size / 2 + 22} y={size / 2 - d * pxPerDeg + 3} fill={C.ink} fillOpacity={0.6} fontSize={8}>{d}</text>
            </g>
          ))}
        </g>
      </g>
      <path d={`M ${size / 2 - 40} ${size / 2} H ${size / 2 - 12} L ${size / 2} ${size / 2 + 8} L ${size / 2 + 12} ${size / 2} H ${size / 2 + 40}`} fill="none" stroke={C.amber} strokeWidth={2.5} />
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill="none" stroke={C.line} strokeWidth={2} />
    </svg>
  );
}

export function HeadingIndicator({ quaternion, size = 180 }: { quaternion: QuatLike | null; size?: number }) {
  if (!quaternion) return <NotAvailable label="Heading" size={size} />;
  const h = attitudeFromQuat(quaternion).headingDeg;
  const r = size / 2 - 4;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Heading ${h.toFixed(0)} degrees`} style={{ fontFamily: MONO }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill={C.ground} stroke={C.line} strokeWidth={2} />
      <g style={{ transition: SMOOTH, transformOrigin: "50% 50%", transform: `rotate(${-h}deg)` }}>
        {Array.from({ length: 36 }, (_, i) => i * 10).map((d) => (
          <line key={d} x1={size / 2} y1={size / 2 - r} x2={size / 2} y2={size / 2 - r + (d % 30 === 0 ? 10 : 5)} stroke={C.muted} transform={`rotate(${d} ${size / 2} ${size / 2})`} />
        ))}
        {[["N", 0], ["E", 90], ["S", 180], ["W", 270]].map(([l, d]) => (
          <text key={l as string} x={size / 2} y={size / 2 - r + 24} fill={l === "N" ? C.amber : C.ink} fontSize={12} textAnchor="middle" transform={`rotate(${d} ${size / 2} ${size / 2})`}>{l}</text>
        ))}
      </g>
      <path d={`M ${size / 2} ${size / 2 - 22} L ${size / 2 + 9} ${size / 2 + 12} L ${size / 2} ${size / 2 + 6} L ${size / 2 - 9} ${size / 2 + 12} Z`} fill={C.steel} />
      <text x={size / 2} y={size - 10} fill={C.ink} fontSize={12} textAnchor="middle">{h.toFixed(0).padStart(3, "0")}°</text>
    </svg>
  );
}

/** Altitude tape with vertical-speed bar. groundZ lets you show AGL above a known surface. */
export function AltitudeTape({ altitudeM, verticalSpeedM_S, height = 220 }: { altitudeM: number | null; verticalSpeedM_S: number | null; height?: number }) {
  if (altitudeM === null || verticalSpeedM_S === null) return <NotAvailable label="Altitude" size={height} />;
  const pxPerM = 18;
  const ticks = [];
  for (let m = Math.floor(altitudeM - height / pxPerM / 2); m <= altitudeM + height / pxPerM / 2; m += 1) ticks.push(m);
  const vs = Math.max(-3, Math.min(3, verticalSpeedM_S));
  return (
    <svg width={110} height={height} viewBox={`0 0 110 ${height}`} role="img" aria-label={`Altitude ${altitudeM.toFixed(1)} metres, vertical speed ${verticalSpeedM_S.toFixed(2)} metres per second`} style={{ fontFamily: MONO }}>
      <rect width={74} height={height} fill={C.ground} stroke={C.line} />
      {ticks.map((m) => {
        const y = height / 2 - (m - altitudeM) * pxPerM;
        return (
          <g key={m}>
            <line x1={56} y1={y} x2={74} y2={y} stroke={C.muted} />
            {m % 2 === 0 && <text x={50} y={y + 4} fill={C.muted} fontSize={10} textAnchor="end">{m}</text>}
          </g>
        );
      })}
      <rect x={4} y={height / 2 - 12} width={66} height={24} fill="#19232d" stroke={C.steel} />
      <text x={64} y={height / 2 + 5} fill={C.ink} fontSize={13} textAnchor="end">{altitudeM.toFixed(1)}</text>
      <rect x={84} y={0} width={10} height={height} fill={C.ground} stroke={C.line} />
      <rect x={85} y={vs >= 0 ? height / 2 - (vs / 3) * (height / 2) : height / 2} width={8} height={(Math.abs(vs) / 3) * (height / 2)} fill={vs >= 0 ? C.steel : C.amber} style={{ transition: "all 100ms linear" }} />
      <line x1={82} y1={height / 2} x2={96} y2={height / 2} stroke={C.ink} />
      <text x={100} y={12} fill={C.muted} fontSize={8}>+3</text>
      <text x={100} y={height - 4} fill={C.muted} fontSize={8}>−3</text>
    </svg>
  );
}

export type TrackPoint = { x: number; y: number };

/**
 * Map track in the home frame. `trail` is the recorded path; `playbackIndex`
 * (optional) scrubs a recorded flight. Waypoints come from the planner.
 */
export function MapTrack({ trail, headingDeg, waypoints = [], playbackIndex, bounds, width = 360, height = 260 }: { trail: TrackPoint[]; headingDeg: number | null; waypoints?: TrackPoint[]; playbackIndex?: number; bounds: { minX: number; maxX: number; minY: number; maxY: number }; width?: number; height?: number }) {
  const sx = (x: number) => ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * width;
  const sy = (y: number) => height - ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * height;
  const shown = playbackIndex === undefined ? trail : trail.slice(0, playbackIndex + 1);
  const last = shown[shown.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={last ? `Aircraft at ${last.x.toFixed(1)}, ${last.y.toFixed(1)} metres` : "No track yet"} style={{ fontFamily: MONO }}>
      <rect width={width} height={height} fill={C.ground} stroke={C.line} />
      {waypoints.length > 0 && <polyline points={waypoints.map((w) => `${sx(w.x)},${sy(w.y)}`).join(" ")} fill="none" stroke={C.amber} strokeDasharray="5 4" />}
      {waypoints.map((w, i) => <rect key={i} x={sx(w.x) - 5} y={sy(w.y) - 5} width={10} height={10} fill={C.amber} transform={`rotate(45 ${sx(w.x)} ${sy(w.y)})`} />)}
      <polyline points={shown.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} fill="none" stroke={C.steel} strokeOpacity={0.7} strokeWidth={1.5} />
      <g transform={`translate(${sx(0)} ${sy(0)})`}><path d="M0 -6 L5 4 L-5 4 Z" fill="none" stroke={C.ink} /></g>
      {last && headingDeg !== null && (
        <g style={{ transition: "transform 100ms linear" }} transform={`translate(${sx(last.x)} ${sy(last.y)}) rotate(${headingDeg})`}>
          <path d="M0 -9 L6 7 L0 3 L-6 7 Z" fill={C.steel} />
        </g>
      )}
    </svg>
  );
}

function NotAvailable({ label, size }: { label: string; size: number }) {
  return (
    <div role="img" aria-label={`${label} not available`} style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", border: `1px dashed ${C.line}`, color: C.muted, fontFamily: MONO, fontSize: 11, letterSpacing: ".1em" }}>
      {label.toUpperCase()} · N/A
    </div>
  );
}
