from fastapi import APIRouter

from ..ai_client import cached_ask
from ..db import fetch_vendor
from ..deps import AnyUser
from ..engine import score_vendor
from ..qa import answer_question
from ..rag import rag_answer, _doc_for_row
from ..schema import AskRequest, AskResponse

router = APIRouter(prefix="/ask", tags=["ask"])


@router.get("/_diag")
def diag():
    """TEMPORARY diagnostic — confirms whether the Groq key + model work. Remove after."""
    import os
    key = os.getenv("GROQ_API_KEY", "").strip()
    info = {
        "groq_key_present": bool(key),
        "groq_key_len": len(key),
        "gemini_key_present": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "model": "llama-3.3-70b-versatile",
    }
    if not key:
        info["groq_call"] = "skipped (no key)"
        return info
    try:
        from groq import Groq
        client = Groq(api_key=key)
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "Reply with the single word OK."}],
            max_tokens=5,
        )
        info["groq_call"] = "ok"
        info["groq_reply"] = resp.choices[0].message.content
    except Exception as e:
        info["groq_call"] = "error"
        info["groq_error"] = f"{type(e).__name__}: {e}"
    return info


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
