from pathlib import Path
from tempfile import NamedTemporaryFile
from fastapi import APIRouter, File, UploadFile, HTTPException
from ..contract import extract_from_pdf
from ..deps import AnyUser

router = APIRouter(prefix="/contracts", tags=["contracts"])

@router.post("/analyze")
async def analyze_contract(
    file: UploadFile = File(...),
    vendor_id: str = None,
    _user: AnyUser = None
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF contracts are supported")

    # Save to temp file for pdfplumber
    with NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        results = extract_from_pdf(tmp_path, vendor_id=vendor_id)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path.exists():
            tmp_path.unlink()
