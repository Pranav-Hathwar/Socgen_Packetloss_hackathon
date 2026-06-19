"""What-If Simulator endpoint — returns a simulated vendor score with adjusted metrics."""
import copy

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..mock_data import ALL_VENDORS
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


def _classify(score: float) -> tuple[RiskLevel, RAG]:
    if score >= 75:
        return RiskLevel.CRITICAL, RAG.RED
    elif score >= 50:
        return RiskLevel.HIGH, RAG.RED
    elif score >= 30:
        return RiskLevel.MEDIUM, RAG.AMBER
    else:
        return RiskLevel.LOW, RAG.GREEN


@router.post("", response_model=SimulateResponse)
def simulate(body: SimulateRequest):
    vendor = ALL_VENDORS.get(body.vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail=f"Vendor {body.vendor_id} not found")

    original = vendor.score_breakdown
    sim = ScoreBreakdown(
        data_exposure=original.data_exposure,
        compliance_gaps=original.compliance_gaps,
        breach_history=original.breach_history,
        financial_health=original.financial_health,
        concentration=original.concentration,
    )
    actions: list[str] = []

    if body.renew_soc2:
        sim.compliance_gaps = max(0, sim.compliance_gaps - 25)
        actions.append("Renewed SOC 2 Type II certification")

    if body.sign_dpa:
        sim.compliance_gaps = max(0, sim.compliance_gaps - 20)
        sim.data_exposure = max(0, sim.data_exposure - 10)
        actions.append("Signed GDPR Data Processing Agreement")

    if body.revoke_access:
        sim.data_exposure = max(0, sim.data_exposure - 30)
        sim.concentration = max(0, sim.concentration - 15)
        actions.append("Revoked system access privileges")

    simulated_score = round(
        (sim.data_exposure + sim.compliance_gaps + sim.breach_history +
         sim.financial_health + sim.concentration) / 5, 1
    )
    risk_level, rag = _classify(simulated_score)

    return SimulateResponse(
        vendor_id=body.vendor_id,
        original_score=vendor.risk_score,
        simulated_score=simulated_score,
        delta=round(simulated_score - vendor.risk_score, 1),
        original_breakdown=original,
        simulated_breakdown=sim,
        simulated_risk_level=risk_level,
        simulated_rag=rag,
        actions_applied=actions,
    )
