from fastapi import APIRouter, Body, Depends, File, UploadFile
from pydantic import BaseModel

from ..deps import require_role
from ..ingest import ingest_auto, ingest_csv_bytes, ingest_email_text, ingest_json_bytes
from ..schema import IngestResponse

router = APIRouter(prefix="/ingest", tags=["ingest"])


def _refresh_rag() -> None:
    """Rebuild RAG index after bulk ingest. Best-effort — never blocks ingest."""
    try:
        from ..rag import reindex
        reindex()
    except Exception:
        pass


class EmailIngestRequest(BaseModel):
    text: str


class JsonIngestRequest(BaseModel):
    vendors: list[dict]


@router.post("", response_model=IngestResponse)
async def ingest(
    file: UploadFile = File(...),
    _user=Depends(require_role("ADMIN", "ANALYST")),
):
    """Auto-detect format from file extension: .csv / .json / .xlsx / .yaml"""
    content = await file.read()
    filename = file.filename or "upload.csv"
    result = ingest_auto(content, filename, content_type=file.content_type or "")
    _refresh_rag()
    return IngestResponse(
        status=result["status"],
        rows_processed=result["rows_processed"],
        message=result["message"]
        + (f" Conflicts: {len(result['conflicts'])}" if result["conflicts"] else ""),
    )


@router.post("/email", response_model=IngestResponse)
def ingest_email(
    body: EmailIngestRequest,
    _user=Depends(require_role("ADMIN", "ANALYST")),
):
    """Parse a pasted email body and extract vendor records from key:value pairs."""
    result = ingest_email_text(body.text)
    _refresh_rag()
    return IngestResponse(
        status=result["status"],
        rows_processed=result["rows_processed"],
        message=result["message"],
    )


@router.post("/json", response_model=IngestResponse)
def ingest_json(
    body: JsonIngestRequest,
    _user=Depends(require_role("ADMIN", "ANALYST")),
):
    """Accept a JSON body with a `vendors` array of vendor objects."""
    import json as _json
    content = _json.dumps(body.vendors).encode()
    result = ingest_json_bytes(content, "api_json")
    _refresh_rag()
    return IngestResponse(
        status=result["status"],
        rows_processed=result["rows_processed"],
        message=result["message"],
    )
