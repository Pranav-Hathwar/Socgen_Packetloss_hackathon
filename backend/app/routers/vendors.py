from fastapi import APIRouter, HTTPException

from ..db import fetch_all_vendors, fetch_vendor, save_scores
from ..deps import AnyUser
from ..engine import score_vendor
from ..hydrate import row_to_summary, row_to_vendor_score
from ..schema import VendorScore, VendorSummary

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("", response_model=list[VendorSummary])
def list_vendors(_user: AnyUser):
    rows = fetch_all_vendors()
    result = []
    for row in rows:
        raw = dict(row)
        if raw.get("risk_score") is None:
            scored = score_vendor(raw)
            save_scores(raw["vendor_id"], scored)
            raw.update({
                "risk_score": scored["risk_score"],
                "risk_level": scored["risk_level"],
                "rag": scored["rag"],
                "alerts": str(scored["alerts"]),
            })
        result.append(row_to_summary(raw))
    return result


@router.get("/{vendor_id}", response_model=VendorScore)
def get_vendor(vendor_id: str, _user: AnyUser):
    row = fetch_vendor(vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    raw = dict(row)
    if raw.get("risk_score") is None:
        scored = score_vendor(raw)
        save_scores(vendor_id, scored)
        raw.update(scored)
    return row_to_vendor_score(raw)
