"""What-If Simulator — uses real DB scores, not mock data."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import fetch_vendor, save_scores
from ..deps import AnyUser
from ..engine import score_vendor
from ..schema import RiskLevel, RAG, ScoreBreakdown

router = APIRouter(prefix="/simulate", tags=["simulate"])


class SimulateRequest(BaseModel):
    vendor_id: str
    renew_soc2: bool = False
    sign_dpa: bool = False
    revoke_access: bool = False


class SimulateResponse(BaseModel):
    vendor_id: str
    original_score: float
    simulated_score: float
    delta: float
    original_breakdown: ScoreBreakdown
    simulated_breakdown: ScoreBreakdown
    simulated_risk_level: RiskLevel
    simulated_rag: RAG
    actions_applied: list[str]


@router.post("", response_model=SimulateResponse)
def simulate(body: SimulateRequest, _user: AnyUser):
    row = fetch_vendor(body.vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {body.vendor_id} not found")

    raw = dict(row)
    # Ensure vendor is scored
    orig_scored = score_vendor(raw)

    # Clone and apply hypothetical changes
    modified = dict(raw)
    actions: list[str] = []

    if body.renew_soc2:
        modified["soc2_type2"] = 1
        # Push expiry 2 years out from engine TODAY
        from ..engine import TODAY as ENG_TODAY
        from datetime import timedelta
        modified["soc2_expiry"] = (ENG_TODAY + timedelta(days=730)).isoformat()
        actions.append("Renewed SOC 2 Type II certification")

    if body.sign_dpa:
        modified["gdpr_dpa"] = 1
        actions.append("Signed GDPR Data Processing Agreement")

    if body.revoke_access:
        modified["access_type"] = "read"
        modified["data_sensitivity"] = "LOW"
        actions.append("Revoked write/sensitive system access")

    new_scored = score_vendor(modified)

    orig_bd = orig_scored["score_breakdown"]
    new_bd = new_scored["score_breakdown"]

    return SimulateResponse(
        vendor_id=body.vendor_id,
        original_score=orig_scored["risk_score"],
        simulated_score=new_scored["risk_score"],
        delta=round(new_scored["risk_score"] - orig_scored["risk_score"], 1),
        original_breakdown=ScoreBreakdown(**orig_bd),
        simulated_breakdown=ScoreBreakdown(**new_bd),
        simulated_risk_level=RiskLevel(new_scored["risk_level"]),
        simulated_rag=RAG(new_scored["rag"]),
        actions_applied=actions,
    )
