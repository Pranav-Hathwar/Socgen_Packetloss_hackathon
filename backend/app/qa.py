"""
Audit Q&A  —  POST /ask
========================
1. Parse the natural-language question into a structured filter.
2. Apply the filter over the live vendor register.
3. Build a grounded context string.
4. Call claude-opus-4-8 to produce a cited, auditor-grade answer.
"""
from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta
from typing import Any

import anthropic

from .db import fetch_all_vendors
from .engine import _safe_date

TODAY = date(2024, 6, 19)

# ── Step 1: heuristic question → filter ──────────────────────────────────

def _parse_question_to_filter(question: str) -> dict[str, Any]:
    """
    Extract lightweight structured filters from the question text.
    These narrow the vendor set before we call the LLM.
    """
    q = question.lower()
    filters: dict[str, Any] = {}

    # Specific vendor name / id mentioned?
    # We'll handle this by passing all vendors and letting LLM focus,
    # but flag potential vendor name mentions for context narrowing.
    filters["_raw_question"] = question

    # Compliance checks
    if any(w in q for w in ["compliant", "compliance", "certified", "certification"]):
        filters["_topic"] = "compliance"
    if "soc" in q and "2" in q:
        filters["_cert"] = "soc2"
    if "iso" in q and "27001" in q:
        filters["_cert"] = "iso27001"
    if "gdpr" in q or "dpa" in q:
        filters["_cert"] = "gdpr"

    # Access / breach questions
    if "breach" in q:
        filters["_topic"] = "breach"
    if "pii" in q or "personal data" in q:
        filters["_sensitivity"] = "HIGH"
    if "access" in q and ("expire" in q or "orphan" in q or "revok" in q):
        filters["_topic"] = "orphaned_access"

    # Expiry questions
    if "expir" in q:
        filters["_topic"] = "expiry"
        m = re.search(r"(\d+)\s*day", q)
        if m:
            filters["_expiry_days"] = int(m.group(1))
        else:
            filters["_expiry_days"] = 90  # default

    # Risk level
    for level in ("critical", "high", "medium", "low"):
        if level in q:
            filters["_risk_level"] = level.upper()
            break

    # Financial
    if "financial" in q or "rating" in q or "credit" in q:
        filters["_topic"] = "financial"

    return filters


# ── Step 2: filter vendors ────────────────────────────────────────────────

def _filter_vendors(rows: list[dict], filters: dict, vendor_id: str | None) -> list[dict]:
    """Narrow down vendor rows based on parsed filters."""
    # If a specific vendor_id is provided, only include that vendor
    if vendor_id:
        rows = [r for r in rows if r["vendor_id"] == vendor_id]
        return rows

    topic = filters.get("_topic", "")
    risk_level = filters.get("_risk_level")
    cert = filters.get("_cert")
    expiry_days = filters.get("_expiry_days")
    sensitivity = filters.get("_sensitivity")

    filtered = rows

    if risk_level:
        filtered = [r for r in filtered if r.get("risk_level") == risk_level]

    if cert == "soc2":
        filtered = [r for r in filtered if not int(r.get("soc2_type2", 1) or 1)]
        # Also include those with expiring SOC2
        expiring = []
        for r in rows:
            exp = _safe_date(r.get("soc2_expiry"))
            if exp and 0 <= (exp - TODAY).days <= (expiry_days or 90):
                expiring.append(r)
        combined_ids = {r["vendor_id"] for r in filtered} | {r["vendor_id"] for r in expiring}
        filtered = [r for r in rows if r["vendor_id"] in combined_ids]

    if cert == "iso27001":
        filtered = [r for r in filtered if not int(r.get("iso27001", 1) or 1)]

    if cert == "gdpr":
        filtered = [r for r in filtered if not int(r.get("gdpr_dpa", 1) or 1)]

    if sensitivity:
        filtered = [r for r in filtered if str(r.get("data_sensitivity", "")).upper() == sensitivity]

    if topic == "breach":
        filtered = [r for r in filtered if r.get("breach_history")]

    if topic == "orphaned_access":
        orphaned = []
        for r in rows:
            contract_end = _safe_date(r.get("contract_end"))
            if contract_end and contract_end < TODAY:
                orphaned.append(r)
        filtered = orphaned

    if topic == "expiry" and expiry_days:
        expiring = []
        for r in rows:
            exp = _safe_date(r.get("soc2_expiry"))
            contract_end = _safe_date(r.get("contract_end"))
            if (exp and 0 <= (exp - TODAY).days <= expiry_days) or \
               (contract_end and 0 <= (contract_end - TODAY).days <= expiry_days):
                expiring.append(r)
        if expiring:
            filtered = expiring

    # If filters yielded nothing meaningful, return all (LLM will handle focus)
    if not filtered:
        filtered = rows

    return filtered[:20]  # cap at 20 for context window


