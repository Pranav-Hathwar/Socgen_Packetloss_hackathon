from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import alerts, ask, ingest, report, vendors
from .startup import bootstrap


@asynccontextmanager
async def lifespan(app: FastAPI):
    result = bootstrap()
    print(
        f"[VendorLens] DB ready — "
        f"{result['vendors_loaded']} vendors, "
        f"{result['vendors_scored']} scored"
    )
    yield


app = FastAPI(title="VendorLens API", version="0.2.0", lifespan=lifespan)

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
    return {"status": "ok", "service": "VendorLens API", "version": "0.2.0"}
