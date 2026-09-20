"""Read-only public API for precomputed electricity-inspection artifacts."""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .service import repository


def cors_origins() -> list[str]:
    """Read an explicit comma-separated origin allowlist from deployment config."""
    configured = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    origins = [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    if "*" in origins:
        raise RuntimeError("CORS_ORIGINS must list explicit frontend origins; '*' is not allowed.")
    return origins


@asynccontextmanager
async def lifespan(_: FastAPI):
    repository.load()
    yield


app = FastAPI(
    title="Electricity Theft Inspection API",
    version="1.0.0",
    description="Read-only inspection-prioritization API using precomputed model artifacts.",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)


@app.get("/health", tags=["operations"])
def health():
    return {
        "status": "ok",
        "customers_loaded": len(repository.risk),
        "mode": "precomputed-artifacts",
        "consumption": "raw-meter-data",
    }


@app.get("/api/summary", tags=["dashboard"])
def summary():
    return repository.summary()


@app.get("/api/inspections", tags=["dashboard"])
def inspections(
    priority: str | None = Query(None, pattern="^(HIGH|MEDIUM|LOW)$"),
    query: str | None = Query(None, max_length=100),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    randomize: bool = Query(False),
):
    rows = repository.risk
    if priority:
        rows = rows[rows["review_priority"] == priority]
    if query:
        rows = rows[
            rows["CONS_NO"].astype(str).str.contains(
                query, case=False, na=False, regex=False
            )
        ]
    if randomize:
        rows = rows.sample(frac=1)
    page = rows.iloc[offset: offset + limit]
    return {"total": len(rows), "items": repository.public_risk_records(page)}


@app.get("/api/customers/{cons_no}", tags=["dashboard"])
def customer(cons_no: str):
    record = repository.risk[repository.risk["CONS_NO"].astype(str) == cons_no]
    if record.empty:
        raise HTTPException(status_code=404, detail="Consumer not found")
    response = repository.public_risk_records(record.iloc[:1])[0]
    response["explanation"] = repository.public_explanation(cons_no)
    history = repository.consumption_payload(cons_no)
    if history:
        response["feeder"] = history["feeder"]
        response["risk_factors"] = history["risk_factors"]
    else:
        response["feeder"] = repository._feeder_context(cons_no)
    return response


@app.get("/api/customers/{cons_no}/consumption", tags=["dashboard"])
def customer_consumption(cons_no: str):
    history = repository.consumption_payload(cons_no)
    if history is None:
        raise HTTPException(status_code=404, detail="Consumer not found")
    return history


@app.get("/api/metrics", tags=["analytics"])
def metrics():
    return repository.metrics


@app.get("/api/calibration", tags=["analytics"])
def calibration():
    return repository.calibration


@app.get("/api/feature-importance", tags=["analytics"])
def feature_importance():
    return repository.importance.head(20).to_dict(orient="records")
