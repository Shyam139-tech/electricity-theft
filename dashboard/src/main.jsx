import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import "./styles.css";

const PAGE_SIZE = 25;
const priorityOrder = ["HIGH", "MEDIUM", "LOW"];

function Icon({ name, size = 20 }) {
  const paths = {
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    queue: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m7 16 4-5 3 3 6-8" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const shortId = (id) => id?.length > 19 ? `${id.slice(0, 12)}…${id.slice(-7)}` : id;
const asPercent = (value) => `${((Number(value) || 0) * 100).toFixed(1)}%`;
const titleCase = (value) => value[0] + value.slice(1).toLowerCase();

function PriorityBadge({ priority }) {
  return <span className={`priority-badge ${priority?.toLowerCase()}`}>{priority}</span>;
}

function DonutChart({ counts, total }) {
  const data = priorityOrder.map((priority) => ({ priority, value: Number(counts?.[priority] || 0) }));
  let running = 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return <div className="distribution-content">
    <div className="donut-wrap" role="img" aria-label="Inspection priority distribution">
      <svg className="donut" viewBox="0 0 120 120"><circle cx="60" cy="60" r={radius} className="donut-track" />
        {data.map(({ priority, value }) => { const share = total ? value / total : 0; const dash = `${Math.max(share * circumference - 3, 0)} ${circumference}`; const offset = -running * circumference; running += share; return <circle key={priority} cx="60" cy="60" r={radius} className={`donut-segment ${priority.toLowerCase()}`} strokeDasharray={dash} strokeDashoffset={offset} />; })}
      </svg><div className="donut-center"><strong>{total?.toLocaleString() || "—"}</strong><span>Consumers</span></div>
    </div>
    <div className="legend-list">{data.map(({ priority, value }) => <div className="legend-row" key={priority}><span className={`legend-dot ${priority.toLowerCase()}`} /><span>{titleCase(priority)}</span><strong>{value.toLocaleString()}</strong><small>{total ? `${((value / total) * 100).toFixed(1)}%` : "—"}</small></div>)}</div>
  </div>;
}

function MetricCard({ label, value, description }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{description}</small></article>;
}

function LineChart({ points }) {
  const chart = useMemo(() => {
    const dated = (points || []).map((point, index) => ({ ...point, index, value: point.value == null ? Number.NaN : Number(point.value) }));
    const valid = dated.filter((point) => Number.isFinite(point.value));
    if (!valid.length) return null;
    const values = valid.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const denominator = Math.max(dated.length - 1, 1);
    let previousValid = false;
    const path = dated.map((point) => {
      if (!Number.isFinite(point.value)) { previousValid = false; return ""; }
      const x = (point.index / denominator) * 100;
      const y = 92 - ((point.value - min) / range) * 76;
      const command = previousValid ? "L" : "M";
      previousValid = true;
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    return { min, max, path, firstDate: dated[0]?.date, lastDate: dated.at(-1)?.date };
  }, [points]);
  if (!chart) return <p className="history-empty">No observed consumption readings are available for this consumer.</p>;
  return <div className="history-chart"><div className="chart-scale"><span>{chart.max.toFixed(1)}</span><span>{chart.min.toFixed(1)}</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Reported consumption history"><path className="chart-grid" d="M0 16H100M0 54H100M0 92H100" /><path className="consumption-path" d={chart.path} /></svg><div className="chart-dates"><span>{chart.firstDate}</span><span>{chart.lastDate}</span></div></div>;
}

function CalibrationChart({ bins }) {
  const path = (bins || []).map((bin, index) => `${index ? "L" : "M"}${Number(bin.mean_predicted_risk) * 100},${100 - Number(bin.observed_positive_rate) * 100}`).join(" ");
  return <div className="calibration-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Calibration reliability diagram"><path className="chart-grid" d="M0 0V100H100" /><path className="calibration-reference" d="M0,100 L100,0" /><path className="calibration-path" d={path} /></svg><div className="calibration-axis"><span>Predicted risk</span><span>Observed positive rate</span></div></div>;
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
  const [inspectionList, setInspectionList] = useState(() => new Set(JSON.parse(localStorage.getItem("inspection-list") || "[]")));
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
    Promise.all([api("/api/summary"), api("/api/metrics"), api("/api/calibration"), api("/api/feature-importance")])
      .then(([summaryData, metricData, calibrationData, importanceData]) => { setSummary(summaryData); setMetrics(metricData); setCalibration(calibrationData); setImportance(importanceData); setError(""); })
      .catch(() => setError("Live risk data is temporarily unavailable. Check that the local API is running."));
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(0); }, 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    const parameters = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (priority !== "ALL") parameters.set("priority", priority);
    if (debouncedQuery) parameters.set("query", debouncedQuery);
    setQueueLoading(true);
    api(`/api/inspections?${parameters}`).then((data) => { setItems(data.items); setTotalResults(data.total); setError(""); }).catch(() => { setItems([]); setTotalResults(0); setError("Live risk data is temporarily unavailable. Check that the local API is running."); }).finally(() => setQueueLoading(false));
  }, [priority, debouncedQuery, page]);
  useEffect(() => { const timer = window.setTimeout(() => { setDebouncedConsumerQuery(consumerQuery.trim()); setConsumerPage(0); }, 250); return () => window.clearTimeout(timer); }, [consumerQuery]);
  useEffect(() => {
    const parameters = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(consumerPage * PAGE_SIZE) });
    if (debouncedConsumerQuery) parameters.set("query", debouncedConsumerQuery);
    setConsumerLoading(true);
    api(`/api/inspections?${parameters}`)
      .then((data) => { setConsumerItems(data.items); setConsumerTotal(data.total); })
      .catch(() => { setConsumerItems([]); setConsumerTotal(0); })
      .finally(() => setConsumerLoading(false));
  }, [debouncedConsumerQuery, consumerPage]);

  useEffect(() => {
    if (!selected?.CONS_NO) { setConsumption(null); return; }
    setConsumptionLoading(true); setConsumption(null);
    api(`/api/customers/${selected.CONS_NO}/consumption`)
      .then(setConsumption)
      .catch(() => setConsumption(null))
      .finally(() => setConsumptionLoading(false));
  }, [selected?.CONS_NO]);
  useEffect(() => {
    const ids = [...inspectionList];
    if (!ids.length) { setSavedInspections([]); return; }
    setSavedLoading(true);
    Promise.all(ids.map((id) => api(`/api/customers/${id}`).catch(() => null)))
      .then((records) => setSavedInspections(records.filter(Boolean).sort((a, b) => b.final_risk_score - a.final_risk_score)))
      .finally(() => setSavedLoading(false));
  }, [inspectionList]);

  const pageCount = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const consumerPageCount = Math.max(1, Math.ceil(consumerTotal / PAGE_SIZE));
  const selectedInList = selected && inspectionList.has(selected.CONS_NO);
  const topImportance = importance.slice(0, 5);
  const maxImportance = topImportance[0]?.mean_abs_shap || 1;
  const navigate = (label, target) => { setActiveNav(label); document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const openCustomer = async (id) => { setSelectedLoading(true); setCopied(false); try { setSelected(await api(`/api/customers/${id}`)); } catch { setError("The consumer profile could not be loaded."); } finally { setSelectedLoading(false); } };
  const copyId = async (id) => { try { await navigator.clipboard.writeText(id); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); } };
  const addToInspectionList = (id) => setInspectionList((current) => {
    const updated = new Set([...current, id]);
    localStorage.setItem("inspection-list", JSON.stringify([...updated]));
    return updated;
  });
  const removeFromInspectionList = (id) => setInspectionList((current) => {
    const updated = new Set(current);
    updated.delete(id);
    localStorage.setItem("inspection-list", JSON.stringify([...updated]));
    return updated;
  });

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Icon name="bolt" size={21} /></span><span>GridSight</span></div><nav aria-label="Primary navigation">{[["Dashboard", "dashboard", "grid"], ["Inspection Queue", "inspection-queue", "queue"], ["Saved Inspections", "saved-inspections", "check"], ["Consumers", "consumers", "users"], ["Analytics", "analytics", "chart"]].map(([label, target, icon]) => <button className={activeNav === label ? "nav-item active" : "nav-item"} onClick={() => navigate(label, target)} key={label}><Icon name={icon} /><span>{label}</span></button>)}</nav><div className="sidebar-note"><Icon name="info" size={17} /><span>Risk scores support inspection decisions. They do not confirm theft.</span></div></aside>
    <main className="main-content" id="dashboard">
      <header className="topbar"><div><p className="eyebrow">UTILITY ANALYTICS PLATFORM</p><h1>Electricity Theft Inspection<br className="desktop-break" /> Prioritization Dashboard</h1><p className="subtitle">AI-assisted identification and prioritization of consumers for field inspection</p></div><div className="system-status"><span className="status-dot" />System Active</div></header>
      {error && <div className="notice" role="status"><Icon name="info" size={18} />{error}</div>}
      <section className="kpi-grid" aria-label="Priority overview"><article className="kpi-card total"><div className="kpi-icon"><Icon name="users" /></div><div><p>TOTAL CONSUMERS</p><strong>{summary?.total_consumers?.toLocaleString() ?? "—"}</strong><small>Eligible for risk review</small></div></article>{priorityOrder.map((level) => <article className={`kpi-card ${level.toLowerCase()}`} key={level}><div className="kpi-icon"><Icon name={level === "HIGH" ? "bolt" : "queue"} /></div><div><p>{level} PRIORITY</p><strong>{summary?.priority_counts?.[level]?.toLocaleString() ?? "—"}</strong><small>{level === "HIGH" ? "Recommended for inspection" : "Active risk segment"}</small></div></article>)}</section>
      <section className="insights-grid"><article className="panel distribution-panel"><div className="panel-heading"><div><p className="eyebrow">RISK DISTRIBUTION</p><h2>Inspection priority mix</h2><span>Current consumer inspection prioritization</span></div></div><DonutChart counts={summary?.priority_counts} total={summary?.total_consumers} /></article><article className="panel validation-panel"><div className="panel-heading"><div><p className="eyebrow">MODEL VALIDATION</p><h2>Temporal validation</h2><span>Performance on the held-out time period</span></div><Icon name="chart" size={25} /></div><div className="metric-grid"><MetricCard label="ROC-AUC" value={metrics?.roc_auc?.toFixed(3) ?? "—"} description="Ranking discrimination" /><MetricCard label="PR-AUC" value={metrics?.pr_auc?.toFixed(3) ?? "—"} description="Positive-class precision" /><MetricCard label="RECALL @ 100" value={metrics?.recall_at_100?.toFixed(3) ?? "—"} description="Found in top 100" /></div><p className="panel-disclaimer">Validation metrics describe the model overall; they are not individual consumer risk scores.</p></article></section>
      <section id="inspection-queue" className="queue-section"><div className="section-heading"><div><p className="eyebrow">INSPECTION OPERATIONS</p><h2>Priority Inspection Queue</h2><span>Consumers ranked by inspection priority</span></div><div className="inspection-count"><Icon name="queue" size={18} /><span>{inspectionList.size} saved for inspection</span></div></div><div className="queue-toolbar"><label className="search-box"><Icon name="search" size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Consumer ID" aria-label="Search Consumer ID" /></label><div className="priority-filter" aria-label="Priority filter">{["ALL", ...priorityOrder].map((level) => <button key={level} className={priority === level ? `filter-button ${level.toLowerCase()}` : "filter-button"} onClick={() => { setPriority(level); setPage(0); }}>{titleCase(level)}</button>)}</div></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Consumer</th><th>ML Risk</th><th>Anomaly</th><th>Final Risk</th><th>Priority</th><th aria-label="Action" /></tr></thead><tbody>{queueLoading ? <tr><td colSpan="6" className="empty-state">Loading inspection queue…</td></tr> : items.length === 0 ? <tr><td colSpan="6" className="empty-state">No consumers match this search.</td></tr> : items.map((row) => <tr key={row.CONS_NO}><td><div className="consumer-cell"><span title={row.CONS_NO}>{shortId(row.CONS_NO)}</span><button className="copy-icon" title="Copy consumer ID" aria-label="Copy consumer ID" onClick={() => copyId(row.CONS_NO)}><Icon name="copy" size={16} /></button></div></td><td>{asPercent(row.ml_risk_probability)}</td><td>{asPercent(row.anomaly_score)}</td><td><strong>{asPercent(row.final_risk_score)}</strong></td><td><PriorityBadge priority={row.review_priority} /></td><td><button className="view-button" onClick={() => openCustomer(row.CONS_NO)}>View <Icon name="arrow" size={16} /></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Showing {totalResults ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, totalResults)} of {totalResults.toLocaleString()}</span><div><button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button><span className="page-label">Page {page + 1} of {pageCount}</span><button disabled={page >= pageCount - 1} onClick={() => setPage((value) => value + 1)}>Next</button></div></div></div></section>
      <section id="saved-inspections" className="saved-section"><div className="section-heading"><div><p className="eyebrow">FIELD INSPECTION WORKLIST</p><h2>Saved Inspection List</h2><span>Consumers selected for follow-up in this browser</span></div><div className="inspection-count"><Icon name="check" size={18} /><span>{inspectionList.size} saved for inspection</span></div></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Consumer</th><th>ML Risk</th><th>Anomaly</th><th>Final Risk</th><th>Priority</th><th aria-label="Action" /></tr></thead><tbody>{savedLoading ? <tr><td colSpan="6" className="empty-state">Loading saved inspection profiles…</td></tr> : savedInspections.length === 0 ? <tr><td colSpan="6" className="empty-state">No consumers have been added yet. Open a consumer profile and choose “Add to Inspection List.”</td></tr> : savedInspections.map((row) => <tr key={row.CONS_NO}><td><div className="consumer-cell"><span title={row.CONS_NO}>{shortId(row.CONS_NO)}</span><button className="copy-icon" title="Copy consumer ID" aria-label="Copy consumer ID" onClick={() => copyId(row.CONS_NO)}><Icon name="copy" size={16} /></button></div></td><td>{asPercent(row.ml_risk_probability)}</td><td>{asPercent(row.anomaly_score)}</td><td><strong>{asPercent(row.final_risk_score)}</strong></td><td><PriorityBadge priority={row.review_priority} /></td><td><div className="saved-actions"><button className="view-button" onClick={() => openCustomer(row.CONS_NO)}>View</button><button className="remove-button" onClick={() => removeFromInspectionList(row.CONS_NO)}>Remove</button></div></td></tr>)}</tbody></table></div></div><p className="saved-note">Saved locally in this browser. It does not change the model, scores, or source dataset.</p></section>
      <section id="consumers" className="consumers-section"><div className="section-heading"><div><p className="eyebrow">CONSUMER DIRECTORY</p><h2>All consumers</h2><span>Search the full eligible consumer population and open a risk profile</span></div><div className="directory-note"><Icon name="users" size={18} />Not an inspection recommendation by itself</div></div><div className="directory-toolbar"><label className="search-box"><Icon name="search" size={19} /><input value={consumerQuery} onChange={(event) => setConsumerQuery(event.target.value)} placeholder="Search Consumer ID" aria-label="Search all consumers" /></label></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Consumer</th><th>Risk Score</th><th>Priority</th><th>Action</th></tr></thead><tbody>{consumerLoading ? <tr><td colSpan="4" className="empty-state">Loading consumer directory…</td></tr> : consumerItems.length === 0 ? <tr><td colSpan="4" className="empty-state">No consumers match this search.</td></tr> : consumerItems.map((row) => <tr key={row.CONS_NO}><td><div className="consumer-cell"><span title={row.CONS_NO}>{shortId(row.CONS_NO)}</span><button className="copy-icon" title="Copy consumer ID" aria-label="Copy consumer ID" onClick={() => copyId(row.CONS_NO)}><Icon name="copy" size={16} /></button></div></td><td><strong>{asPercent(row.final_risk_score)}</strong></td><td><PriorityBadge priority={row.review_priority} /></td><td><button className="view-button" onClick={() => openCustomer(row.CONS_NO)}>View profile <Icon name="arrow" size={16} /></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Showing {consumerTotal ? consumerPage * PAGE_SIZE + 1 : 0}–{Math.min((consumerPage + 1) * PAGE_SIZE, consumerTotal)} of {consumerTotal.toLocaleString()}</span><div><button disabled={consumerPage === 0} onClick={() => setConsumerPage((value) => value - 1)}>Previous</button><span className="page-label">Page {consumerPage + 1} of {consumerPageCount}</span><button disabled={consumerPage >= consumerPageCount - 1} onClick={() => setConsumerPage((value) => value + 1)}>Next</button></div></div></div></section>
      <section id="analytics" className="analytics-section"><div className="section-heading"><div><p className="eyebrow">ANALYTICS</p><h2>Model & priority analytics</h2><span>Signals available from the current model outputs</span></div></div><div className="analytics-grid"><article className="panel"><h3>Priority Distribution</h3><div className="priority-bars">{priorityOrder.map((level) => { const amount = summary?.priority_counts?.[level] || 0; const share = summary?.total_consumers ? amount / summary.total_consumers : 0; return <div className="priority-bar" key={level}><div><PriorityBadge priority={level} /><strong>{amount.toLocaleString()}</strong></div><div className="bar-track"><span className={level.toLowerCase()} style={{ width: `${share * 100}%` }} /></div><small>{(share * 100).toFixed(1)}% of consumers</small></div>; })}</div></article><article className="panel"><h3>Top model risk indicators</h3><p className="small-copy">Global SHAP importance across the explained sample. These indicators contribute to model risk; they do not establish theft.</p><div className="importance-list">{topImportance.map((entry) => <div key={entry.feature} className="importance-row"><div><span>{entry.feature.replaceAll("_", " ")}</span><strong>{entry.mean_abs_shap.toFixed(3)}</strong></div><div className="bar-track"><span className="importance" style={{ width: `${(entry.mean_abs_shap / maxImportance) * 100}%` }} /></div></div>)}</div></article></div><div className="analytics-grid calibration-coverage"><article className="panel"><h3>Probability calibration</h3><p className="small-copy">Held-out temporal-test reliability. The dashed diagonal represents ideal calibration.</p><CalibrationChart bins={calibration?.bins} /><div className="calibration-foot"><strong>Brier score: {calibration?.brier_score?.toFixed(3) ?? "—"}</strong><span>Population-level reliability check</span></div></article><article className="panel coverage-panel"><h3>Data coverage & limitations</h3><ul><li><Icon name="check" size={16} /><span>Historical meter readings, seasonal indicators, and meter-level missingness are included.</span></li><li><Icon name="check" size={16} /><span>Risk ranking, anomaly signals, SHAP indicators, and temporal evaluation are available.</span></li><li><Icon name="info" size={16} /><span>Feeder, neighborhood, region, and inspection-event date fields are not present in this source dataset.</span></li><li><Icon name="info" size={16} /><span>Scores prioritize inspection. They are not a finding of theft or a consumer-level certainty estimate.</span></li></ul></article></div></section>
    </main>
    {(selected || selectedLoading) && <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Consumer profile"><button className="drawer-backdrop" aria-label="Close consumer profile" onClick={() => setSelected(null)} /><aside className="consumer-drawer">{selectedLoading && !selected ? <div className="drawer-loading">Loading consumer profile…</div> : selected && <><div className="drawer-top"><div><p className="eyebrow">CONSUMER PROFILE</p><h2 title={selected.CONS_NO}>{shortId(selected.CONS_NO)}</h2></div><button className="close-button" onClick={() => setSelected(null)} aria-label="Close"><Icon name="close" /></button></div><button className="copy-id-button" onClick={() => copyId(selected.CONS_NO)}><Icon name={copied ? "check" : "copy"} size={16} />{copied ? "Copied" : "Copy Consumer ID"}</button><div className="drawer-priority"><span>INSPECTION PRIORITY</span><PriorityBadge priority={selected.review_priority} /></div><div className="risk-hero"><span>RISK SCORE</span><strong>{asPercent(selected.final_risk_score)}</strong><small>Combined inspection prioritization score</small></div><div className="drawer-score-grid"><div><span>ML RISK</span><strong>{asPercent(selected.ml_risk_probability)}</strong></div><div><span>ANOMALY SIGNAL</span><strong>{asPercent(selected.anomaly_score)}</strong></div></div><section className="signals-section"><h3>Risk Signals</h3><p>Available risk signals</p>{selected.explanation ? <ul className="signal-list">{[1, 2, 3].map((rank) => selected.explanation[`driver_${rank}`] && <li key={rank}><span>{selected.explanation[`driver_${rank}`].replaceAll("_", " ")}</span><strong>+{Number(selected.explanation[`driver_${rank}_shap`]).toFixed(3)}</strong><small>Contributes to model risk</small></li>)}</ul> : <div className="available-signals"><div><span>ML Risk</span><strong>{asPercent(selected.ml_risk_probability)}</strong></div><div><span>Anomaly signal</span><strong>{asPercent(selected.anomaly_score)}</strong></div></div>}</section><section className="consumption-section"><div><h3>Consumption Pattern</h3><p>Reported meter history. Missing readings are not plotted.</p></div>{consumptionLoading ? <div className="history-empty">Loading meter history…</div> : consumption ? <><LineChart points={consumption.points} /><div className="history-summary"><span>{consumption.summary.observed_readings} observed</span><span>{consumption.summary.missing_readings} missing</span><span>Mean {consumption.summary.mean_consumption?.toFixed(2) ?? "—"}</span></div></> : <div className="history-empty">Consumption history is unavailable.</div>}</section><section className="recommendation"><div><Icon name="bolt" size={19} /><div><span>INSPECTION RECOMMENDATION</span><strong>Prioritize this consumer for field inspection</strong></div></div><button className={selectedInList ? "inspection-button added" : "inspection-button"} onClick={() => addToInspectionList(selected.CONS_NO)} disabled={selectedInList}>{selectedInList ? <><Icon name="check" size={17} /> Added to Inspection List</> : "Add to Inspection List"}</button></section></>}</aside></div>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
