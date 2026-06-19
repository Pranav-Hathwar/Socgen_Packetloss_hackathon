import os

from fastapi import APIRouter

from ..contract import extract_contract_fields
from ..qa import answer_question
from ..schema import AskRequest, AskResponse

router = APIRouter(prefix="/ask", tags=["ask"])


@router.post("", response_model=AskResponse)
def ask(body: AskRequest):
    result = answer_question(
        question=body.question,
        vendor_id=body.vendor_id,
        api_key=os.getenv("ANTHROPIC_API_KEY"),
    )
    return AskResponse(answer=result["answer"], sources=result["sources"])
