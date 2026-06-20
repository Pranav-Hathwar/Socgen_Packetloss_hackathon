from fastapi import APIRouter

from ..ai_client import cached_ask
from ..db import fetch_vendor
from ..deps import AnyUser
from ..engine import score_vendor
from ..qa import answer_question
from ..rag import rag_answer, _doc_for_row
from ..schema import AskRequest, AskResponse

router = APIRouter(prefix="/ask", tags=["ask"])


@router.post("", response_model=AskResponse)
def ask(body: AskRequest, _user: AnyUser):
    # ── Single-vendor question: strictly scoped to that one vendor ──
    if body.vendor_id:
        row = fetch_vendor(body.vendor_id)
        vendor_context = ""
        if row:
            raw = dict(row)
            raw.update(score_vendor(raw))
            # Named, identity-rich context — you are explicitly viewing this vendor.
            vendor_context = f"[{raw['vendor_id']}] {_doc_for_row(raw)}"
        ai_answer = cached_ask(body.question, vendor_context)
        if ai_answer is not None:
            return AskResponse(answer=ai_answer, sources=[body.vendor_id])
        result = answer_question(question=body.question, vendor_id=body.vendor_id, api_key=None)
        return AskResponse(answer=result["answer"], sources=result["sources"])

    # ── Cross-portfolio question: hybrid RAG over all vendors ──
    ai_answer, source_ids = rag_answer(body.question, k=8)
    if ai_answer is not None:
        return AskResponse(answer=ai_answer, sources=source_ids or ["groq-llama3"])

    # Deterministic fallback — always works, zero external calls
    result = answer_question(question=body.question, vendor_id=None, api_key=None)
    return AskResponse(answer=result["answer"], sources=result["sources"])
