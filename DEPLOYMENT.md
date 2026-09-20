# Public Hackathon Deployment

This repository deploys the existing dashboard as a static Vercel site and the existing read-only FastAPI service as a Render web service. It serves precomputed outputs only; it does not retrain, score new consumers, or upload raw meter data.

## A. What gets deployed

Commit these compact artifacts because the public API reads them at startup:

```text
dataset/processed/risk_results.csv
dataset/processed/customer_explanations.csv
dataset/processed/evaluation_metrics.json
dataset/processed/calibration_assessment.json
dataset/processed/shap_global_importance.csv
```

Also commit `backend/`, `dashboard/`, `src/`, `render.yaml`, `.python-version`, `.gitignore`, and this guide. The frontend calls only the API; it never downloads any CSV directly.

## B. What stays local

Do not commit or deploy the following:

```text
dataset/data/data.csv
dataset/data.z01
dataset/data.z02
dataset/processed/electricity_cleaned.csv
dataset/processed/ml_features.csv
dataset/processed/temporal_test_predictions.csv
dataset/processed/shap_summary.png
models/
```

The real historical consumption chart requires `dataset/data/data.csv`, which remains local-only. The public deployment serves the compact risk and explanation artifacts, but it must not claim to provide live or verified feeder consumption evidence without the raw meter dataset and an approved utility mapping. ML Risk, Anomaly Signal, Final Risk, and Priority come from the five compact artifacts above.

The source dataset does not provide verified feeder IDs, transformer IDs, neighborhood or region fields, or inspection-event dates. The dashboard reports feeder mapping as unavailable unless `dataset/feeder_mapping.csv` is supplied from a verified utility source. Historical meter readings end on the dataset's final observation date; they are not current usage.

## C. Frontend deployment: Vercel

1. Push the repository to GitHub. Before the first commit, confirm the large files are ignored:

   ```powershell
   git check-ignore -v dataset/data/data.csv dataset/data.z01 dataset/data.z02 dataset/processed/ml_features.csv models/lightgbm_theft_model.pkl
   ```

2. In Vercel, import the GitHub repository.
3. Set **Root Directory** to `dashboard`.
4. Vercel reads `dashboard/vercel.json` and uses:

   ```text
   Install: npm ci
   Build: npm run build
   Output: dist
   ```

5. In **Settings -> Environment Variables**, add this for Production (and Preview if needed):

   ```text
   VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
   ```

   Do not add a trailing slash. `VITE_API_URL` is a public browser configuration value, not a secret.
6. Deploy. Record the public Vercel URL, for example `https://your-dashboard.vercel.app`.

## D. Backend deployment: Render

1. In Render, create a **Web Service** from the same repository.
2. Keep the Root Directory empty (repository root).
3. Render can read `render.yaml`. If entering values manually, use:

   ```text
   Runtime: Python
   Build Command: pip install -r backend/requirements.txt
   Start Command: uvicorn backend.app:main --host 0.0.0.0 --port $PORT
   Health Check Path: /health
   ```

4. Set these Render environment variables:

   ```text
   PYTHON_VERSION=3.13.5
   CORS_ORIGINS=https://your-dashboard.vercel.app
   ```

   For a custom frontend domain, add it as another comma-separated origin:

   ```text
   CORS_ORIGINS=https://your-dashboard.vercel.app,https://dashboard.example.com
   ```

   Origins must use `https://` and must not have trailing slashes. Do not use `*`.
5. Deploy and copy the Render service URL into Vercel's `VITE_API_URL`, then redeploy Vercel. If you obtained the Vercel URL after Render first deployed, update `CORS_ORIGINS` and redeploy Render once.

The production backend command is `backend.app:main`. `backend/app/` is a Python package, not a single `backend/app.py` file; its package entrypoint exports the ASGI application.

## E. Environment variables

| Variable | Set in | Example | Purpose |
|---|---|---|---|
| `VITE_API_URL` | Vercel | `https://YOUR-RENDER-SERVICE.onrender.com` | Public API base URL compiled into the Vite dashboard. |
| `CORS_ORIGINS` | Render | `https://your-dashboard.vercel.app` | Comma-separated allowlist of browser origins allowed to call the API. |
| `PYTHON_VERSION` | Render | `3.13.5` | Explicit Python runtime used by the backend. |

For local development, copy `dashboard/.env.example` to `dashboard/.env.local`. That file is ignored by Git.

## F. Local build and start commands

Run the existing pipeline only when you intentionally refresh model artifacts. It is not part of public deployment:

```powershell
cd C:\path\to\electricity-theft
python full_pipeline.py
python -m src.explain
```

Start the local API:

```powershell
cd C:\path\to\electricity-theft
python -m pip install -r backend\requirements.txt
uvicorn backend.app:main --host 127.0.0.1 --port 8000 --reload
```

Build and serve the frontend locally:

```powershell
cd C:\path\to\electricity-theft\dashboard
Copy-Item .env.example .env.local
npm ci
npm run build
npm run dev -- --host 127.0.0.1 --port 5173
```

## G. Connecting frontend to backend

The browser reads `VITE_API_URL` at Vite build time. The backend reads `CORS_ORIGINS` at process startup. For a working public connection:

1. `VITE_API_URL` must exactly equal the Render public base URL.
2. `CORS_ORIGINS` must contain the exact Vercel origin, without a trailing slash.
3. Redeploy Vercel after changing `VITE_API_URL`.
4. Redeploy Render after changing `CORS_ORIGINS`.

## H. Public URL test checklist

After deployment, replace the URLs below with your actual domains:

```powershell
Invoke-RestMethod https://YOUR-RENDER-SERVICE.onrender.com/health
Invoke-RestMethod https://YOUR-RENDER-SERVICE.onrender.com/api/summary
```

Expected health response includes `status: ok`, `customers_loaded: 42372`, and `mode: precomputed-artifacts`.

Open the Vercel URL and verify:

1. Dashboard totals and HIGH/MEDIUM/LOW counts load.
2. Inspection queue filters and Consumer ID search work.
3. Consumer profile shows risk, anomaly signal, and available SHAP signals when the selected record has them.
4. Model Validation and Analytics load.
5. Saved Inspection List remains visible in the same browser after refresh.
6. Browser developer tools show no CORS errors.

## Security and data notes

- The API returns only `CONS_NO`, risk outputs, priorities, and explanation drivers. It does not expose the source `FLAG` label.
- No secrets or Windows paths are committed in deployment configuration.
- The dashboard's inspection list is browser-local storage, not a shared database.
- Render services can take time to wake on lower-cost plans; check `/health` before testing the dashboard if it initially shows data unavailable.
