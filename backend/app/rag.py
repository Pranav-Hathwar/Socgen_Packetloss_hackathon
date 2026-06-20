"""
Local RAG for VendorLens Audit Co-Pilot.
====================================================================
Fully local retrieval — no external API for embeddings.
  - Embedding model: sentence-transformers all-MiniLM-L6-v2 (CPU, ~80MB).
  - Vector store: in-memory numpy matrix, brute-force cosine (402 vendors = trivial).
  - Persisted to disk (.rag_store/) so restart is instant after first build.
  - Retrieval returns top-K vendor rows; context built for Groq generation.

Flow:
  question -> embed -> cosine top-K vendors -> build context -> Groq -> grounded answer.

Falls back gracefully: if model/deps missing, retrieve() returns [] and the
caller drops to deterministic qa.py. No exceptions propagate.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from .db import fetch_all_vendors
from .engine import _safe_date, score_vendor

_STORE_DIR = Path(__file__).parent.parent / ".rag_store"
_EMB_FILE = _STORE_DIR / "embeddings.npy"
_META_FILE = _STORE_DIR / "meta.json"
_MODEL_NAME = "all-MiniLM-L6-v2"

# Module-level singletons — loaded lazily, reused across requests.
_model = None
_embeddings = None        # numpy (N, D)
_meta: list[dict] = []    # parallel list of {vendor_id, name, doc}


def _get_model():
    """Lazy-load the embedding model once. Returns None if deps missing."""
    global _model
    if _model is not None:
        return _model
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        _model = SentenceTransformer(_MODEL_NAME)
        return _model
    except Exception:
        return None


def _vendor_doc(r: dict) -> str:
    """Build a rich natural-language summary of one vendor for embedding."""
    name = r.get("name", "Unknown")
    cat = r.get("category", "?")
    rl = r.get("risk_level", "?")
    score = r.get("risk_score", "?")
    rag = r.get("rag", "?")

    parts = [f"{name} is a {cat} vendor with {rl} risk (score {score}, {rag} status)."]

    # Compliance
    soc2 = int(r.get("soc2_type2", 0) or 0)
    iso = int(r.get("iso27001", 0) or 0)
    gdpr = int(r.get("gdpr_dpa", 0) or 0)
    comp = []
    comp.append("SOC 2 Type II certified" if soc2 else "missing SOC 2 Type II")
    comp.append("ISO 27001 certified" if iso else "not ISO 27001 certified")
    comp.append("GDPR DPA signed" if gdpr else "no GDPR DPA, GDPR non-compliant")
    parts.append("Compliance: " + ", ".join(comp) + ".")

    exp = _safe_date(r.get("soc2_expiry"))
    if soc2 and exp:
        parts.append(f"SOC 2 certification expires {exp.isoformat()}.")

    # Breach
    bh = r.get("breach_history")
    if bh:
        parts.append("Has breach history / past security incident.")
    else:
        parts.append("No breach history.")

    if int(r.get("under_investigation", 0) or 0):
        parts.append("Currently under active investigation.")

    # Data / access
    ds = str(r.get("data_sensitivity", "")).upper()
    if ds:
        parts.append(f"Handles {ds} sensitivity data.")
    at = str(r.get("access_type", ""))
    if at:
        parts.append(f"Access type: {at}.")
    res = str(r.get("data_residency", ""))
    if res:
        parts.append(f"Data residency: {res}.")

    # Concentration
    cr = str(r.get("concentration_risk", "")).upper()
    if cr:
        parts.append(f"Concentration risk: {cr}.")
    spc = r.get("sub_processor_count")
    if spc is not None:
        parts.append(f"Uses {spc} sub-processors.")

    # Contract
    ce = _safe_date(r.get("contract_end"))
    if ce:
        parts.append(f"Contract ends {ce.isoformat()}.")

    fr = r.get("financial_rating")
    if fr:
        parts.append(f"Financial rating: {fr}.")

    return " ".join(parts)


def _scored_rows() -> list[dict]:
    """Fetch all vendors, ensuring each has risk fields populated."""
    rows = []
    for r in fetch_all_vendors():
        raw = dict(r)
        if raw.get("risk_score") is None:
            raw.update(score_vendor(raw))
        rows.append(raw)
    return rows


def build_index(force: bool = False) -> dict:
    """
    Embed all vendors into an in-memory matrix, persist to disk.
    Loads from cache if present and not forced. Returns status dict.
    """
    global _embeddings, _meta
    import numpy as np

    model = _get_model()
    if model is None:
        return {"status": "skipped", "reason": "embedding model unavailable", "count": 0}

    # Try cache first
    if not force and _EMB_FILE.exists() and _META_FILE.exists():
        try:
            _embeddings = np.load(_EMB_FILE)
            _meta = json.loads(_META_FILE.read_text(encoding="utf-8"))
            if len(_meta) == len(_embeddings):
                return {"status": "loaded_cache", "count": len(_meta)}
        except Exception:
            pass  # fall through to rebuild

    rows = _scored_rows()
    docs = [_vendor_doc(r) for r in rows]
    _meta = [{"vendor_id": r["vendor_id"], "name": r.get("name", ""), "doc": d}
             for r, d in zip(rows, docs)]

    embs = model.encode(docs, normalize_embeddings=True, show_progress_bar=False)
    _embeddings = np.asarray(embs, dtype="float32")

    _STORE_DIR.mkdir(exist_ok=True)
    np.save(_EMB_FILE, _embeddings)
    _META_FILE.write_text(json.dumps(_meta), encoding="utf-8")

    return {"status": "built", "count": len(_meta)}


def retrieve(query: str, k: int = 8) -> list[dict]:
    """Return top-K vendor meta dicts by cosine similarity. [] on any failure."""
    global _embeddings, _meta
    import numpy as np

    if _embeddings is None or not _meta:
        build_index()
    if _embeddings is None or not _meta:
        return []

    model = _get_model()
    if model is None:
        return []

    try:
        q = model.encode([query], normalize_embeddings=True)
        q = np.asarray(q, dtype="float32")[0]
        sims = _embeddings @ q  # cosine (both normalized)
        top = np.argsort(-sims)[:k]
        return [{**_meta[i], "score": float(sims[i])} for i in top]
    except Exception:
        return []


def rag_answer(question: str, k: int = 8) -> Optional[str]:
    """
    Full RAG: retrieve top-K vendors, build context, ask Groq.
    Returns None if retrieval empty or LLM unavailable -> caller falls back.
    """
    hits = retrieve(question, k=k)
    if not hits:
        return None

    context_lines = [f"[{h['vendor_id']}] {h['doc']}" for h in hits]
    context = "\n".join(context_lines)

    from .ai_client import ask_ai
    return ask_ai(question, context)


def reindex() -> dict:
    """Force a full rebuild (e.g. after vendor data changes)."""
    return build_index(force=True)
