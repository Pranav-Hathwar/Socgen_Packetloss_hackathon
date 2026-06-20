"""
Claude Haiku integration for VendorLens.

Security model:
  - Vendor name, ID, contact details are STRIPPED before anything is sent.
  - Only numeric scores, boolean flags, and enum values leave the server.
  - System prompt hard-locks Claude to TPRM topics only.
  - In-memory SHA-256 cache prevents duplicate API calls.
  - max_tokens=300 hard cap on every response.
  - Returns None if ANTHROPIC_API_KEY is unset — callers fall back to
    deterministic Q&A automatically. No exceptions propagate to callers.
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
    "Base every answer on the vendor profile data provided. "
    "Do not speculate beyond the data. Keep answers concise (2-4 sentences max). "
    "If asked anything unrelated to vendor risk management, reply exactly: "
    "'I can only assist with vendor risk management topics.' "
    "Never disclose that you are Claude or an AI system."
)

# ── Fields stripped before any data leaves the server ────────────────────────
_STRIP_FIELDS = frozenset({
    "name",           # vendor identity
    "vendor_id",      # vendor identity
    "contact_name",   # PII
    "contact_email",  # PII
    "systems",        # may contain internal system names
})

# ── Risk-relevant fields sent to Claude (ordered, minimal) ───────────────────
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

# ── TPRM keyword guard — response must contain at least one ──────────────────
_TPRM_KEYWORDS = frozenset({
    "risk", "vendor", "compliance", "breach", "soc", "iso", "gdpr", "dpa",
    "financial", "contract", "remediat", "assess", "audit", "certif",
    "sensitiv", "access", "data", "score", "rating", "processor",
    "concentration", "investigat", "expir", "residency", "dora", "nis2",
    "only assist",  # catches the off-topic deflection itself
})


def _cache_key(question: str, context: str) -> str:
    return hashlib.sha256(f"{question}||{context}".encode()).hexdigest()


def anonymize_vendor(raw: dict) -> dict:
    """Return a copy with all identity/PII fields removed."""
    return {k: v for k, v in raw.items() if k not in _STRIP_FIELDS}


def build_vendor_context(anon: dict) -> str:
    """
    Compact pipe-separated key=value string.
    Only includes fields with meaningful values to minimise token count.
    Typical output: ~120-150 tokens.
    """
    parts = []
    for field in _CONTEXT_FIELDS:
        val = anon.get(field)
        if val is None or val == "" or val == "None":
            continue
        # Shorten breach_history list to just a count + most recent year
        if field == "breach_history":
            try:
                import json as _json
                events = _json.loads(val) if isinstance(val, str) else val
                if isinstance(events, list) and events:
                    years = sorted(
                        (str(e.get("date", ""))[:4] for e in events if e.get("date")),
                        reverse=True,
                    )
                    parts.append(f"breach_count={len(events)},last_breach={years[0] if years else 'unknown'}")
                    continue
            except Exception:
                pass
        parts.append(f"{field}={val}")
    return " | ".join(parts)


def _is_tprm_response(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in _TPRM_KEYWORDS)


def _get_client():
    """Lazy-load Anthropic client only when needed."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=api_key)
    except ImportError:
        return None


def ask_claude(question: str, vendor_context: str) -> Optional[str]:
    """
    Single Claude Haiku call with anonymized vendor context.
    Returns None on any failure so callers fall back to deterministic Q&A.
    Never raises.
    """
    client = _get_client()
    if client is None:
        return None

    try:
        user_msg = (
            f"Vendor profile (anonymized):\n{vendor_context}\n\n"
            f"Question: {question}"
        )
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        text = response.content[0].text.strip()

        # Validate response stays on-topic
        if not _is_tprm_response(text):
            return "I can only assist with vendor risk management topics."

        return text
    except Exception:
        return None


def cached_ask(question: str, vendor_context: str) -> Optional[str]:
    """Cache wrapper — identical question+context returns cached answer instantly."""
    key = _cache_key(question, vendor_context)

    if key in _CACHE:
        _CACHE.move_to_end(key)          # mark as recently used
        return _CACHE[key]

    answer = ask_claude(question, vendor_context)

    if answer is not None:
        _CACHE[key] = answer
        _CACHE.move_to_end(key)
        if len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)   # evict oldest

    return answer


def generate_narrative(anon: dict) -> Optional[str]:
    """
    2-3 sentence plain-English risk narrative for the vendor detail page.
    Uses a fixed question so responses are maximally cacheable across users
    viewing the same vendor.
    """
    context = build_vendor_context(anon)
    question = (
        "In exactly 2-3 sentences: summarise the top risk drivers for this vendor "
        "and state the single most urgent remediation action. Be specific."
    )
    return cached_ask(question, context)
