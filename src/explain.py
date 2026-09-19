"""Generate bounded SHAP artifacts from existing compact feature data."""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from src.pipeline_utils import ID_COL

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "dataset" / "processed"
bundle = joblib.load(ROOT / "models" / "theft_model_bundle.pkl")

try:
    import shap
except ImportError as error:
    raise SystemExit("Install SHAP first: pip install shap matplotlib") from error

features = pd.read_csv(PROCESSED / "ml_features.csv")
risk = pd.read_csv(PROCESSED / "risk_results.csv")
columns = bundle["feature_columns"]
sample = features.sample(n=min(2000, len(features)), random_state=42)
explainer = shap.TreeExplainer(bundle["model"])
values = explainer.shap_values(sample[columns])
if isinstance(values, list):
    values = values[-1]
values = np.asarray(values)

importance = pd.DataFrame({"feature": columns, "mean_abs_shap": np.abs(values).mean(axis=0)})
importance.sort_values("mean_abs_shap", ascending=False).to_csv(PROCESSED / "shap_global_importance.csv", index=False)

top_rows = []
for position, (_, row) in enumerate(sample.iterrows()):
    top = np.argsort(values[position])[-3:][::-1]
    item = {ID_COL: row[ID_COL]}
    for rank, feature_index in enumerate(top, start=1):
        item[f"driver_{rank}"] = columns[feature_index]
        item[f"driver_{rank}_shap"] = float(values[position, feature_index])
    top_rows.append(item)
pd.DataFrame(top_rows).merge(risk, on=ID_COL, how="left").to_csv(PROCESSED / "customer_explanations.csv", index=False)

import matplotlib.pyplot as plt
shap.summary_plot(values, sample[columns], show=False, max_display=15)
plt.tight_layout()
plt.savefig(PROCESSED / "shap_summary.png", dpi=160, bbox_inches="tight")
plt.close()
print("Saved SHAP artifacts to", PROCESSED)
