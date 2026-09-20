/**
 * Frontend API / service layer.
 *
 * All backend access goes through this module so components never call `fetch`
 * directly. Each method returns live backend data when available and falls back
 * to the clearly-separated demonstration layer (`services/fallbackData.js`)
 * when the API is unreachable, so the UI still renders offline.
 *
 * Backend endpoints (FastAPI, see `backend/app/main.py`):
 *   GET /api/summary
 *   GET /api/inspections?priority=&query=&limit=&offset=
 *   GET /api/customers/{cons_no}
 *   GET /api/customers/{cons_no}/consumption
 *   GET /api/metrics
 *   GET /api/calibration
 *   GET /api/feature-importance
 */

import { ensureRiskFields } from "../config/risk";
import {
  FALLBACK_CONSUMERS,
  FALLBACK_METRICS,
  FALLBACK_SUMMARY,
  fallbackConsumption,
} from "./fallbackData";

const BASE_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

/** Low-level fetch. Throws when the API is not configured or the call fails. */
async function request(path) {
  if (!BASE_URL) {
    throw new Error("VITE_API_URL is not configured.");
  }
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.json();
}

/** True when a live API base URL is configured. */
export const isApiConfigured = Boolean(BASE_URL);

function normalizeRecord(record) {
  return ensureRiskFields(record);
}

function normalizeItems(items) {
  return (items || []).map(normalizeRecord);
}

/** Filter + paginate the demonstration consumers (fallback only). */
function fallbackInspections({ priority, query, limit, offset }) {
  let rows = FALLBACK_CONSUMERS;
  if (priority && priority !== "ALL") {
    rows = rows.filter((row) => row.review_priority === priority);
  }
  if (query) {
    const needle = query.toLowerCase();
    rows = rows.filter((row) => row.CONS_NO.toLowerCase().includes(needle));
  }
  const total = rows.length;
  const items = rows.slice(offset, offset + limit);
  return { total, items, source: "fallback" };
}

export const api = {
  /** Dashboard summary: total consumers + priority counts. */
  async getSummary() {
    try {
      const data = await request("/api/summary");
      return { ...data, source: "live" };
    } catch {
      return { ...FALLBACK_SUMMARY, source: "fallback" };
    }
  },

  /** Model-level temporal validation metrics. */
  async getMetrics() {
    try {
      const data = await request("/api/metrics");
      return { ...data, source: "live" };
    } catch {
      return { ...FALLBACK_METRICS, source: "fallback" };
    }
  },

  /** Population-level calibration assessment. */
  async getCalibration() {
    try {
      return await request("/api/calibration");
    } catch {
      return null;
    }
  },

  /** Global SHAP feature importance. */
  async getFeatureImportance() {
    try {
      return await request("/api/feature-importance");
    } catch {
      return [];
    }
  },

  /** Priority inspection queue with search, filter and pagination. */
  async getInspections({ priority = "ALL", query = "", limit = 25, offset = 0 } = {}) {
    const parameters = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (priority && priority !== "ALL") parameters.set("priority", priority);
    if (query) parameters.set("query", query);
    try {
      const data = await request(`/api/inspections?${parameters}`);
      return {
        total: data.total,
        items: normalizeItems(data.items),
        source: "live",
      };
    } catch {
      return fallbackInspections({ priority, query, limit, offset });
    }
  },

  /** Full consumer profile including explanation and risk factors. */
  async getConsumer(consNo) {
    try {
      const data = await request(`/api/customers/${encodeURIComponent(consNo)}`);
      return { ...normalizeRecord(data), source: "live" };
    } catch {
      const match = FALLBACK_CONSUMERS.find((row) => row.CONS_NO === consNo);
      if (!match) return null;
      return {
        ...match,
        risk_factors: fallbackConsumption(consNo).risk_factors,
        source: "fallback",
      };
    }
  },

  /** Reported consumption history for one consumer. */
  async getConsumption(consNo) {
    try {
      const data = await request(
        `/api/customers/${encodeURIComponent(consNo)}/consumption`,
      );
      return { ...data, source: "live" };
    } catch {
      return fallbackConsumption(consNo);
    }
  },
};
