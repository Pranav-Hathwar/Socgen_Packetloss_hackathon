"""
Contract extraction — pdfplumber text + regex/keyword patterns.
No LLM. Returns structured fields each with the matched evidence snippet.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pdfplumber


# ── PDF → text ────────────────────────────────────────────────────────────

def extract_text_from_pdf(pdf_path: str | Path) -> str:
    pages = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n\n".join(pages)


# ── Pattern library ───────────────────────────────────────────────────────

# Each entry: (field_name, compiled_regex, value_extractor_fn)
# value_extractor_fn(match) -> (value, evidence_snippet)

def _window(text: str, pos: int, radius: int = 120) -> str:
    """Return a ±radius char snippet around pos."""
    start = max(0, pos - radius)
    end   = min(len(text), pos + radius)
    snippet = text[start:end].replace("\n", " ").strip()
    return f"…{snippet}…"


def _extract_breach_sla(text: str) -> dict[str, Any]:
    """
    Find breach notification SLA in hours.
    Looks for patterns like "notify within 72 hours", "72-hour notification",
    "24 hours of becoming aware", etc.
    """
    patterns = [
        re.compile(
            r"notif(?:y|ication|ied)[^\n]{0,60}?"
            r"(\d+)\s*[-]?\s*(hour|hr|h)\b",
            re.I,
        ),
        re.compile(
            r"(\d+)\s*[-]?\s*(hour|hr|h)[^\n]{0,40}?notif",
            re.I,
        ),
        re.compile(
            r"within\s+(\d+)\s*(hour|hr|h)[^\n]{0,40}?(?:breach|incident|aware)",
            re.I,
        ),
        re.compile(
            r"breach[^\n]{0,80}?(\d+)\s*(hour|hr|h)",
            re.I,
        ),
        # Days converted to hours
        re.compile(
            r"notif(?:y|ication)[^\n]{0,60}?(\d+)\s*(?:calendar|business)?\s*day",
            re.I,
        ),
    ]
    for pat in patterns:
        m = pat.search(text)
        if m:
            val = int(m.group(1))
            if "day" in m.group(0).lower():
                val *= 24
            return {
                "value": val,
                "unit": "hours",
                "evidence": _window(text, m.start()),
            }
    return {"value": None, "evidence": None}


def _extract_data_ownership(text: str) -> dict[str, Any]:
    patterns = [
        re.compile(
            r"(?:all\s+)?(?:data|information)[^\n]{0,60}?"
            r"(?:remains?|is|shall\s+be)\s+(?:the\s+)?(?:exclusive\s+)?property\s+of\s+"
            r"(the\s+client|the\s+bank|the\s+customer|vendor|supplier|service\s+provider)",
            re.I,
        ),
        re.compile(
            r"ownership\s+of[^\n]{0,60}?(?:data|information)[^\n]{0,60}?"
            r"(client|bank|customer|vendor|supplier)",
            re.I,
        ),
        re.compile(
            r"(client|bank|customer|vendor|supplier)[^\n]{0,40}?"
            r"(?:retains?|owns?)[^\n]{0,40}?(?:all\s+)?(?:rights?|ownership)[^\n]{0,40}?data",
            re.I,
        ),
    ]
    for pat in patterns:
        m = pat.search(text)
        if m:
            owner_raw = m.group(1).lower()
            if any(w in owner_raw for w in ("client", "bank", "customer")):
                owner = "bank/client"
            elif any(w in owner_raw for w in ("vendor", "supplier", "provider")):
                owner = "vendor"
            else:
                owner = owner_raw
            return {"value": owner, "evidence": _window(text, m.start())}
    return {"value": None, "evidence": None}


def _extract_sub_processors(text: str) -> dict[str, Any]:
    """
    Find named sub-processors or sub-contractor lists.
    Also extracts whether prior approval is required.
    """
    results = []
    approval_required = None

    # Named list after a colon: "sub-processors: AWS EMEA, Google Cloud EU, and MongoDB Atlas"
    # We use finditer and take the LAST match — the sentence preamble
    # ("The Vendor may engage the following sub-processors:") also matches,
    # but the actual named list is the subsequent occurrence.
    list_pat = re.compile(
        r"sub.processors?\s*:\s+"
        r"([A-Z][^\n]{3,200}?)(?:\.|Prior|\n\n|\Z)",
        re.I,
    )
    last_m = None
    for last_m in list_pat.finditer(text):
        pass
    if last_m:
        raw = last_m.group(1)
        names = [n.strip().rstrip(",") for n in re.split(r",\s*|\band\b", raw) if n.strip()]
        SENTENCE_WORDS = {"the", "vendor", "may", "engage", "following", "above",
                          "a", "an", "any", "all", "no", "our", "their"}
        valid = [n for n in names
                 if len(n) > 2 and n.split()[0].lower() not in SENTENCE_WORDS]
        results.extend(valid)

    # Approval requirement — use [\s\S] to allow cross-line matching
    approval_pat = re.compile(
        r"(?:prior\s+)?(?:written\s+)?(?:approval|consent)[\s\S]{0,80}?"
        r"sub.?processor",
        re.I,
    )
    if approval_pat.search(text):
        approval_required = True

    if not results:
        # Check for "no sub-processors" clause
        if re.search(r"(?:shall\s+not|will\s+not|no)[^\n]{0,30}?sub.?processor", text, re.I):
            results = ["none permitted"]
        else:
            results = ["not specified"]

    evidence_m = list_pat.search(text) or approval_pat.search(text)
    return {
        "value": results,
        "prior_approval_required": approval_required,
        "evidence": _window(text, evidence_m.start()) if evidence_m else None,
    }


def _extract_offboarding(text: str) -> dict[str, Any]:
    # Use [\s\S] so patterns can span newlines (contract text is multi-line)
    patterns = [
        re.compile(
            r"(?:termination|expir|end\s+of\s+(?:contract|agreement|term))[\s\S]{0,150}?"
            r"(?:delete|destroy|return|erase|wipe|purge|remov)[\s\S]{0,80}?"
            r"(?:data|information|records?)",
            re.I,
        ),
        re.compile(
            r"(?:delete|destroy|return|erase|wipe|purge)[\s\S]{0,80}?"
            r"(?:data|information|records?)[\s\S]{0,80}?"
            r"(?:termination|expir|end\s+of)",
            re.I,
        ),
        re.compile(
            r"(?:access\s+credentials?[\s\S]{0,30}?)"
            r"(?:revok|terminat|remov|disabl)[\s\S]{0,120}",
            re.I,
        ),
        re.compile(
            r"(?:revok|terminat|remov|disabl)[^\n]{0,40}?access[^\n]{0,120}",
            re.I,
        ),
    ]
    for pat in patterns:
        m = pat.search(text)
        if m:
            snippet_text = m.group(0).replace("\n", " ").strip()
            return {
                "value": snippet_text[:200],
                "evidence": _window(text, m.start()),
            }
    return {"value": None, "evidence": None}


def _extract_data_residency(text: str) -> dict[str, Any]:
    # "data stored/processed within EU/EEA"
    eu_pat = re.compile(
        r"(?:data|information)[^\n]{0,60}?"
        r"(?:stored?|process(?:ed)?|host(?:ed)?|locat(?:ed)?)[^\n]{0,60}?"
        r"(?:within\s+)?(?:the\s+)?"
        r"(?:European\s+Union|EU\b|EEA\b|European\s+Economic\s+Area|Germany|France|Ireland|Netherlands)",
        re.I,
    )
    # Positive non-EU transfer (not negated)
    non_eu_pat = re.compile(
        r"(?:data|information)[^\n]{0,60}?"
        r"(?:stored?|process(?:ed)?|host(?:ed)?|locat(?:ed)?|transfer(?:red)?)[^\n]{0,60}?"
        r"(?:United\s+States|US\b|USA\b|India|China|Singapore|Asia|third\s+countr)",
        re.I,
    )
    # "No transfer outside EEA" / "transfer...outside...EU...without consent" → still EU
    # "transfer...outside...EU" WITHOUT negation → non-EU
    xfer_outside_eu = re.compile(
        r"transfer[^\n]{0,60}?"
        r"(?:outside|beyond)[^\n]{0,40}?"
        r"(?:EU\b|EEA\b|European\s+Union|European\s+Economic\s+Area)",
        re.I,
    )
    neg_xfer = re.compile(
        r"(?:no\s+transfer|shall\s+not\s+transfer|will\s+not\s+transfer)"
        r"[^\n]{0,80}?"
        r"(?:outside|beyond)[^\n]{0,40}?"
        r"(?:EU\b|EEA\b|European\s+Union|European\s+Economic\s+Area)",
        re.I,
    )

    m_eu     = eu_pat.search(text)
    m_non_eu = non_eu_pat.search(text)
    m_xfer   = xfer_outside_eu.search(text)
    m_neg    = neg_xfer.search(text)

    # "No transfer outside EU" is an EU-residency clause
    if m_xfer and not m_neg:
        return {"value": "non-EU", "evidence": _window(text, m_xfer.start())}
    if m_non_eu:
        return {"value": "non-EU", "evidence": _window(text, m_non_eu.start())}
    if m_eu or m_neg:
        m = m_eu or m_neg
        return {"value": "EU", "evidence": _window(text, m.start())}
    return {"value": "unspecified", "evidence": None}


def _extract_audit_rights(text: str) -> dict[str, Any]:
    pat = re.compile(
        r"(?:client|bank|customer)[^\n]{0,60}?"
        r"(?:right|entitl|permit)[^\n]{0,60}?"
        r"(?:audit|inspect|assess|review)",
        re.I,
    )
    m = pat.search(text)
    if m:
        return {"value": True, "evidence": _window(text, m.start())}
    # Negative check
    neg = re.compile(r"no\s+audit|audit\s+rights?\s+(?:are\s+)?not", re.I)
    m2 = neg.search(text)
    if m2:
        return {"value": False, "evidence": _window(text, m2.start())}
    return {"value": None, "evidence": None}


def _extract_governing_law(text: str) -> dict[str, Any]:
    patterns = [
        # "governed by the laws of England and Wales"
        re.compile(
            r"governed\s+by\s+the\s+laws?\s+of\s+([A-Z][A-Za-z\s&]{2,50}?)(?:\.|,|\n|$)",
            re.I,
        ),
        # "subject to the laws of New York"
        re.compile(
            r"subject\s+to\s+(?:the\s+)?laws?\s+of\s+([A-Z][A-Za-z\s&]{2,50}?)(?:\.|,|\n|$)",
            re.I,
        ),
        # "governing law: France"  (after the colon, first non-blank word)
        re.compile(
            r"governing\s+law\s*:\s*([A-Z][A-Za-z\s&]{2,50}?)(?:\.|,|\n|$)",
            re.I,
        ),
    ]
    for pat in patterns:
        m = pat.search(text)
        if m:
            jur = m.group(1).strip().rstrip(".,;")
            return {"value": jur, "evidence": _window(text, m.start())}
    return {"value": None, "evidence": None}


def _detect_key_risks(text: str) -> list[dict]:
    risks = []

    checks = [
        (
            re.compile(r"limitation\s+of\s+liability[^\n]{0,120}", re.I),
            "Liability cap clause detected — may limit compensation in breach scenarios",
        ),
        (
            re.compile(r"indemnif[^\n]{0,80}?(?:exclud|not|no\b)", re.I),
            "Indemnification exclusions present",
        ),
        (
            re.compile(r"(?:unilateral|sole\s+discretion)[^\n]{0,60}?(?:amend|modify|change)", re.I),
            "Vendor retains unilateral right to amend terms — watch for silent changes",
        ),
        (
            re.compile(r"(?:auto|automatically)[^\n]{0,40}?renew", re.I),
            "Auto-renewal clause — contract will extend unless actively cancelled",
        ),
        (
            re.compile(r"(?:no|without)[^\n]{0,30}?(?:audit|inspect)", re.I),
            "Audit rights absent or restricted",
        ),
        (
            re.compile(r"(?:shall\s+not|will\s+not|no)[^\n]{0,30}?notif", re.I),
            "No breach notification obligation found",
        ),
        (
            re.compile(r"perpetual|irrevocable[^\n]{0,60}?licen", re.I),
            "Perpetual/irrevocable licence grant to vendor detected",
        ),
    ]

    for pat, description in checks:
        m = pat.search(text)
        if m:
            risks.append({
                "risk": description,
                "evidence": _window(text, m.start()),
            })

    return risks


# ── Main entry point ──────────────────────────────────────────────────────

def extract_contract_fields(text: str, vendor_id: str | None = None) -> dict:
    """
    Pure regex extraction. Every field carries an 'evidence' key with
    the matched text snippet so auditors can verify without reading the PDF.
    """
    sla       = _extract_breach_sla(text)
    ownership = _extract_data_ownership(text)
    sub_proc  = _extract_sub_processors(text)
    offboard  = _extract_offboarding(text)
    residency = _extract_data_residency(text)
    audit     = _extract_audit_rights(text)
    governing = _extract_governing_law(text)
    risks     = _detect_key_risks(text)

    result = {
        "vendor_id": vendor_id,
        "breach_notification_sla_hours": sla,
        "data_ownership_clause": ownership,
        "sub_processors": sub_proc,
        "offboarding_terms": offboard,
        "data_residency": residency,
        "audit_rights": audit,
        "governing_law": governing,
        "key_risks": risks,
        "extraction_method": "regex",
    }
    return result


def extract_from_pdf(pdf_path: str | Path, vendor_id: str | None = None) -> dict:
    text = extract_text_from_pdf(pdf_path)
    return extract_contract_fields(text, vendor_id=vendor_id)


def extract_from_text(raw_text: str, vendor_id: str | None = None) -> dict:
    """Accept pasted email / contract text directly."""
    return extract_contract_fields(raw_text, vendor_id=vendor_id)
