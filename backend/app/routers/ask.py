from fastapi import APIRouter

from ..ai_client import anonymize_vendor, build_vendor_context, cached_ask
from ..db import fetch_vendor
from ..deps import AnyUser
from ..engine import score_vendor
from ..qa import answer_question
from ..rag import rag_answer, retrieve
from ..schema import AskRequest, AskResponse

router = APIRouter(prefix="/ask", tags=["ask"])


@router.post("", response_model=AskResponse)
def ask(body: AskRequest, _user: AnyUser):
    # ── Single-vendor question: build context for that one vendor ──
    if body.vendor_id:
        row = fetch_vendor(body.vendor_id)
        vendor_context = ""
        if row:
            raw = dict(row)
            raw.update(score_vendor(raw))
            anon = anonymize_vendor(raw)
            vendor_context = build_vendor_context(anon)
        ai_answer = cached_ask(body.question, vendor_context)
        if ai_answer is not None:
            return AskResponse(answer=ai_answer, sources=["groq-llama3"])
        result = answer_question(question=body.question, vendor_id=body.vendor_id, api_key=None)
        return AskResponse(answer=result["answer"], sources=result["sources"])

    # ── Cross-portfolio question: RAG over all vendors ──
    hits = retrieve(body.question, k=8)
    if hits:
        ai_answer = rag_answer(body.question, k=8)
        if ai_answer is not None:
            return AskResponse(answer=ai_answer, sources=[h["vendor_id"] for h in hits])

    # Deterministic fallback — always works, zero external calls
    result = answer_question(question=body.question, vendor_id=None, api_key=None)
    return AskResponse(answer=result["answer"], sources=result["sources"])
