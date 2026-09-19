import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)


ID_COL = "CONS_NO"
TARGET_COL = "FLAG"


def get_consumption_columns(df: pd.DataFrame) -> tuple[list[str], pd.Series]:
    """Return only columns whose names are valid observation dates."""
    candidate_columns = [c for c in df.columns if c not in {ID_COL, TARGET_COL}]
    dates = pd.Series(pd.to_datetime(candidate_columns, errors="coerce"), index=candidate_columns)
    valid = dates[dates.notna()].sort_values()
    if valid.empty:
        raise ValueError("No dated consumption columns were found.")
    return valid.index.tolist(), valid


def build_features(df: pd.DataFrame, cutoff_date: pd.Timestamp, lookback_days: int = 365) -> pd.DataFrame:
    """Build the project's existing feature set using data available at a cutoff."""
    _, dates = get_consumption_columns(df)
    start_date = cutoff_date - pd.Timedelta(days=lookback_days)
    selected = dates[(dates <= cutoff_date) & (dates > start_date)].index.tolist()
    if not selected:
        raise ValueError(f"No consumption readings exist before {cutoff_date.date()}.")

    consumption = df[selected].apply(pd.to_numeric, errors="coerce")
    features = pd.DataFrame({ID_COL: df[ID_COL], TARGET_COL: df[TARGET_COL]})

    features["mean_consumption"] = consumption.mean(axis=1)
    features["median_consumption"] = consumption.median(axis=1)
    features["std_consumption"] = consumption.std(axis=1)
    features["min_consumption"] = consumption.min(axis=1)
    features["max_consumption"] = consumption.max(axis=1)
    features["missing_rate"] = consumption.isna().mean(axis=1)
    features["missing_count"] = consumption.isna().sum(axis=1)
    features["zero_rate"] = (consumption == 0).sum(axis=1) / consumption.notna().sum(axis=1).replace(0, 1)

    comparison_days = min(90, max(1, consumption.shape[1] // 3))
    early = consumption.iloc[:, :comparison_days]
    recent = consumption.iloc[:, -comparison_days:]
    features["early_mean"] = early.mean(axis=1)
    features["recent_mean"] = recent.mean(axis=1)
    features["consumption_change"] = (features["recent_mean"] - features["early_mean"]) / (features["early_mean"].abs() + 1e-6)

    mid = consumption.shape[1] // 2
    first_half = consumption.iloc[:, :mid]
    second_half = consumption.iloc[:, mid:]
    features["first_half_mean"] = first_half.mean(axis=1)
    features["second_half_mean"] = second_half.mean(axis=1)
    features["long_term_change"] = (features["second_half_mean"] - features["first_half_mean"]) / (features["first_half_mean"].abs() + 1e-6)

    for month in range(1, 13):
        month_columns = [column for column in selected if dates[column].month == month]
        features[f"month_{month}_mean"] = consumption[month_columns].mean(axis=1) if month_columns else np.nan

    monthly_columns = [f"month_{month}_mean" for month in range(1, 13)]
    features["seasonal_std"] = features[monthly_columns].std(axis=1)
    return features.replace([np.inf, -np.inf], np.nan)


def feature_columns(features: pd.DataFrame) -> list[str]:
    return [c for c in features.columns if c not in {ID_COL, TARGET_COL}]


def apply_imputation(features: pd.DataFrame, columns: list[str], medians: pd.Series) -> pd.DataFrame:
    result = features.copy()
    result[columns] = result[columns].fillna(medians).fillna(0)
    return result


def top_k_metrics(y_true, probabilities, k_values=(100, 500, 1000)) -> dict:
    result = {}
    ranked = pd.DataFrame({"actual": np.asarray(y_true), "score": probabilities}).sort_values("score", ascending=False)
    positives = max(int(ranked["actual"].sum()), 1)
    for requested_k in k_values:
        k = min(requested_k, len(ranked))
        top_k = ranked.head(k)
        result[f"precision_at_{requested_k}"] = float(top_k["actual"].mean())
        result[f"recall_at_{requested_k}"] = float(top_k["actual"].sum() / positives)
    return result


def evaluate_binary(y_true, probabilities, threshold: float = 0.5) -> dict:
    predictions = (np.asarray(probabilities) >= threshold).astype(int)
    metrics = {
        "threshold": threshold,
        "roc_auc": float(roc_auc_score(y_true, probabilities)),
        "pr_auc": float(average_precision_score(y_true, probabilities)),
        "brier_score": float(brier_score_loss(y_true, probabilities)),
        "precision": float(precision_score(y_true, predictions, zero_division=0)),
        "recall": float(recall_score(y_true, predictions, zero_division=0)),
    }
    metrics.update(top_k_metrics(y_true, probabilities))
    return metrics


def calibration_assessment(y_true, probabilities, n_bins: int = 10) -> dict:
    """Summarize temporal-test probability calibration without changing scores."""
    observed_rate, mean_prediction = calibration_curve(
        y_true, probabilities, n_bins=n_bins, strategy="quantile"
    )
    return {
        "brier_score": float(brier_score_loss(y_true, probabilities)),
        "bins": [
            {
                "mean_predicted_risk": float(prediction),
                "observed_positive_rate": float(observed),
            }
            for prediction, observed in zip(mean_prediction, observed_rate)
        ],
        "note": "Calibration is assessed on the held-out temporal test snapshot. It is a population-level reliability check, not a consumer-level certainty estimate.",
    }


def write_json(path: str | Path, payload: dict) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(payload, indent=2), encoding="utf-8")
