from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import alerts, ask, ingest, report, vendors

app = FastAPI(title="VendorLens API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vendors.router)
app.include_router(alerts.router)
app.include_router(report.router)
app.include_router(ingest.router)
app.include_router(ask.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "VendorLens API"}
