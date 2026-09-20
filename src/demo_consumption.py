"""Synthetic demonstration meter histories for the inspection dashboard.

This is prototype/demo data. It is not real utility meter data.

Every known CONS_NO gets a deterministic daily series so the existing View
panel can plot consumption. Risk scores (ML Risk, Anomaly Signal, Final Risk,
Priority) are NOT computed here; they stay in `risk_results.csv`.
"""
from __future__ import annotations

import hashlib
from datetime import date, timedelta

import numpy as np
import pandas as pd

from src.risk_config import DEMO_SCENARIOS

HISTORY_DAYS = 150
FEEDERS = [f"FDR-{idx:03d}" for idx in range(101, 109)]
SOURCE_NOTE = (
    "Synthetic demonstration meter history for prototype visualization. "
    "Not real utility readings."
)

_SCENARIO_BY_ID = {item["CONS_NO"]: key for key, item in DEMO_SCENARIOS.items()}


def _seed(cons_no: str) -> int:
    return int(hashlib.sha256(cons_no.encode("utf-8")).hexdigest()[:16], 16) % (2**32)


def _feeder_id(cons_no: str) -> str:
    return FEEDERS[_seed(cons_no + ":feeder") % len(FEEDERS)]


def _dates() -> list[date]:
    end = date(2016, 10, 31)
    start = end - timedelta(days=HISTORY_DAYS - 1)
    return [start + timedelta(days=offset) for offset in range(HISTORY_DAYS)]


def _feeder_baseline(feeder_id: str, n_days: int) -> np.ndarray:
    feeder_seed = _seed(feeder_id)
    rng = np.random.default_rng(feeder_seed)
    base = 9.5 + (FEEDERS.index(feeder_id) % 5) * 0.7
    seasonal = 1.6 * np.sin(np.linspace(0, 4 * np.pi, n_days) + rng.uniform(0, 1))
    weekly = 0.35 * np.sin(np.linspace(0, n_days / 7 * 2 * np.pi, n_days))
    noise = rng.normal(0, 0.18, n_days)
    return np.clip(base + seasonal + weekly + noise, 3.5, None)


def _pattern_for(cons_no: str, priority: str) -> str:
    if cons_no in _SCENARIO_BY_ID:
        return DEMO_SCENARIOS[_SCENARIO_BY_ID[cons_no]]["pattern"]
    rng = np.random.default_rng(_seed(cons_no + ":pattern"))
    draw = float(rng.random())
    if priority == "HIGH":
        if draw < 0.45:
            return "decline_missing_feeder"
        if draw < 0.75:
            return "gradual_decline"
        if draw < 0.90:
            return "volatile_missing"
        return "feeder_deviation"
    if priority == "MEDIUM":
        if draw < 0.40:
            return "gradual_decline"
        if draw < 0.65:
            return "feeder_deviation"
        if draw < 0.80:
            return "volatile_missing"
        return "mild_seasonal"
    if draw < 0.08:
        return "mild_seasonal"
    return "normal"


