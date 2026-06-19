"""
Deterministic Audit Q&A  —  POST /ask
======================================
No LLM. Pipeline:
  1. Intent parse  — attribute + condition + threshold extracted by regex
  2. Vendor name fuzzy match  — find vendor by name fragment if mentioned
  3. Register filter  — apply structured conditions to all rows
  4. Templated answer  — evidence-backed sentences, cites [VID] inline
"""
from __future__ import annotations

import difflib
import json
import re
from datetime import date
from typing import Any

from .db import fetch_all_vendors
from .engine import _safe_date

TODAY = date(2024, 6, 19)

# ── 1. Intent / attribute extraction ─────────────────────────────────────

_ATTRIBUTE_PATTERNS = [
    # compliance certs
    (r"\bsoc\s*2\b",                "soc2"),
    (r"\biso\s*27001\b",            "iso27001"),
    (r"\bgdpr\b|\bdpa\b",           "gdpr_dpa"),
    # risk
    (r"\brisk\s*score\b",           "risk_score"),
    (r"\brisk\s*level\b",           "risk_level"),
    (r"\bcritical\b",               "risk_level_critical"),
    (r"\bhigh\s+risk\b",            "risk_level_high"),
    # breach
    (r"\bbreach\b|\bbreached\b",    "breach"),
    # access
    (r"\bpii\b|\bpersonal\s+data\b|\bfinancial\s+access\b", "pii_access"),
    (r"\borphan\b|\borphaned\b|\baccess.*expir\b|\bstale.*access\b", "orphaned_access"),
    (r"\bread.write\b|\bwrite\s+access\b",   "access_rw"),
    # contract
    (r"\bcontract.*expir\b|\bexpir.*contract\b", "contract_expiry"),
    (r"\brenew\b",                  "contract_renewal"),
    # investigation
    (r"\binvestigat",               "under_investigation"),
    # financial
    (r"\bfinancial\s+rating\b|\bcredit\s+rating\b|\brating\b", "financial_rating"),
    # concentration
    (r"\bconcentration\b",          "concentration_risk"),
    # residency
    (r"\bnon.eu\b|\bdata\s+residency\b|\boffshore\b", "residency"),
    # sub-processors
    (r"\bsub.processor\b",          "sub_processors"),
    # assessment
    (r"\boverrdue\b|\bstale.*assessment\b|\bass?essment.*overdue\b", "stale_assessment"),
    # alerts / general
    (r"\balert\b",                  "alerts"),
    (r"\bcomplian\w+\b",            "compliance"),
]

_DAY_PATTERN   = re.compile(r"(\d+)\s*day", re.I)
_MONTH_PATTERN = re.compile(r"(\d+)\s*month", re.I)
_HOURS_PATTERN = re.compile(r"(\d+)\s*hour", re.I)


def _parse_intent(question: str) -> dict[str, Any]:
    q = question.lower()
    intent: dict[str, Any] = {"raw": question, "attributes": [], "threshold_days": None}

    for pattern, attr in _ATTRIBUTE_PATTERNS:
        if re.search(pattern, q, re.I):
            intent["attributes"].append(attr)

    # Time threshold
    m = _DAY_PATTERN.search(q)
    if m:
        intent["threshold_days"] = int(m.group(1))
    else:
        m2 = _MONTH_PATTERN.search(q)
        if m2:
            intent["threshold_days"] = int(m2.group(1)) * 30

    # Question type
    if re.search(r"\bwhich\b|\bwho\b|\blist\b|\bshow\b|\ball\b", q):
        intent["qtype"] = "list"
    elif re.search(r"\bis\b|\bare\b|\bdoes\b|\bdo\b|\bhas\b|\bhave\b", q):
        intent["qtype"] = "check"
    elif re.search(r"\bhow many\b|\bcount\b", q):
        intent["qtype"] = "count"
    else:
        intent["qtype"] = "list"

    return intent


# ── 2. Fuzzy vendor name match ────────────────────────────────────────────

def _find_vendor_by_name(question: str, rows: list[dict]) -> list[dict]:
    """
    Return rows whose name closely matches a proper-noun fragment in the question.
    Only extracts capitalised tokens; excludes generic stopwords and company suffixes
    to avoid false positives on words like 'Inc', 'Corp', 'Ltd'.
    """
    proper_tokens = re.findall(r"\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*", question)

    STOPWORDS = {"which", "who", "list", "show", "all", "is", "are", "does",
                 "have", "has", "do", "how", "many", "vendors", "vendor",
                 "what", "when", "where", "the", "a", "an", "with", "and",
                 "for", "that", "this", "in", "of", "to", "or", "not"}
    SUFFIXES = {"inc", "ltd", "co", "corp", "llc", "plc", "gmbh", "sa",
                "ag", "bv", "nv", "sas", "services", "solutions", "systems",
                "technologies", "group", "global", "analytics"}

    matched = []
    for row in rows:
        name = row["name"].lower()
        name_tokens = set(name.split())
        meaningful = name_tokens - STOPWORDS - SUFFIXES
        for tok in proper_tokens:
            tok_lower = tok.lower()
            if tok_lower in STOPWORDS or tok_lower in SUFFIXES:
                continue
            # Exact substring: full name in query token or full query token in name
            if tok_lower in name or (len(tok_lower) > 4 and tok_lower in name):
                if row not in matched:
                    matched.append(row)
                break
            # Token-level overlap using MEANINGFUL tokens only (not "Inc", "Ltd")
            tok_words = set(tok_lower.split()) - STOPWORDS - SUFFIXES
            overlap = len(meaningful & tok_words)
            if overlap >= max(1, len(meaningful)):
                if row not in matched:
                    matched.append(row)
                break
            # Sequence similarity — strict threshold
            ratio = difflib.SequenceMatcher(None, tok_lower, name).ratio()
            if ratio > 0.78:
                if row not in matched:
                    matched.append(row)
                break
    return matched


