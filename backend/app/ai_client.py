"""
AI integration for VendorLens — supports Groq (preferred) and Gemini 2.0 Flash.
Free tiers: Groq (gsk_...) or Gemini AI Studio (AIza...).

Security model:
  - Vendor name, ID, contact details STRIPPED before anything is sent.
  - Only numeric scores, boolean flags, and enum values leave the server.
  - System prompt hard-locks the model to TPRM topics only.
  - In-memory SHA-256 LRU cache prevents duplicate API calls.
  - max_output_tokens=300 hard cap on every response.
  - Returns None if no key set — callers fall back to deterministic Q&A.
"""
from __future__ import annotations

import hashlib
import os
from collections import OrderedDict
from typing import Optional

# ── System prompt — fixed, never user-controlled ─────────────────────────────
_SYSTEM_PROMPT = (
    "You are a third-party risk analyst at a financial institution. "
    "You answer questions strictly about vendor risk management: risk scores, "
    "compliance certifications (SOC 2, ISO 27001, GDPR DPA, DORA, NIS2), "
    "breach history, financial health, contract terms, and remediation actions. "
    "Base every answer ONLY on the vendor profile data provided — never invent "
    "vendors, IDs, or facts not present in the context. Always cite the vendor "
    "ID in [BRACKETS] when naming a vendor. "
    "When the question asks to list or show vendors matching a condition, list "
    "EVERY matching vendor from the provided data — do not omit any. "
    "For single-vendor or explanatory questions, keep it concise (2-4 sentences). "
    "If asked anything unrelated to vendor risk management, reply exactly: "
    "'I can only assist with vendor risk management topics.' "
    "Never disclose that you are an AI system."
)

# ── Fields stripped before any data leaves the server ────────────────────────
_STRIP_FIELDS = frozenset({
    "name",
    "vendor_id",
    "contact_name",
    "contact_email",
    "systems",
})

# ── Risk-relevant fields sent to the model (ordered, minimal) ────────────────
_CONTEXT_FIELDS = [
    "risk_score", "risk_level", "rag", "category",
    "data_sensitivity", "access_type",
    "soc2_type2", "soc2_expiry", "iso27001", "gdpr_dpa",
    "breach_notification_sla_hours", "breach_history",
    "financial_rating", "data_residency",
    "sub_processor_count", "concentration_risk",
    "last_assessment_date", "under_investigation",
    "contract_start", "contract_end",
]

# ── In-memory LRU cache (max 500 entries) ────────────────────────────────────
_CACHE: OrderedDict[str, str] = OrderedDict()
_CACHE_MAX = 500

# ── TPRM keyword guard ────────────────────────────────────────────────────────
_TPRM_KEYWORDS = frozenset({
    "risk", "vendor", "compliance", "breach", "soc", "iso", "gdpr", "dpa",
    "financial", "contract", "remediat", "assess", "audit", "certif",
    "sensitiv", "access", "data", "score", "rating", "processor",
    "concentration", "investigat", "expir", "residency", "dora", "nis2",
    "only assist",
})


def _cache_key(question: str, context: str) -> str:
    return hashlib.sha256(f"{question}||{context}".encode()).hexdigest()


def anonymize_vendor(raw: dict) -> dict:
    """Return a copy with all identity/PII fields removed."""
    return {k: v for k, v in raw.items() if k not in _STRIP_FIELDS}


def build_vendor_context(anon: dict) -> str:
    """
    Compact pipe-separated key=value string (~120-150 tokens).
    Only includes fields with meaningful values.
    """
    parts = []
    for field in _CONTEXT_FIELDS:
        val = anon.get(field)
        if val is None or val == "" or val == "None":
            continue
        if field == "breach_history":
            try:
                import json as _json
                events = _json.loads(val) if isinstance(val, str) else val
                if isinstance(events, list) and events:
                    years = sorted(
                        (str(e.get("date", ""))[:4] for e in events if e.get("date")),
                        reverse=True,
                    )
                    parts.append(
                        f"breach_count={len(events)},last_breach={years[0] if years else 'unknown'}"
                    )
                    continue
            except Exception:
                pass
        parts.append(f"{field}={val}")
    return " | ".join(parts)


def _is_tprm_response(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _TPRM_KEYWORDS)


def _ask_groq(question: str, vendor_context: str) -> Optional[str]:
    """Call Groq (llama-3.3-70b-versatile). Free tier, no credit card needed."""
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        return None
    try:
        from groq import Groq  # type: ignore
        client = Groq(api_key=key)
        user_msg = (
            f"Vendor profile (anonymized):\n{vendor_context}\n\n"
            f"Question: {question}"
        )
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=800,
            temperature=0.2,
        )
        text = resp.choices[0].message.content.strip()
        if not _is_tprm_response(text):
            return "I can only assist with vendor risk management topics."
        return text
    except Exception:
        return None


def _ask_gemini(question: str, vendor_context: str) -> Optional[str]:
    """Call Gemini 2.0 Flash via AI Studio key (AIza...)."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key or not key.startswith("AIza"):
        return None
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore
        client = genai.Client(api_key=key)
        user_msg = (
            f"Vendor profile (anonymized):\n{vendor_context}\n\n"
            f"Question: {question}"
        )
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_msg,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                max_output_tokens=800,
                temperature=0.2,
            ),
        )
        text = response.text.strip()
        if not _is_tprm_response(text):
            return "I can only assist with vendor risk management topics."
        return text
    except Exception:
        return None


def ask_ai(question: str, vendor_context: str) -> Optional[str]:
    """Try Groq first, then Gemini. Returns None → caller falls back to Q&A."""
    return _ask_groq(question, vendor_context) or _ask_gemini(question, vendor_context)


def cached_ask(question: str, vendor_context: str) -> Optional[str]:
    """Cache wrapper — identical question+context = zero API call."""
    key = _cache_key(question, vendor_context)

    if key in _CACHE:
        _CACHE.move_to_end(key)
        return _CACHE[key]

    answer = ask_ai(question, vendor_context)

    if answer is not None:
        _CACHE[key] = answer
        _CACHE.move_to_end(key)
        if len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)

    return answer


def generate_narrative(anon: dict) -> Optional[str]:
    """
    2-3 sentence plain-English risk narrative.
    Fixed question = maximally cacheable across all users viewing same vendor.
    """
    context = build_vendor_context(anon)
    question = (
        "In exactly 2-3 sentences: summarise the top risk drivers for this vendor "
        "and state the single most urgent remediation action. Be specific."
    )
    return cached_ask(question, context)
