import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parent.parent / ".env")

# Allowed browser origins. Local dev defaults are always permitted; production
# frontend URLs come from the CORS_ORIGINS env var (comma-separated).
_DEFAULT_ORIGINS = ["http://localhost:3000", "http://localhost:3001"]
_ENV_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
ALLOWED_ORIGINS = _DEFAULT_ORIGINS + _ENV_ORIGINS

from .routers import advanced, alerts, ask, auth_router, ingest, monitor, report, sandbox, simulate, vendors
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
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],
)

app.include_router(auth_router.router)
app.include_router(vendors.router)
app.include_router(alerts.router)
app.include_router(report.router)
app.include_router(ingest.router)
app.include_router(ask.router)
app.include_router(monitor.router)
app.include_router(simulate.router)
app.include_router(sandbox.router)
app.include_router(advanced.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "VendorLens API", "version": "0.2.0"}
