/**
 * Single source of truth for inspection-priority scoring in the frontend.
 *
 * MIRRORS `src/risk_config.py` on the backend so the UI and the published
 * `risk_results.csv` stay consistent. The backend already publishes the final
 * score and priority per consumer; the frontend only recomputes them as a
 * FALLBACK when a record is missing values (e.g. demo/offline data).
 *
 * Architecture represented by these values:
 *   Historical meter data -> Feature engineering -> LightGBM risk score
 *   + unsupervised anomaly score -> combined final risk -> priority -> inspection
 *
 * The combined formula is a documented, configurable weighted blend. It is NOT
 * a new ML methodology and it does NOT confirm theft.
 */

export const RISK_WEIGHTS = {
  // Weight applied to the supervised LightGBM probability.
  ml: 0.7,
  // Weight applied to the unsupervised anomaly score.
  anomaly: 0.3,
};

export const PRIORITY_THRESHOLDS = {
  // final_risk_score >= HIGH  -> HIGH priority
  high: 0.7,
  // final_risk_score >= MEDIUM -> MEDIUM priority, otherwise LOW
  medium: 0.4,
};

export const PRIORITY_ORDER = ["HIGH", "MEDIUM", "LOW"];

/** Combine ML + anomaly signals into the operational final risk score. */
export function combineFinalRisk(mlRisk, anomalyScore) {
  const ml = Number(mlRisk);
  const anomaly = Number(anomalyScore);
  if (!Number.isFinite(ml) && !Number.isFinite(anomaly)) return null;
  const safeMl = Number.isFinite(ml) ? ml : 0;
  const safeAnomaly = Number.isFinite(anomaly) ? anomaly : 0;
  return RISK_WEIGHTS.ml * safeMl + RISK_WEIGHTS.anomaly * safeAnomaly;
}

/** Map a final risk score to its inspection priority band. */
export function priorityForScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  if (value >= PRIORITY_THRESHOLDS.high) return "HIGH";
  if (value >= PRIORITY_THRESHOLDS.medium) return "MEDIUM";
  return "LOW";
}

/**
 * Return a record whose final_risk_score / review_priority are guaranteed to be
 * present. Backend values always win; the formula is only used as a fallback.
 */
export function ensureRiskFields(record) {
  if (!record) return record;
  const finalRisk = Number.isFinite(Number(record.final_risk_score))
    ? Number(record.final_risk_score)
    : combineFinalRisk(record.ml_risk_probability, record.anomaly_score);
  const priority =
    record.review_priority || priorityForScore(finalRisk) || null;
  return { ...record, final_risk_score: finalRisk, review_priority: priority };
}