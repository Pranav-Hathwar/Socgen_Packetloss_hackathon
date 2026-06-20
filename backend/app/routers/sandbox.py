"""Admin Sandbox endpoints for live monitoring demo."""
import random
from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from ..mock_data import ALL_VENDORS, MOCK_SUMMARIES, MOCK_ALERTS, MOCK_VENDORS
from ..schema import BreachEvent, AlertItem, RAG, RiskLevel

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


class SandboxResponse(BaseModel):
    action: str
    vendor_id: str
    vendor_name: str
    detail: str
    new_risk_score: float


@router.post("/inject-breach", response_model=SandboxResponse)
def inject_breach():
    """Inject a breach into the DB for one of the first 3 vendors so Run Now picks it up."""
    from ..db import fetch_all_vendors, update_vendor_fields
    import random
    
    rows = fetch_all_vendors()
    # Find candidates that are NOT currently CRITICAL so we guarantee a change
    candidates = [r for r in rows if r["risk_level"] != "CRITICAL"]
    candidates = candidates[:3] if len(candidates) >= 3 else candidates
    if not candidates:
        candidates = rows[:3] if len(rows) >= 3 else rows
        
    vendor = random.choice(candidates)
    
    # Forcing under_investigation guarantees a level change to CRITICAL and score of 92+
    update_vendor_fields(vendor["vendor_id"], {"under_investigation": 1})
    
    return SandboxResponse(
        action="inject-breach",
        vendor_id=vendor["vendor_id"],
        vendor_name=vendor["name"],
        detail="Investigation triggered. Press 'Run Now' to rescore.",
        new_risk_score=92.0,
    )


@router.post("/advance-time", response_model=SandboxResponse)
def advance_time():
    """Find a vendor with SOC2 expiry and mark it as expired in the DB."""
    from ..db import fetch_all_vendors, update_vendor_fields
    import random
    from datetime import date, timedelta
    
    rows = fetch_all_vendors()
    # Find candidates that have a valid SOC 2 cert, and aren't already HIGH or CRITICAL
    candidates = [r for r in rows if int(dict(r).get("soc2_type2") or 0) and dict(r).get("risk_level") not in ("HIGH", "CRITICAL")]
    
    if not candidates:
        # Fallback
        candidates = [r for r in rows if int(dict(r).get("soc2_type2") or 0)]
        if not candidates:
            candidates = rows[:3] if len(rows) >= 3 else rows
        
    vendor = random.choice(candidates)
    
    # Simulate time advancing by setting expiry date to 10 days in the past.
    # We also force data_sensitivity to HIGH so it trips the engine's major override rule.
    past_date = (date.today() - timedelta(days=10)).isoformat()
    update_vendor_fields(vendor["vendor_id"], {
        "soc2_expiry": past_date,
        "data_sensitivity": "HIGH"
    })
    
    return SandboxResponse(
        action="advance-time",
        vendor_id=vendor["vendor_id"],
        vendor_name=vendor["name"],
        detail=f"Time advanced! SOC 2 expired for {vendor['name']}. Press 'Run Now' to rescore.",
        new_risk_score=vendor["risk_score"] or 0.0,
    )


def _rebuild_lists():
    """Rebuild summary & alert lists from current vendor state."""
    from ..schema import VendorSummary
    MOCK_SUMMARIES.clear()
    MOCK_ALERTS.clear()
    for v in MOCK_VENDORS:
        MOCK_SUMMARIES.append(
            VendorSummary(
                vendor_id=v.vendor_id,
                name=v.name,
                category=v.category,
                risk_score=v.risk_score,
                risk_level=v.risk_level,
                rag=v.rag,
                alerts=v.alerts,
            )
        )
        for a in v.alerts:
            MOCK_ALERTS.append(
                AlertItem(vendor_id=v.vendor_id, vendor_name=v.name, alert=a, rag=v.rag)
            )
