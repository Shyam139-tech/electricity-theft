import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import "./styles.css";

const PAGE_SIZE = 25;
const priorityOrder = ["HIGH", "MEDIUM", "LOW"];

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function Icon({ name, size = 20 }) {
  const paths = {
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />,
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    queue: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 16 4-5 3 3 6-8" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-4.2-4.2" />
      </>
    ),
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const shortId = (id) =>
  id?.length > 19 ? `${id.slice(0, 12)}…${id.slice(-7)}` : id;
const asPercent = (value) => `${((Number(value) || 0) * 100).toFixed(1)}%`;
const titleCase = (value) => value[0] + value.slice(1).toLowerCase();

function PriorityBadge({ priority }) {
  return (
    <span className={`priority-badge ${priority?.toLowerCase()}`}>
      {priority}
    </span>
  );
}

function DonutChart({ counts, total }) {
  const data = priorityOrder.map((priority) => ({
    priority,
    value: Number(counts?.[priority] || 0),
  }));
  let running = 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="distribution-content">
      <div
        className="donut-wrap"
        role="img"
        aria-label="Inspection priority distribution"
      >
        <svg className="donut" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} className="donut-track" />
          {data.map(({ priority, value }) => {
            const share = total ? value / total : 0;
            const dash = `${Math.max(share * circumference - 3, 0)} ${circumference}`;
            const offset = -running * circumference;
            running += share;
            return (
              <circle
                key={priority}
                cx="60"
                cy="60"
                r={radius}
                className={`donut-segment ${priority.toLowerCase()}`}
                strokeDasharray={dash}
                strokeDashoffset={offset}
              />
            );
          })}
        </svg>
        <div className="donut-center">
          <strong>{total?.toLocaleString() || "—"}</strong>
          <span>Consumers</span>
        </div>
      </div>
      <div className="legend-list">
        {data.map(({ priority, value }) => (
          <div className="legend-row" key={priority}>
            <span className={`legend-dot ${priority.toLowerCase()}`} />
            <span>{titleCase(priority)}</span>
            <strong>{value.toLocaleString()}</strong>
            <small>
              {total ? `${((value / total) * 100).toFixed(1)}%` : "—"}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, description }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{description}</small>
    </article>
  );
}

function toChartPath(dated, min, range, denominator) {
  let previousValid = false;
  return dated
    .map((point) => {
      if (!Number.isFinite(point.value)) {
        previousValid = false;
        return "";
      }
      const x = (point.index / denominator) * 100;
      const y = 92 - ((point.value - min) / range) * 76;
      const command = previousValid ? "L" : "M";
      previousValid = true;
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function aggregateMonthly(points) {
  const buckets = new Map();
  (points || []).forEach((point) => {
    const date = new Date(`${point.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) || {
      key,
      values: [],
      observed: 0,
      missing: 0,
    };
    if (point.value == null || !Number.isFinite(Number(point.value)))
      bucket.missing += 1;
    else {
      bucket.values.push(Number(point.value));
      bucket.observed += 1;
    }
    buckets.set(key, bucket);
  });
  if (!buckets.size) return [];
  const keys = [...buckets.keys()];
  const first = new Date(`${keys[0]}-01T00:00:00Z`);
  const last = new Date(`${keys.at(-1)}-01T00:00:00Z`);
  const months = [];
  for (
    const date = new Date(first);
    date <= last;
    date.setUTCMonth(date.getUTCMonth() + 1)
  ) {
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) || {
      key,
      values: [],
      observed: 0,
      missing: 0,
    };
    months.push({
      ...bucket,
      date: `${date.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${date.getUTCFullYear()}`,
      value: bucket.observed
        ? bucket.values.reduce((sum, value) => sum + value, 0) / bucket.observed
        : null,
    });
  }
  return months;
}

function formatChartValue(value) {
  return Number(value).toFixed(2);
}

function peakObserved(points) {
  const values = (points || [])
    .filter((point) => point.value != null)
    .map((point) => Number(point.value))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function historyStats(points) {
  const observed = (points || []).filter(
    (point) => point.value != null && Number.isFinite(Number(point.value)),
  );
  const values = observed.map((point) => Number(point.value));
  return {
    firstDate: points?.[0]?.date,
    lastDate: points?.at(-1)?.date,
    latest: observed.at(-1),
    mean: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
    peak: values.length ? Math.max(...values) : null,
    observed: values.length,
    missing: (points || []).length - values.length,
  };
}

function formatHistoryDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

function LineChart({ points, feederPoints }) {
  const [mode, setMode] = useState("monthly");
  const stats = historyStats(points);
  const feederContext = points?.[0]?.feeder_context;
  const chartError = points?.[0]?.error;
  const chart = useMemo(() => {
    const sourcePoints =
      mode === "monthly" ? aggregateMonthly(points) : points || [];
    const sourceFeederPoints =
      mode === "monthly" ? aggregateMonthly(feederPoints) : feederPoints || [];
    const dated = sourcePoints.map((point, index) => ({
      ...point,
      index,
      value: point.value == null ? Number.NaN : Number(point.value),
    }));
    const feederDated = sourceFeederPoints.map((point, index) => ({
      ...point,
      index,
      value: point.value == null ? Number.NaN : Number(point.value),
    }));
    const valid = dated.filter((point) => Number.isFinite(point.value));
    if (!valid.length) return null;
    const values = valid
      .map((point) => point.value)
      .concat(
        feederDated
          .filter((point) => Number.isFinite(point.value))
          .map((point) => point.value),
      );
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const denominator = Math.max(dated.length - 1, 1);
    return {
      min,
      max,
      path: toChartPath(dated, min, range, denominator),
      feederPath: feederDated.length
        ? toChartPath(feederDated, min, range, denominator)
        : "",
      firstDate: dated[0]?.date,
      lastDate: dated.at(-1)?.date,
      labels:
        dated.length > 7
          ? dated.filter(
              (_, index) =>
                index === 0 ||
                index === dated.length - 1 ||
                index % Math.ceil(dated.length / 6) === 0,
            )
          : dated,
      points: dated,
    };
  }, [points, feederPoints, mode]);
  if (!chart)
    return (
      <p className="history-empty">
        {chartError || "Insufficient meter history for trend visualization."}
      </p>
    );
  const denominator = Math.max(chart.points.length - 1, 1);
  return (
    <>
      <section className="signals-section feeder-context">
        <h3>Feeder Context</h3>
        {feederContext?.mapping_available ? (
          <>
            <p>
              Verified feeder metadata; supporting context only, not a model
              input.
            </p>
            <div className="available-signals">
              <div>
                <span>Feeder</span>
                <strong>{feederContext.feeder_id}</strong>
              </div>
              <div>
                <span>Transformer</span>
                <strong>{feederContext.transformer_id || "—"}</strong>
              </div>
              <div>
                <span>Area</span>
                <strong>{feederContext.area || "—"}</strong>
              </div>
              <div>
                <span>Consumer average</span>
                <strong>
                  {feederContext.consumer_average?.toFixed(2) ?? "—"} kWh
                </strong>
              </div>
              <div>
                <span>Feeder average</span>
                <strong>
                  {feederContext.feeder_average?.toFixed(2) ?? "—"} kWh
                </strong>
              </div>
              <div>
                <span>Deviation</span>
                <strong>
                  {feederContext.deviation_percent == null
                    ? "—"
                    : `${feederContext.deviation_percent.toFixed(1)}%`}
                </strong>
              </div>
            </div>
          </>
        ) : (
          <>
            <p>Feeder mapping unavailable</p>
            <div className="history-empty">
              Feeder-level comparison requires verified feeder metadata.
            </div>
          </>
        )}
      </section>
      <div className="history-summary history-insights">
        <div>
          <span>Latest Available Usage</span>
          <strong>
            {stats.latest ? formatChartValue(stats.latest.value) : "—"}
          </strong>
          <small>
            {stats.latest
              ? `Date: ${formatHistoryDate(stats.latest.date)}`
              : "No observed date"}
          </small>
        </div>
        <div>
          <span>Mean</span>
          <strong>
            {stats.mean == null ? "—" : formatChartValue(stats.mean)}
          </strong>
        </div>
        <div>
          <span>Peak</span>
          <strong>
            {stats.peak == null ? "—" : formatChartValue(stats.peak)}
          </strong>
        </div>
        <div>
          <span>Observed</span>
          <strong>{stats.observed}</strong>
        </div>
        <div>
          <span>Missing</span>
          <strong>{stats.missing}</strong>
        </div>
      </div>
      <div className="history-period">
        <strong>Historical period:</strong> {formatHistoryDate(stats.firstDate)}{" "}
        – {formatHistoryDate(stats.lastDate)}
      </div>
      <div
        className="history-controls"
        role="group"
        aria-label="Consumption history view"
      >
        <button
          className={mode === "monthly" ? "active" : ""}
          onClick={() => setMode("monthly")}
        >
          Monthly Trend
        </button>
        <button
          className={mode === "raw" ? "active" : ""}
          onClick={() => setMode("raw")}
        >
          Raw Readings
        </button>
      </div>
      <div className="history-chart">
        <span className="chart-y-label">Reported consumption</span>
        <div className="chart-scale">
          <span>{chart.max.toFixed(1)}</span>
          <span>{chart.min.toFixed(1)}</span>
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${mode === "monthly" ? "Monthly" : "Raw"} reported consumption history`}
        >
          <path className="chart-grid" d="M0 16H100M0 54H100M0 92H100" />
          {chart.feederPath && (
            <path className="feeder-path" d={chart.feederPath} />
          )}
          <path className="consumption-path" d={chart.path} />
          {chart.points.map(
            (point) =>
              Number.isFinite(point.value) && (
                <circle
                  key={point.key}
                  className="consumption-point"
                  cx={(point.index / denominator) * 100}
                  cy={
                    92 -
                    ((point.value - chart.min) / (chart.max - chart.min || 1)) *
                      76
                  }
                  r="1.2"
                >
                  <title>
                    {mode === "monthly"
                      ? `${point.date}\nAverage reported consumption: ${formatChartValue(point.value)}\nObserved readings: ${point.observed}`
                      : `${point.date}\nReported consumption: ${formatChartValue(point.value)}`}
                  </title>
                </circle>
              ),
          )}
        </svg>
        <div className="chart-axis-label">
          {mode === "monthly" ? "Month" : "Date"}
        </div>
        <div className="chart-dates">
          {chart.labels.map((point) => (
            <span key={point.key}>{point.date}</span>
          ))}
        </div>
      </div>
    </>
  );
}

function CalibrationChart({ bins }) {
  const path = (bins || [])
    .map(
      (bin, index) =>
        `${index ? "L" : "M"}${Number(bin.mean_predicted_risk) * 100},${100 - Number(bin.observed_positive_rate) * 100}`,
    )
    .join(" ");
  return (
    <div className="calibration-chart">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="Calibration reliability diagram"
      >
        <path className="chart-grid" d="M0 0V100H100" />
        <path className="calibration-reference" d="M0,100 L100,0" />
        <path className="calibration-path" d={path} />
      </svg>
      <span className="calibration-y-label">Observed positive rate</span>
      <div className="calibration-axis">
        <span>Predicted risk</span>
        <span>Ideal calibration: dashed diagonal</span>
      </div>
    </div>
  );
}

function ModelExplanation({ explanation, loading, error }) {
  if (loading) {
    return (
      <section className="model-explanation signals-section">
        <h3>MODEL EXPLANATION</h3>
        <p>Why was this consumer flagged?</p>
        <div className="history-empty">Generating model explanation...</div>
      </section>
    );
  }
  if (error || !explanation?.features?.length) {
    return (
      <section className="model-explanation signals-section">
        <h3>MODEL EXPLANATION</h3>
        <p>Why was this consumer flagged?</p>
        <div className="history-empty">
          Model explanation is currently unavailable.
        </div>
      </section>
    );
  }
  const maxValue = Math.max(...explanation.features.map((feature) => Math.abs(feature.shapValue)), 1e-9);
  return (
    <section className="model-explanation signals-section">
      <h3>MODEL EXPLANATION</h3>
      <p>Why was this consumer flagged?</p>
      <div className="shap-list">
        {explanation.features.map((feature) => {
          const positive = feature.shapValue >= 0;
          return (
            <div className="shap-row" key={feature.featureName}>
              <div className="shap-label">
                <span>{feature.name}</span>
                <strong className={positive ? "shap-positive" : "shap-negative"}>
                  {positive ? "+" : ""}{Number(feature.shapValue).toFixed(3)}
                </strong>
              </div>
              <div className="shap-track" aria-hidden="true">
                <span className={positive ? "shap-positive" : "shap-negative"} style={{ width: `${(Math.abs(feature.shapValue) / maxValue) * 100}%` }} />
              </div>
              <small className={positive ? "shap-positive" : "shap-negative"}>
                {positive ? "↑ Increases risk" : "↓ Decreases risk"} · Model input {Number(feature.featureValue).toFixed(3)}
              </small>
            </div>
          );
        })}
      </div>
      <p className="shap-disclaimer">
        SHAP values show how individual model features influenced this consumer's predicted risk. They explain the model prediction and do not confirm electricity theft.
      </p>
    </section>
  );
}

function App() {
  const [summary, setSummary] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [importance, setImportance] = useState([]);
  const [items, setItems] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [priority, setPriority] = useState("HIGH");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [consumption, setConsumption] = useState(null);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [modelExplanation, setModelExplanation] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState(false);
  const [inspectionList, setInspectionList] = useState(
    () => new Set(JSON.parse(localStorage.getItem("inspection-list") || "[]")),
  );
  const [savedInspections, setSavedInspections] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [error, setError] = useState("");
  const [queueLoading, setQueueLoading] = useState(true);
  const [consumerItems, setConsumerItems] = useState([]);
  const [consumerQuery, setConsumerQuery] = useState("");
  const [debouncedConsumerQuery, setDebouncedConsumerQuery] = useState("");
  const [consumerPage, setConsumerPage] = useState(0);
  const [consumerTotal, setConsumerTotal] = useState(0);
  const [consumerLoading, setConsumerLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api("/api/summary"),
      api("/api/metrics"),
      api("/api/calibration"),
      api("/api/feature-importance"),
    ])
      .then(([summaryData, metricData, calibrationData, importanceData]) => {
        setSummary(summaryData);
        setMetrics(metricData);
        setCalibration(calibrationData);
        setImportance(importanceData);
        setError("");
      })
      .catch(() =>
        setError(
          "Live risk data is temporarily unavailable. Check that the local API is running.",
        ),
      );
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const parameters = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (priority !== "ALL") parameters.set("priority", priority);
    if (debouncedQuery) parameters.set("query", debouncedQuery);
    setQueueLoading(true);
    api(`/api/inspections?${parameters}`)
      .then((data) => {
        setItems(shuffled(data.items));
        setTotalResults(data.total);
        setError("");
      })
      .catch(() => {
        setItems([]);
        setTotalResults(0);
        setError(
          "Live risk data is temporarily unavailable. Check that the local API is running.",
        );
      })
      .finally(() => setQueueLoading(false));
  }, [priority, debouncedQuery, page]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedConsumerQuery(consumerQuery.trim());
      setConsumerPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [consumerQuery]);
  useEffect(() => {
    setConsumerLoading(true);
    const countParameters = new URLSearchParams({ limit: "1", offset: "0" });
    if (debouncedConsumerQuery)
      countParameters.set("query", debouncedConsumerQuery);
    api(`/api/inspections?${countParameters}`)
      .then((countData) => {
        if (consumerPage === 0) {
          const sampleSizes = { HIGH: 8, MEDIUM: 8, LOW: 9 };
          return Promise.all(
            Object.entries(sampleSizes).map(([level, limit]) => {
              const parameters = new URLSearchParams({
                limit: String(limit),
                offset: "0",
                priority: level,
                randomize: "true",
              });
              if (debouncedConsumerQuery)
                parameters.set("query", debouncedConsumerQuery);
              return api(`/api/inspections?${parameters}`);
            }),
          ).then((groups) => {
            setConsumerItems(
              shuffled(groups.flatMap((group) => group.items)).slice(
                0,
                PAGE_SIZE,
              ),
            );
            setConsumerTotal(countData.total);
          });
        }
        const maxOffset = Math.max(countData.total - PAGE_SIZE, 0);
        const offset =
          consumerPage === 0
            ? Math.floor(Math.random() * (maxOffset + 1))
            : consumerPage * PAGE_SIZE;
        const parameters = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
          randomize: "true",
        });
        if (debouncedConsumerQuery)
          parameters.set("query", debouncedConsumerQuery);
        return api(`/api/inspections?${parameters}`).then((data) => {
          setConsumerItems(shuffled(data.items));
          setConsumerTotal(data.total);
        });
      })
      .catch(() => {
        setConsumerItems([]);
        setConsumerTotal(0);
      })
      .finally(() => setConsumerLoading(false));
  }, [debouncedConsumerQuery, consumerPage]);

  useEffect(() => {
    if (!selected?.CONS_NO) {
      setConsumption(null);
      return;
    }
    setConsumptionLoading(true);
    setConsumption(null);
    api(`/api/customers/${selected.CONS_NO}/consumption`)
      .then((data) =>
        setConsumption({
          ...data,
          points: data.points.map((point, index) => ({
            ...point,
            key: `${point.date}-${index}`,
          })),
        }),
      )
      .catch((requestError) => {
        console.error("Consumption history request failed", requestError);
        setConsumption({
          points: [
            {
              error:
                "Meter history could not be loaded. Reopen this profile to retry.",
            },
          ],
          feeder_points: [],
          summary: {
            observed_readings: 0,
            missing_readings: 0,
            mean_consumption: null,
          },
        });
      })
      .finally(() => setConsumptionLoading(false));
  }, [selected?.CONS_NO]);
  useEffect(() => {
    if (!selected?.CONS_NO) {
      setModelExplanation(null);
      setExplanationError(false);
      return;
    }
    setExplanationLoading(true);
    setModelExplanation(null);
    setExplanationError(false);
    api(`/api/customers/${encodeURIComponent(selected.CONS_NO)}/explanation`)
      .then((data) => setModelExplanation(data))
      .catch(() => setExplanationError(true))
      .finally(() => setExplanationLoading(false));
  }, [selected?.CONS_NO]);
  useEffect(() => {
    const ids = [...inspectionList];
    if (!ids.length) {
      setSavedInspections([]);
      return;
    }
    setSavedLoading(true);
    Promise.all(ids.map((id) => api(`/api/customers/${id}`).catch(() => null)))
      .then((records) =>
        setSavedInspections(
          records
            .filter(Boolean)
            .sort((a, b) => b.final_risk_score - a.final_risk_score),
        ),
      )
      .finally(() => setSavedLoading(false));
  }, [inspectionList]);
  useEffect(() => {
    const sections = [
      ["Inspection Queue", "inspection-queue"],
      ["Saved Inspections", "saved-inspections"],
      ["Consumers", "consumers"],
      ["Analytics", "analytics"],
    ]
      .map(([label, id]) => ({ label, element: document.getElementById(id) }))
      .filter((section) => section.element);
    const visible = new Set();
    const updateActiveSection = () => {
      const current = [...visible].sort(
        (left, right) =>
          left.element.getBoundingClientRect().top -
          right.element.getBoundingClientRect().top,
      )[0];
      setActiveNav(current?.label || "Dashboard");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const section = sections.find(
            (candidate) => candidate.element === entry.target,
          );
          if (section && entry.isIntersecting) visible.add(section);
          else if (section) visible.delete(section);
        });
        updateActiveSection();
      },
      { rootMargin: "-10% 0px -80% 0px", threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section.element));
    return () => observer.disconnect();
  }, []);

  const pageCount = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const consumerPageCount = Math.max(1, Math.ceil(consumerTotal / PAGE_SIZE));
  const selectedInList = selected && inspectionList.has(selected.CONS_NO);
  const topImportance = importance.slice(0, 5);
  const maxImportance = topImportance[0]?.mean_abs_shap || 1;
  const navigate = (label, target) => {
    setActiveNav(label);
    document
      .getElementById(target)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openCustomer = async (id) => {
    setSelectedLoading(true);
    setCopied(false);
    try {
      setSelected(await api(`/api/customers/${id}`));
    } catch {
      setError("The consumer profile could not be loaded.");
    } finally {
      setSelectedLoading(false);
    }
  };
  const copyId = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  const addToInspectionList = (id) =>
    setInspectionList((current) => {
      const updated = new Set([...current, id]);
      localStorage.setItem("inspection-list", JSON.stringify([...updated]));
      return updated;
    });
  const removeFromInspectionList = (id) =>
    setInspectionList((current) => {
      const updated = new Set(current);
      updated.delete(id);
      localStorage.setItem("inspection-list", JSON.stringify([...updated]));
      return updated;
    });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="bolt" size={21} />
          </span>
          <span>GridSight</span>
        </div>
        <nav aria-label="Primary navigation">
          {[
            ["Dashboard", "dashboard", "grid"],
            ["Inspection Queue", "inspection-queue", "queue"],
            ["Saved Inspections", "saved-inspections", "check"],
            ["Consumers", "consumers", "users"],
            ["Analytics", "analytics", "chart"],
          ].map(([label, target, icon]) => (
            <button
              className={activeNav === label ? "nav-item active" : "nav-item"}
              onClick={() => navigate(label, target)}
              key={label}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="info" size={17} />
          <span>
            Risk scores support inspection decisions. They do not confirm theft.
          </span>
        </div>
      </aside>
      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">UTILITY ANALYTICS PLATFORM</p>
            <h1>
              Electricity Theft Inspection
              <br className="desktop-break" /> Prioritization Dashboard
            </h1>
            <p className="subtitle">
              AI-assisted identification and prioritization of consumers for
              field inspection
            </p>
          </div>
          <div className="system-status">
            <span className="status-dot" />
            System Active
          </div>
        </header>
        {error && (
          <div className="notice" role="status">
            <Icon name="info" size={18} />
            {error}
          </div>
        )}
        <section className="kpi-grid" aria-label="Priority overview">
          <article className="kpi-card total">
            <div className="kpi-icon">
              <Icon name="users" />
            </div>
            <div>
              <p>TOTAL CONSUMERS</p>
              <strong>
                {summary?.total_consumers?.toLocaleString() ?? "—"}
              </strong>
              <small>Eligible for risk review</small>
            </div>
          </article>
          {priorityOrder.map((level) => (
            <article className={`kpi-card ${level.toLowerCase()}`} key={level}>
              <div className="kpi-icon">
                <Icon name={level === "HIGH" ? "bolt" : "queue"} />
              </div>
              <div>
                <p>{level} PRIORITY</p>
                <strong>
                  {summary?.priority_counts?.[level]?.toLocaleString() ?? "—"}
                </strong>
                <small>
                  {level === "HIGH"
                    ? "Recommended for inspection"
                    : "Active risk segment"}
                </small>
              </div>
            </article>
          ))}
        </section>
        <section className="insights-grid">
          <article className="panel distribution-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">RISK DISTRIBUTION</p>
                <h2>Inspection priority mix</h2>
                <span>Current consumer inspection prioritization</span>
              </div>
            </div>
            <DonutChart
              counts={summary?.priority_counts}
              total={summary?.total_consumers}
            />
          </article>
          <article className="panel validation-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">MODEL VALIDATION</p>
                <h2>Temporal validation</h2>
                <span>Performance on the held-out time period</span>
              </div>
              <Icon name="chart" size={25} />
            </div>
            <div className="metric-grid">
              <MetricCard
                label="ROC-AUC"
                value={metrics?.roc_auc?.toFixed(3) ?? "—"}
                description="Ranking discrimination"
              />
              <MetricCard
                label="PR-AUC"
                value={metrics?.pr_auc?.toFixed(3) ?? "—"}
                description="Positive-class precision"
              />
              <MetricCard
                label="RECALL @ 100"
                value={metrics?.recall_at_100?.toFixed(3) ?? "—"}
                description="Found in top 100"
              />
            </div>
            <p className="panel-disclaimer">
              Validation metrics describe the model overall; they are not
              individual consumer risk scores.
            </p>
          </article>
        </section>
        <section id="inspection-queue" className="queue-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">INSPECTION OPERATIONS</p>
              <h2>Priority Inspection Queue</h2>
              <span>Consumers ranked by inspection priority</span>
            </div>
            <div className="inspection-count">
              <Icon name="queue" size={18} />
              <span>{inspectionList.size} saved for inspection</span>
            </div>
          </div>
          <div className="queue-toolbar">
            <label className="search-box">
              <Icon name="search" size={19} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Consumer ID"
                aria-label="Search Consumer ID"
              />
            </label>
            <div className="priority-filter" aria-label="Priority filter">
              {["ALL", ...priorityOrder].map((level) => (
                <button
                  key={level}
                  className={
                    priority === level
                      ? `filter-button ${level.toLowerCase()}`
                      : "filter-button"
                  }
                  onClick={() => {
                    setPriority(level);
                    setPage(0);
                  }}
                >
                  {titleCase(level)}
                </button>
              ))}
            </div>
          </div>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Consumer</th>
                    <th>ML Risk</th>
                    <th>Anomaly</th>
                    <th>Final Risk</th>
                    <th>Priority</th>
                    <th aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {queueLoading ? (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        Loading inspection queue…
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        No consumers match this search.
                      </td>
                    </tr>
                  ) : (
                    items.map((row) => (
                      <tr key={row.CONS_NO}>
                        <td>
                          <div className="consumer-cell">
                            <span title={row.CONS_NO}>
                              {shortId(row.CONS_NO)}
                            </span>
                            <button
                              className="copy-icon"
                              title="Copy consumer ID"
                              aria-label="Copy consumer ID"
                              onClick={() => copyId(row.CONS_NO)}
                            >
                              <Icon name="copy" size={16} />
                            </button>
                          </div>
                        </td>
                        <td>{asPercent(row.ml_risk_probability)}</td>
                        <td>{asPercent(row.anomaly_score)}</td>
                        <td>
                          <strong>{asPercent(row.final_risk_score)}</strong>
                        </td>
                        <td>
                          <PriorityBadge priority={row.review_priority} />
                        </td>
                        <td>
                          <button
                            className="view-button"
                            onClick={() => openCustomer(row.CONS_NO)}
                          >
                            View <Icon name="arrow" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Showing {totalResults ? page * PAGE_SIZE + 1 : 0}–
                {Math.min((page + 1) * PAGE_SIZE, totalResults)} of{" "}
                {totalResults.toLocaleString()}
              </span>
              <div>
                <button
                  disabled={page === 0}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <span className="page-label">
                  Page {page + 1} of {pageCount}
                </span>
                <button
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
        <section id="saved-inspections" className="saved-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FIELD INSPECTION WORKLIST</p>
              <h2>Saved Inspection List</h2>
              <span>Consumers selected for follow-up in this browser</span>
            </div>
            <div className="inspection-count">
              <Icon name="check" size={18} />
              <span>{inspectionList.size} saved for inspection</span>
            </div>
          </div>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Consumer</th>
                    <th>ML Risk</th>
                    <th>Anomaly</th>
                    <th>Final Risk</th>
                    <th>Priority</th>
                    <th aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {savedLoading ? (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        Loading saved inspection profiles…
                      </td>
                    </tr>
                  ) : savedInspections.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        No consumers have been added yet. Open a consumer
                        profile and choose “Add to Inspection List.”
                      </td>
                    </tr>
                  ) : (
                    savedInspections.map((row) => (
                      <tr key={row.CONS_NO}>
                        <td>
                          <div className="consumer-cell">
                            <span title={row.CONS_NO}>
                              {shortId(row.CONS_NO)}
                            </span>
                            <button
                              className="copy-icon"
                              title="Copy consumer ID"
                              aria-label="Copy consumer ID"
                              onClick={() => copyId(row.CONS_NO)}
                            >
                              <Icon name="copy" size={16} />
                            </button>
                          </div>
                        </td>
                        <td>{asPercent(row.ml_risk_probability)}</td>
                        <td>{asPercent(row.anomaly_score)}</td>
                        <td>
                          <strong>{asPercent(row.final_risk_score)}</strong>
                        </td>
                        <td>
                          <PriorityBadge priority={row.review_priority} />
                        </td>
                        <td>
                          <div className="saved-actions">
                            <button
                              className="view-button"
                              onClick={() => openCustomer(row.CONS_NO)}
                            >
                              View
                            </button>
                            <button
                              className="remove-button"
                              onClick={() =>
                                removeFromInspectionList(row.CONS_NO)
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="saved-note">
            Saved locally in this browser. It does not change the model, scores,
            or source dataset.
          </p>
        </section>
        <section id="consumers" className="consumers-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CONSUMER DIRECTORY</p>
              <h2>All consumers</h2>
              <span>
                Search the full eligible consumer population and open a risk
                profile
              </span>
            </div>
            <div className="directory-note">
              <Icon name="users" size={18} />
              Not an inspection recommendation by itself
            </div>
          </div>
          <div className="directory-toolbar">
            <label className="search-box">
              <Icon name="search" size={19} />
              <input
                value={consumerQuery}
                onChange={(event) => setConsumerQuery(event.target.value)}
                placeholder="Search Consumer ID"
                aria-label="Search all consumers"
              />
            </label>
          </div>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Consumer</th>
                    <th>Risk Score</th>
                    <th>Priority</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {consumerLoading ? (
                    <tr>
                      <td colSpan="4" className="empty-state">
                        Loading consumer directory…
                      </td>
                    </tr>
                  ) : consumerItems.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-state">
                        No consumers match this search.
                      </td>
                    </tr>
                  ) : (
                    consumerItems.map((row) => (
                      <tr key={row.CONS_NO}>
                        <td>
                          <div className="consumer-cell">
                            <span title={row.CONS_NO}>
                              {shortId(row.CONS_NO)}
                            </span>
                            <button
                              className="copy-icon"
                              title="Copy consumer ID"
                              aria-label="Copy consumer ID"
                              onClick={() => copyId(row.CONS_NO)}
                            >
                              <Icon name="copy" size={16} />
                            </button>
                          </div>
                        </td>
                        <td>
                          <strong>{asPercent(row.final_risk_score)}</strong>
                        </td>
                        <td>
                          <PriorityBadge priority={row.review_priority} />
                        </td>
                        <td>
                          <button
                            className="view-button"
                            onClick={() => openCustomer(row.CONS_NO)}
                          >
                            View profile <Icon name="arrow" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Showing {consumerTotal ? consumerPage * PAGE_SIZE + 1 : 0}–
                {Math.min((consumerPage + 1) * PAGE_SIZE, consumerTotal)} of{" "}
                {consumerTotal.toLocaleString()}
              </span>
              <div>
                <button
                  disabled={consumerPage === 0}
                  onClick={() => setConsumerPage((value) => value - 1)}
                >
                  Previous
                </button>
                <span className="page-label">
                  Page {consumerPage + 1} of {consumerPageCount}
                </span>
                <button
                  disabled={consumerPage >= consumerPageCount - 1}
                  onClick={() => setConsumerPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
        <section id="analytics" className="analytics-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ANALYTICS</p>
              <h2>Model & priority analytics</h2>
              <span>Signals available from the current model outputs</span>
            </div>
          </div>
          <div className="analytics-grid">
            <article className="panel">
              <h3>Priority Distribution</h3>
              <div className="priority-bars">
                {priorityOrder.map((level) => {
                  const amount = summary?.priority_counts?.[level] || 0;
                  const share = summary?.total_consumers
                    ? amount / summary.total_consumers
                    : 0;
                  return (
                    <div className="priority-bar" key={level}>
                      <div>
                        <PriorityBadge priority={level} />
                        <strong>{amount.toLocaleString()}</strong>
                      </div>
                      <div className="bar-track">
                        <span
                          className={level.toLowerCase()}
                          style={{ width: `${share * 100}%` }}
                        />
                      </div>
                      <small>{(share * 100).toFixed(1)}% of consumers</small>
                    </div>
                  );
                })}
              </div>
            </article>
            <article className="panel">
              <h3>Top model risk indicators</h3>
              <p className="small-copy">
                Global SHAP importance across the explained sample. These
                indicators contribute to model risk; they do not establish
                theft.
              </p>
              <div className="importance-list">
                {topImportance.map((entry) => (
                  <div key={entry.feature} className="importance-row">
                    <div>
                      <span>{entry.feature.replaceAll("_", " ")}</span>
                      <strong>{entry.mean_abs_shap.toFixed(3)}</strong>
                    </div>
                    <div className="bar-track">
                      <span
                        className="importance"
                        style={{
                          width: `${(entry.mean_abs_shap / maxImportance) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
          <div className="analytics-grid calibration-coverage">
            <article className="panel">
              <h3>Probability calibration</h3>
              <p className="small-copy">
                Held-out temporal-test reliability. The dashed diagonal
                represents ideal calibration.
              </p>
              <CalibrationChart bins={calibration?.bins} />
              <div className="calibration-foot">
                <strong>
                  Brier score: {calibration?.brier_score?.toFixed(3) ?? "—"}
                </strong>
                <span>Population-level reliability check</span>
              </div>
            </article>
            <article className="panel coverage-panel">
              <h3>Data coverage & limitations</h3>
              <ul>
                <li>
                  <Icon name="check" size={16} />
                  <span>
                    Historical meter readings, seasonal indicators, and
                    meter-level missingness are included in the source dataset.
                  </span>
                </li>
                <li>
                  <Icon name="check" size={16} />
                  <span>
                    Risk ranking, anomaly signals, SHAP indicators, and temporal
                    model evaluation are available.
                  </span>
                </li>
                <li>
                  <Icon name="info" size={16} />
                  <span>
                    Feeder-level context is supported by the system but is
                    currently unavailable because the source dataset does not
                    provide verified feeder mapping. No feeder IDs or feeder
                    statistics are fabricated.
                  </span>
                </li>
                <li>
                  <Icon name="info" size={16} />
                  <span>
                    Neighborhood, region, and inspection-event dates are not
                    available in the source meter data.
                  </span>
                </li>
                <li>
                  <Icon name="info" size={16} />
                  <span>
                    Scores prioritize consumers for field inspection. They are
                    not a finding of theft or a consumer-level certainty
                    estimate.
                  </span>
                </li>
              </ul>
            </article>
          </div>
        </section>
      </main>
      {(selected || selectedLoading) && (
        <div
          className="drawer-layer"
          role="dialog"
          aria-modal="true"
          aria-label="Consumer profile"
        >
          <button
            className="drawer-backdrop"
            aria-label="Close consumer profile"
            onClick={() => setSelected(null)}
          />
          <aside className="consumer-drawer">
            {selectedLoading && !selected ? (
              <div className="drawer-loading">Loading consumer profile…</div>
            ) : (
              selected && (
                <>
                  <div className="drawer-top">
                    <div>
                      <p className="eyebrow">CONSUMER PROFILE</p>
                      <h2 title={selected.CONS_NO}>
                        {shortId(selected.CONS_NO)}
                      </h2>
                    </div>
                    <button
                      className="close-button"
                      onClick={() => setSelected(null)}
                      aria-label="Close"
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                  <button
                    className="copy-id-button"
                    onClick={() => copyId(selected.CONS_NO)}
                  >
                    <Icon name={copied ? "check" : "copy"} size={16} />
                    {copied ? "Copied" : "Copy Consumer ID"}
                  </button>
                  <div className="drawer-priority">
                    <span>INSPECTION PRIORITY</span>
                    <PriorityBadge priority={selected.review_priority} />
                  </div>
                  <div className="risk-hero">
                    <span>RISK SCORE</span>
                    <strong>{asPercent(selected.final_risk_score)}</strong>
                    <small>Combined inspection prioritization score</small>
                  </div>
                  <div className="drawer-score-grid">
                    <div>
                      <span>ML RISK</span>
                      <strong>{asPercent(selected.ml_risk_probability)}</strong>
                    </div>
                    <div>
                      <span>ANOMALY SIGNAL</span>
                      <strong>{asPercent(selected.anomaly_score)}</strong>
                    </div>
                  </div>
                  <section className="signals-section">
                    <h3>Risk Signals</h3>
                    <p>Available risk signals</p>
                    {selected.risk_factors?.length || selected.explanation ? (
                      <ul className="signal-list">
                        {(selected.risk_factors || []).map((factor) => (
                          <li key={factor.label}>
                            <span>{factor.label}</span>
                            <strong>{factor.evidence}</strong>
                            <small>Derived from meter history</small>
                          </li>
                        ))}
                        {[1, 2, 3].map(
                          (rank) =>
                            selected.explanation?.[`driver_${rank}`] && (
                              <li key={rank}>
                                <span>
                                  {selected.explanation[
                                    `driver_${rank}`
                                  ].replaceAll("_", " ")}
                                </span>
                                <strong>
                                  +
                                  {Number(
                                    selected.explanation[`driver_${rank}_shap`],
                                  ).toFixed(3)}
                                </strong>
                                <small>Contributes to model risk</small>
                              </li>
                            ),
                        )}
                      </ul>
                    ) : (
                      <div className="available-signals">
                        <div>
                          <span>ML Risk</span>
                          <strong>
                            {asPercent(selected.ml_risk_probability)}
                          </strong>
                        </div>
                        <div>
                          <span>Anomaly signal</span>
                          <strong>{asPercent(selected.anomaly_score)}</strong>
                        </div>
                      </div>
                    )}
                  </section>
                  <ModelExplanation
                    explanation={modelExplanation}
                    loading={explanationLoading}
                    error={explanationError}
                  />
                  <section className="consumption-section">
                    <div>
                      <h3>Consumption Pattern</h3>
                      <p>
                        Reported meter history. Missing readings are not
                        plotted.
                      </p>
                    </div>
                    {consumptionLoading ? (
                      <div className="history-empty">
                        Loading meter history…
                      </div>
                    ) : consumption ? (
                      <>
                        <LineChart
                          points={consumption.points}
                          feederPoints={consumption.feeder_points}
                        />
                        <div className="history-summary">
                          <span>
                            {consumption.summary.observed_readings} observed
                          </span>
                          <span>
                            {consumption.summary.missing_readings} missing
                          </span>
                          <span>
                            Mean{" "}
                            {consumption.summary.mean_consumption?.toFixed(2) ??
                              "—"}
                          </span>
                          {consumption.feeder_id && (
                            <span>Feeder {consumption.feeder_id}</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="history-empty">
                        Consumption history is unavailable.
                      </div>
                    )}
                  </section>
                  <section className="recommendation">
                    <div>
                      <Icon name="bolt" size={19} />
                      <div>
                        <span>INSPECTION RECOMMENDATION</span>
                        <strong>
                          Prioritize this consumer for field inspection
                        </strong>
                      </div>
                    </div>
                    <button
                      className={
                        selectedInList
                          ? "inspection-button added"
                          : "inspection-button"
                      }
                      onClick={() => addToInspectionList(selected.CONS_NO)}
                      disabled={selectedInList}
                    >
                      {selectedInList ? (
                        <>
                          <Icon name="check" size={17} /> Added to Inspection
                          List
                        </>
                      ) : (
                        "Add to Inspection List"
                      )}
                    </button>
                  </section>
                </>
              )
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
