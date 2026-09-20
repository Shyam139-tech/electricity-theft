# Electricity Theft Risk Pipeline

## Run the model pipeline

Keep the raw file at `dataset/data/data.csv` and run:

```powershell
python full_pipeline.py
python -m src.explain
```

`full_pipeline.py` reads the raw CSV locally, creates temporal train/validation/test snapshots from its actual date columns, and writes compact results to `dataset/processed`. It does not upload the raw CSV.

## Start the API

```powershell
pip install -r requirements.txt
uvicorn backend.app.main:app --reload
```

The API is available at `http://localhost:8000/docs`. It only loads processed risk, metrics, and SHAP files.

## Start the dashboard

```powershell
cd dashboard
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). To use another API URL, set `VITE_API_URL` before starting Vite.

## Feeder mapping

Optional verified utility metadata can be supplied as `dataset/feeder_mapping.csv`:

```csv
CONS_NO,FEEDER_ID,TRANSFORMER_ID,AREA
```

`CONS_NO` and `FEEDER_ID` are required; `TRANSFORMER_ID` and `AREA` are optional. Use `dataset/feeder_mapping.example.csv` as an empty format template. The raw consumption dataset has no feeder IDs, so mappings must come from a verified utility/data source. Without that file (or for an unmapped consumer), the dashboard explicitly reports that feeder mapping is unavailable. Feeder context is supporting evidence only; it does not change published ML, anomaly, final-risk, or priority values.

## Outputs

- `dataset/processed/evaluation_metrics.json` — held-out temporal metrics
- `dataset/processed/temporal_test_predictions.csv` — temporal evaluation predictions
- `dataset/processed/risk_results.csv` — latest operational inspection queue
- `dataset/processed/customer_explanations.csv` — SHAP explanations (after `python -m src.explain`)
- `models/theft_model_bundle.pkl` — model plus feature schema and preprocessing metadata

## Evaluation and limitations

The published evaluation uses temporal snapshots: training through 2015-09-12, validation through 2016-04-06, and a held-out test snapshot through 2016-10-31. Current artifacts report ROC-AUC 0.713, PR-AUC 0.237, precision@100 0.700, recall@100 0.019, and Brier score 0.150.

Because `FLAG` is static per consumer, the temporal evaluation validates feature availability over time rather than dated theft events. Calibration is a population-level reliability check, not a consumer-level certainty estimate. The system prioritizes inspections and does not confirm theft.

The source data contains no verified feeder, transformer, neighborhood, region, or inspection-event metadata. Feeder context remains unavailable unless a verified `dataset/feeder_mapping.csv` is supplied; no feeder statistics or infrastructure identifiers are fabricated.
