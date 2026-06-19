from fastapi import APIRouter, File, UploadFile

from ..ingest import ingest_csv_bytes
from ..schema import IngestResponse

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", response_model=IngestResponse)
async def ingest(file: UploadFile = File(...)):
    content = await file.read()
    result = ingest_csv_bytes(content, filename=file.filename or "upload.csv")
    return IngestResponse(
        status=result["status"],
        rows_processed=result["rows_processed"],
        message=result["message"]
        + (f" Conflicts: {result['conflicts']}" if result["conflicts"] else ""),
    )
