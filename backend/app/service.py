import json
from functools import lru_cache
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "dataset" / "processed"
RAW_DATA = ROOT / "dataset" / "data" / "data.csv"
ID_COL = "CONS_NO"
TARGET_COL = "FLAG"
PUBLIC_RISK_COLUMNS = [
    ID_COL,
    "ml_risk_probability",
    "anomaly_score",
    "final_risk_score",
    "review_priority",
]
REQUIRED_ARTIFACTS = (
    "risk_results.csv",
    "customer_explanations.csv",
    "evaluation_metrics.json",
    "calibration_assessment.json",
    "shap_global_importance.csv",
)


@lru_cache(maxsize=32)
def read_consumer_consumption(cons_no: str) -> dict | None:
    """Read just one consumer's raw history on demand and cache the small response."""
    if not RAW_DATA.exists():
        return None

    matched_row = None
    for chunk in pd.read_csv(RAW_DATA, chunksize=5000, dtype={ID_COL: "string"}):
        match = chunk.loc[chunk[ID_COL].astype(str) == cons_no]
        if not match.empty:
            matched_row = match.iloc[0]
            break

    if matched_row is None:
        return None

    date_columns = [column for column in matched_row.index if column not in {ID_COL, TARGET_COL}]
    parsed_dates = pd.to_datetime(date_columns, errors="coerce")
    dated_columns = [column for column, date in zip(date_columns, parsed_dates) if pd.notna(date)]
    dated_columns.sort(key=lambda column: pd.Timestamp(column))
    readings = pd.to_numeric(matched_row[dated_columns], errors="coerce")
    points = [
        {
            "date": pd.Timestamp(column).date().isoformat(),
            "value": None if pd.isna(value) else float(value),
        }
        for column, value in readings.items()
    ]
    observed = readings.dropna()
    return {
        "consumer_id": cons_no,
        "points": points,
        "summary": {
            "total_readings": len(points),
            "observed_readings": int(observed.size),
            "missing_readings": int(readings.isna().sum()),
            "mean_consumption": None if observed.empty else float(observed.mean()),
        },
    }


class RiskRepository:
    def __init__(self):
        self.risk = pd.DataFrame()
        self.explanations = pd.DataFrame()
        self.metrics = {}
        self.calibration = {}
        self.importance = pd.DataFrame()

    def load(self):
        missing = [name for name in REQUIRED_ARTIFACTS if not (PROCESSED / name).is_file()]
        if missing:
            raise RuntimeError(
                "Missing required precomputed API artifacts: " + ", ".join(missing)
            )

        self.risk = pd.read_csv(PROCESSED / "risk_results.csv").sort_values(
            "final_risk_score", ascending=False
        ).reset_index(drop=True)
        self.metrics = json.loads(
            (PROCESSED / "evaluation_metrics.json").read_text(encoding="utf-8")
        )
        self.calibration = json.loads(
            (PROCESSED / "calibration_assessment.json").read_text(encoding="utf-8")
        )
        self.explanations = pd.read_csv(PROCESSED / "customer_explanations.csv")
        self.importance = pd.read_csv(PROCESSED / "shap_global_importance.csv")

    def summary(self):
        counts = self.risk["review_priority"].value_counts().to_dict()
        return {"total_consumers": len(self.risk), "priority_counts": counts}

    def public_risk_records(self, rows: pd.DataFrame) -> list[dict]:
        """Serialize model outputs without exposing the source training label."""
        available_columns = [column for column in PUBLIC_RISK_COLUMNS if column in rows.columns]
        return rows[available_columns].to_dict(orient="records")

    def public_explanation(self, cons_no: str) -> dict | None:
        if self.explanations.empty:
            return None
        explanation = self.explanations[self.explanations[ID_COL].astype(str) == cons_no]
        if explanation.empty:
            return None
        row = explanation.iloc[0]
        driver_columns = [
            column for column in row.index
            if column.startswith("driver_")
        ]
        return {column: row[column] for column in driver_columns}


repository = RiskRepository()
