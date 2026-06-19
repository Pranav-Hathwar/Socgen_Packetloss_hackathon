from fastapi import APIRouter

from ..mock_data import ALL_VENDORS
from ..schema import AskRequest, AskResponse

router = APIRouter(prefix="/ask", tags=["ask"])


@router.post("", response_model=AskResponse)
def ask(body: AskRequest):
    """Stub: echo question + canned answer. Replace with Anthropic SDK call."""
    vendor_ctx = ""
    if body.vendor_id and body.vendor_id in ALL_VENDORS:
        v = ALL_VENDORS[body.vendor_id]
        vendor_ctx = f" (context: {v.name}, risk score {v.risk_score})"

    return AskResponse(
        answer=(
            f"[STUB] You asked: '{body.question}'{vendor_ctx}. "
            "Wire this endpoint to the Anthropic SDK to get a real answer."
        ),
        sources=["vendor_registry.csv", "vendor_labels.csv"],
    )
