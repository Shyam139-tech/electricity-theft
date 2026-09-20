/** Small, dependency-free formatting helpers shared across the dashboard. */

/** 0.9516 -> "95.2%" */
export function asPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${(number * 100).toFixed(1)}%`;
}

/** 0.713 -> "0.713" */
export function asMetric(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toFixed(digits);
}

/** 42372 -> "42,372" */
export function asCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString();
}

/** "HIGH" -> "High" */
export function titleCase(value) {
  if (!value) return "";
  return value[0] + value.slice(1).toLowerCase();
}

/** Shorten long consumer IDs for display while keeping both ends readable. */
export function shortId(id) {
  if (!id) return "";
  return id.length > 19 ? `${id.slice(0, 12)}…${id.slice(-7)}` : id;
}