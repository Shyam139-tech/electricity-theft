/**
 * FALLBACK / DEMONSTRATION DATA LAYER
 * -----------------------------------
 * This module is ONLY used when the live backend API is unreachable or returns
 * no data. It lets the dashboard render so the UI can be reviewed offline.
 *
 * IMPORTANT:
 *  - These are demonstration values, NOT production ML results.
 *  - The risk distribution and metrics below mirror the reference design and
 *    the published temporal-validation artifacts, but they are clearly marked
 *    as fallback so they are never mistaken for live backend output.
 *  - Replace this file (or delete it) once the backend is always available.
 *
 * The live API is the source of truth. See `services/api.js`.
 */

import { combineFinalRisk, priorityForScore } from "../config/risk";

export const FALLBACK_SOURCE = "fallback-demo";

/** Demonstration priority mix (matches the reference dashboard). */
export const FALLBACK_SUMMARY = {
  total_consumers: 42372,
  priority_counts: { HIGH: 898, MEDIUM: 6732, LOW: 34742 },
};

/** Demonstration temporal-validation metrics (model-level, not per-consumer). */
export const FALLBACK_METRICS = {
  roc_auc: 0.713,
  pr_auc: 0.237,
  recall_at_100: 0.019,
};

/** A small set of demonstration consumers for the inspection queue. */
const RAW_FALLBACK_CONSUMERS = [
  {
    CONS_NO: "57531380F73D67943259F07E12498E1A",
    ml_risk_probability: 0.976,
    anomaly_score: 0.895,
  },
  {
    CONS_NO: "FB0506FAED1441E1B46C95E150163594",
    ml_risk_probability: 0.972,
    anomaly_score: 0.887,
  },
  {
    CONS_NO: "011FCB87987B5806AA1880B584FF0684",
    ml_risk_probability: 0.973,
    anomaly_score: 0.87,
  },
  {
    CONS_NO: "C4A46CBDB3B01C5ED4CC8B871824CA89",
    ml_risk_probability: 0.946,
    anomaly_score: 0.923,
  },
  {
    CONS_NO: "837D54985C93D7902649F9AFDCD0B484",
    ml_risk_probability: 0.896,
    anomaly_score: 0.999,
  },
  {
    CONS_NO: "5A156ED165407BC96A645CD7BDF723BD",
    ml_risk_probability: 0.723,
    anomaly_score: 0.647,
  },
  {
    CONS_NO: "9D6849D0D42E90D89D4E7A62FD3E152A",
    ml_risk_probability: 0.826,
    anomaly_score: 0.406,
  },
  {
    CONS_NO: "68DD9010B1BC41F2E6F0524FB66C62AC",
    ml_risk_probability: 0.21,
    anomaly_score: 0.18,
  },
];

export const FALLBACK_CONSUMERS = RAW_FALLBACK_CONSUMERS.map((row) => {
  const finalRisk = combineFinalRisk(
    row.ml_risk_probability,
    row.anomaly_score,
  );
  return {
    ...row,
    final_risk_score: finalRisk,
    review_priority: priorityForScore(finalRisk),
  };
});

/** Demonstration risk factors for the consumer detail view. */
export const FALLBACK_RISK_FACTORS = [
  { label: "Long-term consumption decline", evidence: "−24% over 30 days vs prior window" },
  { label: "Feeder consumption deviation", evidence: "Consumer mean is 0.62× feeder average" },
  { label: "Increased missing readings", evidence: "18% of daily readings unavailable" },
  { label: "Seasonal deviation", evidence: "Mean absolute gap vs feeder is 41% of feeder load" },
];

/** Deterministic demonstration consumption history (150 daily points). */
export function fallbackConsumption(consNo) {
  const days = 150;
  const points = [];
  const feederPoints = [];
  const end = new Date(Date.UTC(2016, 9, 31));
  // Simple deterministic pseudo-random from the consumer id.
  let seed = 0;
  for (let i = 0; i < consNo.length; i += 1) {
    seed = (seed * 31 + consNo.charCodeAt(i)) % 100000;
  }
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const base = 9.5 + rand() * 2;
  for (let i = 0; i < days; i += 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - i));
    const iso = date.toISOString().slice(0, 10);
    const seasonal = 1.6 * Math.sin((i / days) * 4 * Math.PI);
    const feeder = Math.max(3.5, base + seasonal + (rand() - 0.5) * 0.4);
    const decline = 1.08 - (i / days) * 0.5;
    const value = Math.max(0, feeder * decline + (rand() - 0.5) * 0.5);
    const missing = rand() < 0.12;
    points.push({ date: iso, value: missing ? null : Number(value.toFixed(3)) });
    feederPoints.push({ date: iso, value: Number(feeder.toFixed(3)) });
  }
  const observed = points.filter((p) => p.value != null);
  return {
    consumer_id: consNo,
    feeder_id: "FDR-104",
    source: FALLBACK_SOURCE,
    source_note:
      "Synthetic demonstration meter history for prototype visualization. Not real utility readings.",
    points,
    feeder_points: feederPoints,
    risk_factors: FALLBACK_RISK_FACTORS,
    summary: {
      total_readings: points.length,
      observed_readings: observed.length,
      missing_readings: points.length - observed.length,
      mean_consumption: observed.length
        ? observed.reduce((sum, p) => sum + p.value, 0) / observed.length
        : null,
    },
  };
}