# ── Step 3: build grounded context ───────────────────────────────────────

def _build_context(vendors: list[dict]) -> tuple[str, list[str]]:
    """Format vendor data as a compact context block. Returns (text, vendor_ids)."""
    lines = []
    vendor_ids = []
    for r in vendors:
        vid = r["vendor_id"]
        vendor_ids.append(vid)
        alerts_raw = r.get("alerts") or "[]"
        try:
            alerts = json.loads(alerts_raw) if isinstance(alerts_raw, str) else alerts_raw
        except Exception:
            alerts = []
        risk_factors_raw = r.get("risk_factors") or "[]"
        try:
            risk_factors = json.loads(risk_factors_raw) if isinstance(risk_factors_raw, str) else risk_factors_raw
        except Exception:
            risk_factors = []

        exp = _safe_date(r.get("soc2_expiry"))
        exp_str = exp.isoformat() if exp else "N/A"
        contract_end = _safe_date(r.get("contract_end"))
        cend_str = contract_end.isoformat() if contract_end else "N/A"

        lines.append(
            f"[{vid}] {r['name']} | category={r.get('category','')} "
            f"| sensitivity={r.get('data_sensitivity','')} "
            f"| access={r.get('access_type','')} "
            f"| soc2={r.get('soc2_type2',0)} soc2_expiry={exp_str} "
            f"| iso27001={r.get('iso27001',0)} "
            f"| gdpr_dpa={r.get('gdpr_dpa',0)} "
            f"| contract_end={cend_str} "
            f"| risk_score={r.get('risk_score','?')} risk_level={r.get('risk_level','?')} rag={r.get('rag','?')} "
            f"| breach_history={r.get('breach_history','') or 'none'} "
            f"| financial_rating={r.get('financial_rating','')} "
            f"| residency={r.get('data_residency','EU')} "
            f"| sub_processors={r.get('sub_processor_count',0)} "
            f"| concentration_risk={r.get('concentration_risk','LOW')} "
            f"| under_investigation={r.get('under_investigation',0)} "
            f"| alerts={alerts} "
            f"| risk_factors={risk_factors}"
        )
    return "\n".join(lines), vendor_ids


QA_SYSTEM = """\
You are VendorLens AI, an expert third-party risk analyst for a European bank.
You answer auditor questions about vendor risk using ONLY the vendor data provided.
Rules:
- Cite vendor_ids in square brackets e.g. [V013] for every factual claim.
- Be direct and specific. No hedging.
- Flag regulatory concerns (GDPR, DORA, EBA guidelines) when relevant.
- If the data does not contain enough information to answer, say so explicitly.
- Keep answers under 300 words unless the question requires detail.
"""

QA_USER = """\
Question: {question}

Vendor register context (filtered to relevant vendors):
{context}

Answer the question using ONLY the data above. Cite vendor IDs.
"""


def answer_question(
    question: str,
    vendor_id: str | None = None,
    api_key: str | None = None,
) -> dict:
    api_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")

    all_rows = [dict(r) for r in fetch_all_vendors()]

    filters = _parse_question_to_filter(question)
    relevant = _filter_vendors(all_rows, filters, vendor_id)
    context, cited_ids = _build_context(relevant)

    if not api_key:
        # Fallback: rule-based answer from filtered data
        return _rule_based_answer(question, relevant, cited_ids)

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=1024,
        system=QA_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": QA_USER.format(question=question, context=context),
            }
        ],
    )
    answer = message.content[0].text.strip()
    return {"answer": answer, "sources": cited_ids}


def _rule_based_answer(question: str, vendors: list[dict], cited_ids: list[str]) -> dict:
    """Fallback when no API key — produce a structured text answer from data."""
    q = question.lower()
    lines = []

    if "compliant" in q or "soc" in q:
        for v in vendors:
            soc = bool(int(v.get("soc2_type2", 0) or 0))
            iso = bool(int(v.get("iso27001", 0) or 0))
            gdpr = bool(int(v.get("gdpr_dpa", 0) or 0))
            exp = _safe_date(v.get("soc2_expiry"))
            exp_str = f" (expires {exp.isoformat()})" if exp else ""
            lines.append(
                f"[{v['vendor_id']}] {v['name']}: "
                f"SOC2={'Yes'+exp_str if soc else 'No'}, "
                f"ISO27001={'Yes' if iso else 'No'}, "
                f"GDPR DPA={'Yes' if gdpr else 'No'}"
            )
    else:
        for v in vendors:
            lines.append(
                f"[{v['vendor_id']}] {v['name']}: "
                f"risk={v.get('risk_level','?')} score={v.get('risk_score','?')}"
            )

    answer = "\n".join(lines) if lines else "No vendors matched the query."
    return {"answer": answer, "sources": cited_ids}
