from fastapi import APIRouter

from ..claude_client import anonymize_vendor, build_vendor_context, cached_ask
from ..db import fetch_vendor
from ..deps import AnyUser
from ..engine import score_vendor
from ..qa import answer_question
from ..schema import AskRequest, AskResponse

router = APIRouter(prefix="/ask", tags=["ask"])


@router.post("", response_model=AskResponse)
def ask(body: AskRequest, _user: AnyUser):
    # Build anonymized vendor context if a vendor_id is provided
    vendor_context = ""
    if body.vendor_id:
        row = fetch_vendor(body.vendor_id)
        if row:
            raw = dict(row)
            scored = score_vendor(raw)
            raw.update(scored)
            anon = anonymize_vendor(raw)
            vendor_context = build_vendor_context(anon)

    # Try Claude (returns None if API key not set or call fails)
    claude_answer = cached_ask(body.question, vendor_context)
    if claude_answer is not None:
        return AskResponse(answer=claude_answer, sources=["gemini-flash"])

    # Deterministic fallback — always works, zero external calls
    result = answer_question(question=body.question, vendor_id=body.vendor_id, api_key=None)
    return AskResponse(answer=result["answer"], sources=result["sources"])