# ── 3. Register filter ────────────────────────────────────────────────────

def _filter(rows: list[dict], intent: dict, vendor_id: str | None) -> list[dict]:
    attrs = set(intent.get("attributes", []))
    days = intent.get("threshold_days") or 90
    result = rows

    if vendor_id:
        result = [r for r in result if r["vendor_id"] == vendor_id]
        return result

    # Try fuzzy name match first
    name_matches = _find_vendor_by_name(intent["raw"], rows)

    # If a specific company seems to be named, restrict to it
    q = intent["raw"].lower()
    # Detect "is <VendorName> compliant" pattern — restrict to matched vendor
    if intent.get("qtype") == "check" and name_matches and len(name_matches) <= 3:
        result = name_matches

    elif attrs:
        conditions = []

        if "soc2" in attrs:
            # no SOC2 OR expiring within threshold
            def soc2_cond(r):
                if not int(r.get("soc2_type2", 0) or 0):
                    return True
                exp = _safe_date(r.get("soc2_expiry"))
                return exp is not None and 0 <= (exp - TODAY).days <= days
            conditions.append(soc2_cond)

        if "iso27001" in attrs:
            conditions.append(lambda r: not int(r.get("iso27001", 0) or 0))

        if "gdpr_dpa" in attrs:
            conditions.append(lambda r: not int(r.get("gdpr_dpa", 0) or 0))

        if "breach" in attrs:
            conditions.append(lambda r: bool(r.get("breach_history")))

        if "pii_access" in attrs:
            conditions.append(lambda r: str(r.get("data_sensitivity", "")).upper() == "HIGH")

        if "orphaned_access" in attrs:
            def orphan_cond(r):
                ce = _safe_date(r.get("contract_end"))
                return ce is not None and ce < TODAY
            conditions.append(orphan_cond)

        if "access_rw" in attrs:
            conditions.append(lambda r: str(r.get("access_type", "")).lower() == "read_write")

        if "contract_expiry" in attrs:
            def ce_cond(r):
                ce = _safe_date(r.get("contract_end"))
                return ce is not None and 0 <= (ce - TODAY).days <= days
            conditions.append(ce_cond)

        if "under_investigation" in attrs:
            conditions.append(lambda r: bool(int(r.get("under_investigation", 0) or 0)))

        if "risk_level_critical" in attrs:
            conditions.append(lambda r: r.get("risk_level") == "CRITICAL")

        if "risk_level_high" in attrs:
            conditions.append(lambda r: r.get("risk_level") in ("CRITICAL", "HIGH"))

        if "residency" in attrs:
            conditions.append(lambda r: str(r.get("data_residency", "EU")) == "non-EU")

        if "stale_assessment" in attrs:
            def stale_cond(r):
                d = _safe_date(r.get("last_assessment_date"))
                return d is not None and (TODAY - d).days > 365
            conditions.append(stale_cond)

        if "concentration_risk" in attrs:
            conditions.append(
                lambda r: str(r.get("concentration_risk", "")).upper() == "HIGH"
            )

        if conditions:
            # AND all conditions
            result = [r for r in rows if all(c(r) for c in conditions)]

    # Sort by risk_score desc
    result.sort(key=lambda r: r.get("risk_score") or 0, reverse=True)
    return result[:25]


# ── 4. Templated answer builder ───────────────────────────────────────────

def _cert_status(r: dict, cert: str) -> str:
    if cert == "soc2":
        has = bool(int(r.get("soc2_type2", 0) or 0))
        exp = _safe_date(r.get("soc2_expiry"))
        if not has:
            return "No SOC 2 Type II"
        if exp and exp < TODAY:
            return f"SOC 2 EXPIRED ({exp.isoformat()})"
        if exp:
            days = (exp - TODAY).days
            return f"SOC 2 valid (expires {exp.isoformat()}, {days}d)"
        return "SOC 2 valid (no expiry recorded)"
    if cert == "iso27001":
        return "ISO 27001 certified" if int(r.get("iso27001", 0) or 0) else "No ISO 27001"
    if cert == "gdpr_dpa":
        return "GDPR DPA in place" if int(r.get("gdpr_dpa", 0) or 0) else "No GDPR DPA"
    return ""


