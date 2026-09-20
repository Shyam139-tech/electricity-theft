import json
import logging
from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "dataset" / "processed"
RAW_DATA = ROOT / "dataset" / "data" / "data.csv"
DEPLOYED_RAW_DATA = PROCESSED / "consumption_data.zip"
FEEDER_MAPPING = ROOT / "dataset" / "feeder_mapping.csv"
ID_COL = "CONS_NO"
LOGGER = logging.getLogger(__name__)
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


class RiskRepository:
    def __init__(self):
        self.risk = pd.DataFrame()
        self.explanations = pd.DataFrame()
        self.metrics = {}
        self.calibration = {}
        self.importance = pd.DataFrame()
        self.mapping = pd.DataFrame(columns=[ID_COL, "FEEDER_ID", "TRANSFORMER_ID", "AREA"])
        self.mapping_available = False
        self._raw = None
        self._reading_columns = []
        self._feeder_profiles = {}

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
        self.risk[ID_COL] = self.risk[ID_COL].map(self._normalise_id)
        self._load_mapping()

    @staticmethod
    def _normalise_id(value) -> str:
        return str(value).strip()

    def _load_mapping(self):
        """Load verified feeder metadata once; invalid rows are ignored safely."""
        self.mapping = pd.DataFrame(columns=[ID_COL, "FEEDER_ID", "TRANSFORMER_ID", "AREA"])
        self.mapping_available = False
        if not FEEDER_MAPPING.is_file():
            LOGGER.info("Feeder mapping unavailable: %s was not supplied.", FEEDER_MAPPING.name)
            return
        try:
            mapping = pd.read_csv(FEEDER_MAPPING, dtype=str, keep_default_na=False)
        except Exception as error:
            LOGGER.warning("Feeder mapping unavailable: could not read %s (%s).", FEEDER_MAPPING.name, error)
            return

        required = {ID_COL, "FEEDER_ID"}
        missing = required.difference(mapping.columns)
        if missing:
            LOGGER.warning("Feeder mapping unavailable: missing required columns: %s.", ", ".join(sorted(missing)))
            return

        for column in [ID_COL, "FEEDER_ID", "TRANSFORMER_ID", "AREA"]:
            if column not in mapping.columns:
                mapping[column] = ""
            mapping[column] = mapping[column].map(self._normalise_id)
        duplicate_count = int(mapping[ID_COL].duplicated(keep="first").sum())
        blank_id = mapping[ID_COL].eq("")
        blank_feeder = mapping["FEEDER_ID"].eq("")
        invalid_count = int((blank_id | blank_feeder).sum())
        mapping = mapping.loc[~blank_id & ~blank_feeder].drop_duplicates(ID_COL, keep="first")

        # Both checks are intentionally aggregate-only: no consumer identifiers are logged.
        raw_ids = self._raw_consumer_ids()
        risk_ids = set(self.risk[ID_COL])
        absent_raw = int((~mapping[ID_COL].isin(raw_ids)).sum())
        absent_risk = int((~mapping[ID_COL].isin(risk_ids)).sum())
        mapping = mapping.loc[mapping[ID_COL].isin(raw_ids) & mapping[ID_COL].isin(risk_ids)].copy()
        self.mapping = mapping[[ID_COL, "FEEDER_ID", "TRANSFORMER_ID", "AREA"]]
        self.mapping_available = not self.mapping.empty
        LOGGER.info(
            "Feeder mapping loaded: mapped consumers=%d, unmapped consumers=%d, duplicate mappings=%d, invalid mappings=%d, absent from raw=%d, absent from risk=%d.",
            len(self.mapping), len(self.risk) - len(self.mapping), duplicate_count, invalid_count, absent_raw, absent_risk,
        )

    @lru_cache(maxsize=1)
    def _raw_consumer_ids(self) -> set[str]:
        data_path = RAW_DATA if RAW_DATA.is_file() else DEPLOYED_RAW_DATA
        if not data_path.is_file():
            LOGGER.warning("Raw meter data unavailable: neither %s nor %s was found.", RAW_DATA, DEPLOYED_RAW_DATA)
            return set()
        ids = pd.read_csv(data_path, usecols=[ID_COL], dtype={ID_COL: str}, compression="zip" if data_path == DEPLOYED_RAW_DATA else "infer")[ID_COL]
        return set(ids.map(self._normalise_id))

    def _ensure_raw(self):
        """Cache the raw readings once on first history request, never in the browser."""
        if self._raw is not None:
            return
        data_path = RAW_DATA if RAW_DATA.is_file() else DEPLOYED_RAW_DATA
        if not data_path.is_file():
            raise RuntimeError("Raw meter data is unavailable.")
        raw = pd.read_csv(data_path, dtype={ID_COL: str}, compression="zip" if data_path == DEPLOYED_RAW_DATA else "infer")
        raw[ID_COL] = raw[ID_COL].map(self._normalise_id)
        self._reading_columns = [
            column for column in raw.columns
            if column != ID_COL and column != "FLAG" and not pd.isna(pd.to_datetime(column, errors="coerce"))
        ]
        self._reading_columns.sort(key=lambda column: pd.to_datetime(column))
        self._raw = raw.set_index(ID_COL, drop=False)
        self._build_feeder_profiles()

    def _build_feeder_profiles(self):
        self._feeder_profiles = {}
        if not self.mapping_available or self._raw is None:
            return
        mapped = self.mapping[self.mapping[ID_COL].isin(self._raw.index)].copy()
        for feeder_id, group in mapped.groupby("FEEDER_ID", sort=False):
            ids = group[ID_COL].tolist()
            readings = self._raw.loc[ids, self._reading_columns].apply(pd.to_numeric, errors="coerce")
            self._feeder_profiles[feeder_id] = {
                "consumer_count": len(ids),
                "by_date": readings.mean(axis=0),
                "average_consumption": float(readings.stack().mean()) if readings.notna().any().any() else None,
            }

    def _feeder_context(self, cons_no: str, values: pd.Series | None = None) -> dict:
        blank = {"feeder_id": None, "transformer_id": None, "area": None, "mapping_available": False}
        if not self.mapping_available:
            return blank
        match = self.mapping[self.mapping[ID_COL] == cons_no]
        if match.empty:
            return blank
        row = match.iloc[0]
        context = {
            "feeder_id": row["FEEDER_ID"],
            "transformer_id": row["TRANSFORMER_ID"] or None,
            "area": row["AREA"] or None,
            "mapping_available": True,
        }
        profile = self._feeder_profiles.get(row["FEEDER_ID"])
        if profile and values is not None:
            consumer_average = float(values.mean()) if values.notna().any() else None
            feeder_average = profile["average_consumption"]
            deviation = None if consumer_average is None or feeder_average in (None, 0) else ((consumer_average - feeder_average) / feeder_average) * 100
            context.update({
                "consumer_count": profile["consumer_count"],
                "consumer_average": consumer_average,
                "feeder_average": feeder_average,
                "deviation_percent": deviation,
            })
        return context

    @staticmethod
    def _risk_factors(values: pd.Series, feeder: dict) -> list[dict]:
        """Evidence labels calculated only from this consumer's actual readings."""
        factors = []
        observed = values.dropna()
        if observed.empty:
            return factors
        missing_rate = 1 - (len(observed) / len(values))
        if missing_rate >= 0.12:
            factors.append({"label": "Increased missing readings", "evidence": f"{missing_rate:.0%} of readings are unavailable"})
        window = max(1, len(values) // 3)
        early, recent = values.iloc[:window].mean(), values.iloc[-window:].mean()
        if pd.notna(early) and abs(early) > 1e-9 and pd.notna(recent):
            change = (recent - early) / abs(early)
            if change <= -0.18:
                factors.append({"label": "Long-term consumption decline", "evidence": f"{change:.0%} versus the earlier observation window"})
        mean, std = observed.mean(), observed.std()
        if pd.notna(std) and abs(mean) > 1e-9 and std / abs(mean) >= 0.45:
            factors.append({"label": "Unusual consumption variability", "evidence": f"Variation is {std / abs(mean):.0%} of average consumption"})
        deviation = feeder.get("deviation_percent")
        if deviation is not None and deviation <= -25:
            factors.append({"label": "Consumption is below the feeder-level pattern", "evidence": f"{deviation:.1f}% below the feeder average; requires field verification"})
        return factors

    def summary(self):
        counts = self.risk["review_priority"].value_counts().to_dict()
        return {"total_consumers": len(self.risk), "priority_counts": counts}

    def public_risk_records(self, rows: pd.DataFrame) -> list[dict]:
        """Serialize model outputs without exposing the source training label."""
        available_columns = [column for column in PUBLIC_RISK_COLUMNS if column in rows.columns]
        return rows[available_columns].to_dict(orient="records")

    def consumption_payload(self, cons_no: str) -> dict | None:
        record = self.risk[self.risk[ID_COL].astype(str) == cons_no]
        if record.empty:
            return None
        self._ensure_raw()
        if cons_no not in self._raw.index:
            return None
        values = pd.to_numeric(self._raw.loc[cons_no, self._reading_columns], errors="coerce")
        feeder = self._feeder_context(cons_no, values)
        profile = self._feeder_profiles.get(feeder["feeder_id"])
        feeder_values = profile["by_date"] if profile else None
        points = [{
            "date": str(pd.to_datetime(column).date()),
            "value": None if pd.isna(value) else float(value),
            "reading_available": not pd.isna(value),
        } for column, value in values.items()]
        if points:
            points[0]["feeder_context"] = feeder
        feeder_points = [] if feeder_values is None else [
            {"date": str(pd.to_datetime(column).date()), "value": None if pd.isna(value) else float(value)}
            for column, value in feeder_values.items()
        ]
        observed = int(values.notna().sum())
        return {
            "consumer_id": cons_no,
            "source": "raw-meter-data",
            "points": points,
            "feeder_points": feeder_points,
            "feeder": feeder,
            "risk_factors": self._risk_factors(values, feeder),
            "summary": {
                "total_readings": len(values), "observed_readings": observed,
                "missing_readings": len(values) - observed,
                "mean_consumption": None if not observed else float(values.mean()),
            },
        }

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
