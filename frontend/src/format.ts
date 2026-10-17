export function formatFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(digits);
}

export function formatSigned(value: number, digits: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const text = value.toFixed(digits);
  return value > 0 ? `+${text}` : text;
}