def _format_row(r: dict, attrs: set) -> str:
    vid = r["vendor_id"]
    name = r["name"]
    parts = [f"[{vid}] {name}"]

    if "compliance" in attrs or "soc2" in attrs:
        parts.append(_cert_status(r, "soc2"))
    if "iso27001" in attrs or "compliance" in attrs:
        parts.append(_cert_status(r, "iso27001"))
    if "gdpr_dpa" in attrs or "compliance" in attrs:
        parts.append(_cert_status(r, "gdpr_dpa"))

    if "breach" in attrs or "pii_access" in attrs:
        bh = r.get("breach_history") or ""
        if bh:
            parts.append(f"breaches: {bh[:120]}")
        else:
            parts.append("no breach history")

    if "orphaned_access" in attrs:
        ce = _safe_date(r.get("contract_end"))
        if ce and ce < TODAY:
            parts.append(f"CONTRACT ENDED {(TODAY - ce).days}d ago — access still active")

    if "contract_expiry" in attrs or "contract_renewal" in attrs:
        ce = _safe_date(r.get("contract_end"))
        if ce:
            days = (ce - TODAY).days
            if days < 0:
                parts.append(f"contract EXPIRED {abs(days)}d ago")
            else:
                parts.append(f"contract ends in {days}d ({ce.isoformat()})")

    if "under_investigation" in attrs:
        inv = bool(int(r.get("under_investigation", 0) or 0))
        parts.append("UNDER INVESTIGATION" if inv else "not under investigation")

    if "financial_rating" in attrs:
        parts.append(f"financial rating: {r.get('financial_rating','?')}")

    if "concentration_risk" in attrs:
        parts.append(f"concentration: {r.get('concentration_risk','?')}")

    if "residency" in attrs:
        parts.append(f"residency: {r.get('data_residency','EU')}")

    if "sub_processors" in attrs:
        parts.append(f"sub-processors: {r.get('sub_processor_count', 0)}")

    if not any(p in attrs for p in (
        "compliance","soc2","iso27001","gdpr_dpa","breach","pii_access",
        "orphaned_access","contract_expiry","under_investigation",
        "financial_rating","concentration_risk","residency","sub_processors"
    )):
        parts.append(
            f"risk={r.get('risk_level','?')} score={r.get('risk_score','?')} rag={r.get('rag','?')}"
        )

    return " | ".join(parts)


def _build_answer(intent: dict, matched: list[dict], all_rows: list[dict]) -> str:
    attrs = set(intent.get("attributes", []))
    qtype = intent.get("qtype", "list")
    q = intent["raw"]

    if not matched:
        return f"No vendors in the register match the query: '{q}'."

    lines = []

    if qtype == "count":
        lines.append(f"{len(matched)} vendor(s) match '{q}':")

    elif qtype == "check" and len(matched) == 1:
        r = matched[0]
        # Generate a full compliance narrative for single-vendor check
        vid, name = r["vendor_id"], r["name"]
        soc2 = bool(int(r.get("soc2_type2", 0) or 0))
        iso  = bool(int(r.get("iso27001", 0) or 0))
        gdpr = bool(int(r.get("gdpr_dpa", 0) or 0))
        exp  = _safe_date(r.get("soc2_expiry"))
        rl   = r.get("risk_level", "?")

        verdict = "COMPLIANT" if (soc2 and iso and gdpr and (not exp or exp > TODAY)) else "NOT FULLY COMPLIANT"
        lines.append(f"[{vid}] {name}: {verdict}")
        lines.append(f"  SOC 2 Type II: {'Yes' if soc2 else 'No'}" +
                     (f" — expires {exp.isoformat()} ({(exp-TODAY).days}d)" if soc2 and exp else ""))
        lines.append(f"  ISO 27001:     {'Yes' if iso else 'No'}")
        lines.append(f"  GDPR DPA:      {'Yes' if gdpr else 'No'}")
        lines.append(f"  Overall risk:  {rl} (score {r.get('risk_score','?')})")
        alerts_raw = r.get("alerts") or "[]"
        try:
            alerts = json.loads(alerts_raw) if isinstance(alerts_raw, str) else alerts_raw
        except Exception:
            alerts = []
        if alerts:
            lines.append(f"  Active alerts: {'; '.join(alerts)}")
        return "\n".join(lines)

    for r in matched:
        lines.append(_format_row(r, attrs))

    # Summary line
    if len(matched) > 1:
        lines.insert(0, f"{len(matched)} vendor(s) found:")

    return "\n".join(lines)


# ── Public entry point ────────────────────────────────────────────────────

def answer_question(
    question: str,
    vendor_id: str | None = None,
    api_key: str | None = None,   # kept for signature compat; ignored
) -> dict:
    all_rows = [dict(r) for r in fetch_all_vendors()]
    intent   = _parse_intent(question)
    matched  = _filter(all_rows, intent, vendor_id)
    answer   = _build_answer(intent, matched, all_rows)
    sources  = [r["vendor_id"] for r in matched]
    return {"answer": answer, "sources": sources}
