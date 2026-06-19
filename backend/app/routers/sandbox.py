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
    """Pick a random vendor, add a breach event, bump their risk score."""
    vendor = random.choice(MOCK_VENDORS)

    breach = BreachEvent(
        date=date.today(),
        severity="HIGH",
        description="[SIMULATED] Unauthorized data access detected in production environment.",
    )
    vendor.breach_history.append(breach)

    bump = random.uniform(12.0, 22.0)
    vendor.risk_score = min(100.0, round(vendor.risk_score + bump, 1))
    vendor.score_breakdown.breach_history = min(100.0, vendor.score_breakdown.breach_history + bump)

    if vendor.risk_score >= 75:
        vendor.risk_level = RiskLevel.CRITICAL
        vendor.rag = RAG.RED
    elif vendor.risk_score >= 50:
        vendor.risk_level = RiskLevel.HIGH
        vendor.rag = RAG.RED

    alert_text = f"[SIMULATED] New breach detected — score increased by {bump:.1f}"
    vendor.alerts.append(alert_text)

    # Rebuild summaries
    _rebuild_lists()

    return SandboxResponse(
        action="inject-breach",
        vendor_id=vendor.vendor_id,
        vendor_name=vendor.name,
        detail=f"Breach injected. Risk score: {vendor.risk_score}",
        new_risk_score=vendor.risk_score,
    )


@router.post("/advance-time", response_model=SandboxResponse)
def advance_time():
    """Find a vendor with SOC2 expiry and mark it as expired."""
    candidates = [
        v for v in MOCK_VENDORS
        if v.compliance.soc2_type2 and v.compliance.soc2_expiry
    ]
    if not candidates:
        vendor = MOCK_VENDORS[0]
        detail = "No SOC2 vendors to expire. Applied penalty to first vendor."
    else:
        vendor = random.choice(candidates)
        vendor.compliance.soc2_type2 = False
        vendor.compliance.soc2_expiry = None
        detail = f"SOC 2 Type II certification expired for {vendor.name}."

    bump = random.uniform(8.0, 15.0)
    vendor.risk_score = min(100.0, round(vendor.risk_score + bump, 1))
    vendor.score_breakdown.compliance_gaps = min(100.0, vendor.score_breakdown.compliance_gaps + bump)

    if vendor.risk_score >= 75:
        vendor.risk_level = RiskLevel.CRITICAL
        vendor.rag = RAG.RED
    elif vendor.risk_score >= 50:
        vendor.risk_level = RiskLevel.HIGH
        vendor.rag = RAG.RED
    elif vendor.risk_score >= 30:
        vendor.risk_level = RiskLevel.MEDIUM
        vendor.rag = RAG.AMBER

    alert_text = "[SIMULATED] SOC 2 certification expired"
    vendor.alerts.append(alert_text)

    _rebuild_lists()

    return SandboxResponse(
        action="advance-time",
        vendor_id=vendor.vendor_id,
        vendor_name=vendor.name,
        detail=detail,
        new_risk_score=vendor.risk_score,
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