def build_series(cons_no: str, priority: str = "LOW") -> dict:
    dates = _dates()
    n_days = len(dates)
    feeder_id = _feeder_id(cons_no)
    feeder = _feeder_baseline(feeder_id, n_days)
    rng = np.random.default_rng(_seed(cons_no))
    pattern = _pattern_for(cons_no, priority)
    scale = 0.78 + rng.uniform(0, 0.35)
    series = feeder * scale + rng.normal(0, 0.25, n_days)
    available = np.ones(n_days, dtype=bool)

    if pattern == "normal":
        series = feeder * (0.92 + rng.uniform(0, 0.12)) + rng.normal(0, 0.22, n_days)
    elif pattern == "mild_seasonal":
        series = series + 0.9 * np.sin(np.linspace(0, 2 * np.pi, n_days) + 0.4)
    elif pattern == "gradual_decline":
        decline = np.ones(n_days) * 1.08
        start = max(40, n_days // 4)
        decline[start:] = np.linspace(1.08, 0.52, n_days - start)
        series = feeder * decline + rng.normal(0, 0.18, n_days)
        series = series * np.linspace(1.08, 0.58, n_days)
    elif pattern == "feeder_deviation":
        series = feeder * (0.42 + rng.uniform(0, 0.08)) + rng.normal(0, 0.2, n_days)
        series = series * np.linspace(1.0, 0.82, n_days)
    elif pattern == "volatile_missing":
        series = series + rng.normal(0, 1.8, n_days)
        missing = rng.random(n_days) < 0.18
        available = ~missing
    elif pattern == "decline_missing_feeder":
        series = feeder * (0.55 + rng.uniform(0, 0.08)) * np.linspace(1.12, 0.38, n_days)
        series = series + rng.normal(0, 0.35, n_days)
        missing = rng.random(n_days) < 0.22
        available = ~missing

    series = np.clip(series, 0.0, None)
    series = np.where(available, series, np.nan)
    return {
        "cons_no": cons_no,
        "feeder_id": feeder_id,
        "pattern": pattern,
        "dates": dates,
        "consumption": series,
        "feeder": feeder,
        "available": available,
    }


def _safe_div(numerator: float, denominator: float) -> float | None:
    if denominator is None or abs(denominator) < 1e-9 or np.isnan(denominator):
        return None
    if numerator is None or np.isnan(numerator):
        return None
    return float(numerator / denominator)


def compute_features(profile: dict) -> dict:
    values = pd.Series(profile["consumption"], dtype="float64")
    feeder = pd.Series(profile["feeder"], dtype="float64")
    available = pd.Series(profile["available"])
    rolling_mean_7 = values.rolling(7, min_periods=4).mean()
    rolling_mean_30 = values.rolling(30, min_periods=10).mean()
    rolling_std_7 = values.rolling(7, min_periods=4).std()
    rolling_std_30 = values.rolling(30, min_periods=10).std()

    recent_30 = values.iloc[-30:].mean(skipna=True)
    previous_30 = values.iloc[-60:-30].mean(skipna=True)
    consumption_change_30d = _safe_div(recent_30 - previous_30, previous_30)

    observed_idx = np.where(available.to_numpy())[0]
    observed_vals = values.to_numpy()[available.to_numpy()]
    if observed_idx.size >= 8:
        slope = float(np.polyfit(observed_idx.astype(float), observed_vals.astype(float), 1)[0])
    else:
        slope = None

    consumer_mean = float(values.mean(skipna=True)) if values.notna().any() else None
    feeder_mean = float(feeder.mean())
    feeder_deviation = _safe_div(consumer_mean, feeder_mean)
    missing_ratio = float((~available).mean())
    seasonal_deviation = None
    if consumer_mean is not None:
        seasonal_deviation = float(np.nanmean(np.abs(values.to_numpy() - feeder.to_numpy())) / (feeder_mean + 1e-9))

    return {
        "rolling_mean_7": None if pd.isna(rolling_mean_7.iloc[-1]) else float(rolling_mean_7.iloc[-1]),
        "rolling_mean_30": None if pd.isna(rolling_mean_30.iloc[-1]) else float(rolling_mean_30.iloc[-1]),
        "rolling_std_7": None if pd.isna(rolling_std_7.iloc[-1]) else float(rolling_std_7.iloc[-1]),
        "rolling_std_30": None if pd.isna(rolling_std_30.iloc[-1]) else float(rolling_std_30.iloc[-1]),
        "consumption_change_30d": consumption_change_30d,
        "trend": slope,
        "feeder_average": feeder_mean,
        "feeder_deviation": feeder_deviation,
        "missing_ratio": missing_ratio,
        "seasonal_deviation": seasonal_deviation,
        "consumer_mean": consumer_mean,
    }


def risk_factors_from_features(features: dict) -> list[dict]:
    """Return only factors the meter history actually supports."""
    factors = []
    change = features.get("consumption_change_30d")
    trend = features.get("trend")
    if change is not None and change <= -0.18 and trend is not None and trend < 0:
        factors.append({
            "label": "Long-term consumption decline",
            "evidence": f"{change:.0%} over 30 days vs prior window",
        })

    feeder_deviation = features.get("feeder_deviation")
    if feeder_deviation is not None and abs(feeder_deviation - 1.0) >= 0.25:
        factors.append({
            "label": "Consumption deviates from feeder pattern",
            "evidence": f"Consumer mean is {feeder_deviation:.2f}× feeder average",
        })

    missing_ratio = features.get("missing_ratio") or 0.0
    if missing_ratio >= 0.12:
        factors.append({
            "label": "Increased missing readings",
            "evidence": f"{missing_ratio:.0%} of daily readings unavailable",
        })

    seasonal = features.get("seasonal_deviation")
    if seasonal is not None and seasonal >= 0.35 and not any(
        item["label"] == "Consumption deviates from feeder pattern" for item in factors
    ):
        factors.append({
            "label": "Deviation from seasonal baseline",
            "evidence": f"Mean absolute gap vs feeder is {seasonal:.0%} of feeder load",
        })

    std7 = features.get("rolling_std_7")
    mean7 = features.get("rolling_mean_7")
    if std7 is not None and mean7 not in (None, 0) and (std7 / (abs(mean7) + 1e-9)) >= 0.45:
        factors.append({
            "label": "Unusual consumption volatility",
            "evidence": f"7-day std is {std7 / (abs(mean7) + 1e-9):.0%} of 7-day mean",
        })
    return factors


def serialize_profile(profile: dict, features: dict) -> dict:
    points = []
    feeder_points = []
    for day, value, feeder_value, available in zip(
        profile["dates"], profile["consumption"], profile["feeder"], profile["available"]
    ):
        iso = day.isoformat()
        points.append({"date": iso, "value": None if not available or np.isnan(value) else float(value)})
        feeder_points.append({"date": iso, "value": float(feeder_value)})
    observed = [point["value"] for point in points if point["value"] is not None]
    return {
        "consumer_id": profile["cons_no"],
        "feeder_id": profile["feeder_id"],
        "source": "synthetic-demo",
        "source_note": SOURCE_NOTE,
        "points": points,
        "feeder_points": feeder_points,
        "features": features,
        "risk_factors": risk_factors_from_features(features),
        "summary": {
            "total_readings": len(points),
            "observed_readings": len(observed),
            "missing_readings": len(points) - len(observed),
            "mean_consumption": None if not observed else float(np.mean(observed)),
        },
    }


def consumer_history(cons_no: str, priority: str = "LOW") -> dict:
    profile = build_series(cons_no, priority)
    features = compute_features(profile)
    return serialize_profile(profile, features)
