"""Single source of truth for inspection-priority scoring.

These constants are used by the training pipeline (`full_pipeline.py`) when
publishing `risk_results.csv`. The public API does not recompute scores; it
serves those published values.
"""

ML_WEIGHT = 0.70
ANOMALY_WEIGHT = 0.30
HIGH_RISK_THRESHOLD = 0.70
MEDIUM_RISK_THRESHOLD = 0.40

# Named demonstration profiles. Histories are synthetic; scores still come
# from the published LightGBM + IsolationForest artifacts.
DEMO_SCENARIOS = {
    "A": {
        "CONS_NO": "68DD9010B1BC41F2E6F0524FB66C62AC",
        "pattern": "normal",
        "label": "Normal consumption",
    },
    "B": {
        "CONS_NO": "365301A95B5FED7AA6ED1267818F2F6F",
        "pattern": "gradual_decline",
        "label": "Gradual consumption decline while feeder remains stable",
    },
    "C": {
        "CONS_NO": "57531380F73D67943259F07E12498E1A",
        "pattern": "decline_missing_feeder",
        "label": "Abnormal consumption, missing readings, and feeder deviation",
    },
}


def review_priority(score: float) -> str:
    if score >= HIGH_RISK_THRESHOLD:
        return "HIGH"
    if score >= MEDIUM_RISK_THRESHOLD:
        return "MEDIUM"
    return "LOW"


def final_risk_score(ml_risk: float, anomaly_score: float) -> float:
    return ML_WEIGHT * ml_risk + ANOMALY_WEIGHT * anomaly_score
