from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parent.parent / ".env")

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
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
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
