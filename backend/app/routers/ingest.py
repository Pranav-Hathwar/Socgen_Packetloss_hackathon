from fastapi import APIRouter, UploadFile, File

from ..schema import IngestResponse

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", response_model=IngestResponse)
async def ingest(file: UploadFile = File(...)):
    """Stub: accept CSV upload, return mock processed count."""
    content = await file.read()
    row_count = max(0, content.count(b"\n") - 1)  # rough estimate
    return IngestResponse(
        status="ok",
        rows_processed=row_count,
        message=f"Stub ingestion complete. Received {len(content)} bytes from '{file.filename}'.",
    )
