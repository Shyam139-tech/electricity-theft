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

## Outputs

- `dataset/processed/evaluation_metrics.json` — held-out temporal metrics
- `dataset/processed/temporal_test_predictions.csv` — temporal evaluation predictions
- `dataset/processed/risk_results.csv` — latest operational inspection queue
- `dataset/processed/customer_explanations.csv` — SHAP explanations (after `python -m src.explain`)
- `models/theft_model_bundle.pkl` — model plus feature schema and preprocessing metadata
