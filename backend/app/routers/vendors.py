import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, File, UploadFile, Depends

from ..db import (
    fetch_all_vendors, fetch_vendor, save_scores,
    delete_vendor, update_vendor_fields, create_vendor,
    fetch_score_history, add_remediation, fetch_remediations,
    add_cert_document, fetch_cert_documents,
)
from ..ai_client import anonymize_vendor, build_vendor_context, generate_narrative
from ..deps import AnyUser, require_role
from ..rag import upsert_vendor, remove_vendor
from ..engine import score_vendor
from ..hydrate import row_to_summary, row_to_vendor_score
from ..suggestions import generate_suggestions
from ..schema import (
    VendorScore, VendorSummary, VendorCreateRequest, VendorUpdateRequest,
    RemediationRequest, RemediationRecord, ScoreHistoryPoint,
)

router = APIRouter(prefix="/vendors", tags=["vendors"])

CERT_UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads" / "certs"


@router.post("", status_code=201, response_model=VendorScore)
def create_vendor_endpoint(body: VendorCreateRequest, _user=Depends(require_role("ADMIN", "ANALYST"))):
    vendor_id = create_vendor(body.model_dump())
    raw = dict(fetch_vendor(vendor_id))
    scored = score_vendor(raw)
    save_scores(vendor_id, scored, trigger="initial")
    raw.update(scored)
    try:
        upsert_vendor(raw)
    except Exception:
        pass  # RAG index update is best-effort; never block vendor creation
    return row_to_vendor_score(raw)


@router.get("", response_model=list[VendorSummary])
def list_vendors(
    _user: AnyUser,
    limit: int = 2000,
    offset: int = 0,
    search: str = "",
    risk_level: str = "",
    category: str = "",
):
    rows = fetch_all_vendors()
    result = []
    for row in rows:
        raw = dict(row)
        if raw.get("risk_score") is None:
            scored = score_vendor(raw)
            save_scores(raw["vendor_id"], scored, trigger="initial")
            raw.update({
                "risk_score": scored["risk_score"],
                "risk_level": scored["risk_level"],
                "rag": scored["rag"],
                "alerts": str(scored["alerts"]),
            })
        result.append(row_to_summary(raw))
    if search:
        q = search.lower()
        result = [r for r in result if q in r.name.lower() or q in r.category.lower()]
    if risk_level:
        result = [r for r in result if r.risk_level == risk_level]
    if category:
        result = [r for r in result if r.category == category]
    return result[offset: offset + limit]


@router.get("/{vendor_id}", response_model=VendorScore)
def get_vendor(vendor_id: str, _user: AnyUser):
    row = fetch_vendor(vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    raw = dict(row)
    if raw.get("risk_score") is None:
        scored = score_vendor(raw)
        save_scores(vendor_id, scored, trigger="initial")
        raw.update(scored)
    return row_to_vendor_score(raw)


@router.patch("/{vendor_id}")
def update_vendor(vendor_id: str, body: VendorUpdateRequest, _user=Depends(require_role("ADMIN", "ANALYST"))):
    row = fetch_vendor(vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_vendor_fields(vendor_id, fields):
        raise HTTPException(status_code=400, detail="No valid fields to update")
    updated = dict(fetch_vendor(vendor_id))
    scored = score_vendor(updated)
    save_scores(vendor_id, scored, trigger="manual_edit")
    updated.update(scored)
    try:
        upsert_vendor(updated)
    except Exception:
        pass  # best-effort RAG refresh
    return {"status": "updated", "new_risk_score": scored["risk_score"], "new_risk_level": scored["risk_level"]}


@router.delete("/{vendor_id}", status_code=204)
def delete_vendor_endpoint(vendor_id: str, _user=Depends(require_role("ADMIN"))):
    if not delete_vendor(vendor_id):
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    try:
        remove_vendor(vendor_id)
    except Exception:
        pass  # best-effort RAG cleanup


@router.get("/{vendor_id}/narrative")
def get_narrative(vendor_id: str, _user: AnyUser):
    """AI-generated 2-3 sentence risk narrative. Returns null narrative if no API key set."""
    row = fetch_vendor(vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    raw = dict(row)
    scored = score_vendor(raw)
    raw.update(scored)
    anon = anonymize_vendor(raw)
    narrative = generate_narrative(anon)
    return {
        "vendor_id": vendor_id,
        "narrative": narrative,
        "source": "groq-llama3" if narrative else "unavailable",
    }


@router.get("/{vendor_id}/suggestions")
def get_suggestions(vendor_id: str, _user: AnyUser):
    row = fetch_vendor(vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    raw = dict(row)
    scored = score_vendor(raw)
    return {"vendor_id": vendor_id, "suggestions": generate_suggestions(raw, scored)}


@router.get("/{vendor_id}/history", response_model=list[ScoreHistoryPoint])
def get_score_history(vendor_id: str, _user: AnyUser):
    rows = fetch_score_history(vendor_id)
    return [ScoreHistoryPoint(**dict(r)) for r in rows]


@router.post("/{vendor_id}/remediate", response_model=RemediationRecord)
def add_remediation_endpoint(vendor_id: str, body: RemediationRequest, _user=Depends(require_role("ADMIN", "ANALYST"))):
    row = fetch_vendor(vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    raw = dict(row)
    score_before = float(raw.get("risk_score") or 0)
    scored = score_vendor(raw)
    save_scores(vendor_id, scored, trigger="remediation")
    score_after = scored["risk_score"]
    from datetime import datetime as _dt
    rec_id = add_remediation(
        vendor_id=vendor_id,
        issue=body.issue,
        resolved_by=body.resolved_by,
        score_before=score_before,
        score_after=score_after,
        note=body.note or "",
    )
    return RemediationRecord(
        id=rec_id,
        vendor_id=vendor_id,
        issue=body.issue,
        resolved_by=body.resolved_by,
        resolved_at=_dt.utcnow().isoformat(),
        score_before=score_before,
        score_after=score_after,
        note=body.note or "",
    )


@router.get("/{vendor_id}/remediations", response_model=list[RemediationRecord])
def list_remediations(vendor_id: str, _user: AnyUser):
    rows = fetch_remediations(vendor_id)
    return [RemediationRecord(**dict(r)) for r in rows]


@router.post("/{vendor_id}/certs")
async def upload_cert(
    vendor_id: str,
    cert_type: str = "soc2_type2",
    expiry_date: str = "",
    file: UploadFile = File(...),
    _user=Depends(require_role("ADMIN", "ANALYST")),
):
    row = fetch_vendor(vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    CERT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{vendor_id}_{cert_type}_{file.filename}"
    dest = CERT_UPLOAD_DIR / safe_name
    content = await file.read()
    dest.write_bytes(content)
    doc_id = add_cert_document(
        vendor_id=vendor_id,
        cert_type=cert_type,
        filename=file.filename or safe_name,
        file_path=str(dest),
        expiry_date=expiry_date,
    )
    return {"status": "uploaded", "id": doc_id, "filename": safe_name, "cert_type": cert_type}


@router.get("/{vendor_id}/certs")
def list_certs(vendor_id: str, _user: AnyUser):
    rows = fetch_cert_documents(vendor_id)
    return [dict(r) for r in rows]