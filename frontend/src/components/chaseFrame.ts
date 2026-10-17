/**
 * Chase camera offsets in the aircraft frame. The look point stays close to the
 * airframe so the quad remains inside the vertical field of view.
 */
export const CHASE_FRAME = {
  backM: 8,
  rightM: 1.5,
  upM: 2.6,
  lookAheadM: 2,
  lookUpM: 0.35,
  fovDeg: 48,
};

/** Angle between the chase look direction and the vector from the camera to the aircraft. */
export function chaseAircraftAngleDeg(frame = CHASE_FRAME): number {
  const lookX = frame.backM + frame.lookAheadM;
  const lookY = -frame.rightM;
  const lookZ = frame.lookUpM - frame.upM;
  const craftX = frame.backM;
  const craftY = -frame.rightM;
  const craftZ = -frame.upM;
  const dot = lookX * craftX + lookY * craftY + lookZ * craftZ;
  const magnitude = Math.hypot(lookX, lookY, lookZ) * Math.hypot(craftX, craftY, craftZ);
  return (Math.acos(Math.min(1, Math.max(-1, dot / magnitude))) * 180) / Math.PI;
}
