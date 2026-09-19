"""Train, temporally validate, and publish the electricity-theft risk model."""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.ensemble import IsolationForest

from src.pipeline_utils import (
    ID_COL, TARGET_COL, apply_imputation, build_features, calibration_assessment, evaluate_binary,
    feature_columns, get_consumption_columns, write_json,
)

INPUT_FILE = "dataset/data/data.csv"
OUTPUT_DIR = Path("dataset/processed")
MODEL_DIR = Path("models")
LOOKBACK_DAYS = 365
RANDOM_STATE = 42
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)


def make_model():
    return LGBMClassifier(
        objective="binary", n_estimators=500, learning_rate=0.03,
        num_leaves=31, max_depth=-1, subsample=0.8, colsample_bytree=0.8,
        class_weight="balanced", random_state=RANDOM_STATE, n_jobs=-1,
    )


def priority(score):
    return "HIGH" if score >= 0.70 else "MEDIUM" if score >= 0.40 else "LOW"


def select_threshold(y_true, probabilities):
    """Validation F1 threshold; replace with an inspection-capacity rule if known."""
    candidates = np.arange(0.10, 0.91, 0.05)
    scored = []
    for threshold in candidates:
        values = evaluate_binary(y_true, probabilities, threshold)
        f1 = 2 * values["precision"] * values["recall"] / (values["precision"] + values["recall"] + 1e-12)
        scored.append((f1, threshold))
    return max(scored)[1]


print("Loading raw data...")
df = pd.read_csv(INPUT_FILE).drop_duplicates().copy()
if not {ID_COL, TARGET_COL}.issubset(df.columns):
    raise ValueError(f"Expected {ID_COL} and {TARGET_COL} columns.")
df[TARGET_COL] = pd.to_numeric(df[TARGET_COL], errors="raise").astype(int)

_, dated_columns = get_consumption_columns(df)
all_dates = dated_columns.sort_values()
if len(all_dates) < 30:
    raise ValueError("At least 30 dated readings are required for temporal validation.")

# Derived from real columns, so no calendar dates are invented.
train_cutoff = all_dates.iloc[int((len(all_dates) - 1) * 0.60)]
validation_cutoff = all_dates.iloc[int((len(all_dates) - 1) * 0.80)]
test_cutoff = all_dates.iloc[-1]
print(f"Cutoffs: train={train_cutoff.date()}, validation={validation_cutoff.date()}, test={test_cutoff.date()}")

train_raw = build_features(df, train_cutoff, LOOKBACK_DAYS)
validation_raw = build_features(df, validation_cutoff, LOOKBACK_DAYS)
test_raw = build_features(df, test_cutoff, LOOKBACK_DAYS)
columns = feature_columns(train_raw)

# Fit imputation only on data available at the training cutoff.
train_medians = train_raw[columns].median()
train_features = apply_imputation(train_raw, columns, train_medians)
validation_features = apply_imputation(validation_raw, columns, train_medians)
test_features = apply_imputation(test_raw, columns, train_medians)

model = make_model()
model.fit(train_features[columns], train_features[TARGET_COL])
validation_probability = model.predict_proba(validation_features[columns])[:, 1]
threshold = select_threshold(validation_features[TARGET_COL], validation_probability)
test_probability = model.predict_proba(test_features[columns])[:, 1]
metrics = evaluate_binary(test_features[TARGET_COL], test_probability, threshold)
metrics.update({
    "training_cutoff": str(train_cutoff.date()),
    "validation_cutoff": str(validation_cutoff.date()),
    "test_cutoff": str(test_cutoff.date()),
    "lookback_days": LOOKBACK_DAYS,
    "evaluation_note": "FLAG is static per consumer; this validates feature availability over time.",
})
write_json(OUTPUT_DIR / "evaluation_metrics.json", metrics)
write_json(
    OUTPUT_DIR / "calibration_assessment.json",
    calibration_assessment(test_features[TARGET_COL], test_probability),
)

test_predictions = test_features[[ID_COL, TARGET_COL]].copy()
test_predictions["risk_probability"] = test_probability
test_predictions["prediction"] = (test_probability >= threshold).astype(int)
test_predictions.sort_values("risk_probability", ascending=False).to_csv(OUTPUT_DIR / "temporal_test_predictions.csv", index=False)
print("Temporal test metrics:", metrics)

# Refit on latest available snapshot for the production inspection queue.
production_medians = test_raw[columns].median()
production_features = apply_imputation(test_raw, columns, production_medians)
production_model = make_model()
production_model.fit(production_features[columns], production_features[TARGET_COL])

anomaly_features = ["mean_consumption", "std_consumption", "missing_rate", "consumption_change", "long_term_change", "seasonal_std"]
iso = IsolationForest(n_estimators=200, contamination=0.08, random_state=RANDOM_STATE, n_jobs=-1)
iso.fit(production_features[anomaly_features])
raw_anomaly = -iso.score_samples(production_features[anomaly_features])
anomaly_score = (raw_anomaly - raw_anomaly.min()) / (raw_anomaly.max() - raw_anomaly.min() + 1e-9)
ml_probability = production_model.predict_proba(production_features[columns])[:, 1]

published = production_features[[ID_COL, TARGET_COL]].copy()
published["ml_risk_probability"] = ml_probability
published["anomaly_score"] = anomaly_score
published["final_risk_score"] = 0.70 * ml_probability + 0.30 * anomaly_score
published["review_priority"] = published["final_risk_score"].map(priority)
published.sort_values("final_risk_score", ascending=False).to_csv(OUTPUT_DIR / "risk_results.csv", index=False)
production_features.to_csv(OUTPUT_DIR / "ml_features.csv", index=False)

bundle = {
    "model": production_model, "feature_columns": columns,
    "imputation_medians": production_medians.to_dict(), "threshold": threshold,
    "model_version": "temporal-v1", "training_cutoff": str(test_cutoff.date()),
    "lookback_days": LOOKBACK_DAYS,
}
joblib.dump(bundle, MODEL_DIR / "theft_model_bundle.pkl")
joblib.dump(production_model, MODEL_DIR / "lightgbm_theft_model.pkl")
print("Pipeline complete. Compact API artifacts are in dataset/processed.")
