"""
Security Assessment Parser
==========================
Parses vendor security questionnaire responses (SIG, CAIQ, custom formats)
and structured audit report text. No LLM — regex + keyword scoring.
Returns a structured risk profile that can feed directly into the scoring engine.

GDPR Art. 28 / NIST SA-9: Documents vendor security posture from self-assessments.
"""
from __future__ import annotations

import re
from typing import Any


# ── Question-answer block extractor ──────────────────────────────────────────

def _extract_qa_blocks(text: str) -> list[dict]:
    """Extract Q/A pairs from common questionnaire formats."""
    blocks = []
    patterns = [
        # "Q: ... A: ..." or "Question: ... Answer: ..."
        re.compile(r"(?:Q(?:uestion)?)\s*[\d.]*\s*[:\-]\s*(.+?)\s*(?:A(?:nswer)?)\s*[:\-]\s*(.+?)(?=(?:Q(?:uestion)?)\s*[\d.]*\s*[:\-]|\Z)", re.S | re.I),
        # Numbered: "1. Do you ... Yes/No ..."
        re.compile(r"(\d+[\.\)]\s+[A-Z][^\n]{10,120})\s*\n\s*(Yes|No|N/A|Partial|Not applicable)[^\n]*", re.I),
    ]
    for pat in patterns:
        for m in pat.finditer(text):
            blocks.append({"question": m.group(1).strip(), "answer": m.group(2).strip()})
    return blocks


# ── Control area detection ────────────────────────────────────────────────────

_CONTROL_PATTERNS = [
    # Access control
    ("access_control", re.compile(r"multi.factor|MFA|two.factor|2FA|role.based|RBAC|least.privilege|access.review", re.I)),
    # Encryption
    ("encryption", re.compile(r"encrypt(?:ion|ed|s)?\b[^\n]{0,60}(?:AES|TLS|256.bit|at.rest|in.transit|E2E)", re.I)),
    # Incident response
    ("incident_response", re.compile(r"incident\s+response\s+plan|CSIRT|SIRT|security\s+incident\s+procedure", re.I)),
    # Vulnerability management
    ("vulnerability_mgmt", re.compile(r"penetration\s+test|vuln(?:erability)?\s+scan|patch\s+management|CVE", re.I)),
    # Backup & DR
    ("backup_dr", re.compile(r"backup|disaster\s+recovery|DR\s+plan|RTO|RPO|business\s+continuity", re.I)),
    # Audit logging
    ("audit_logging", re.compile(r"audit\s+log|SIEM|event\s+log|monitoring\s+and\s+logging|SOC\s+monitoring", re.I)),
    # Personnel security
    ("personnel_security", re.compile(r"background\s+check|security\s+awareness|training|employee\s+vetting", re.I)),
    # Third-party risk
    ("third_party_mgmt", re.compile(r"sub.?processor|third.party\s+assessment|vendor\s+risk|supply\s+chain", re.I)),
]

_NEGATIVE_INDICATORS = re.compile(
    r"\b(no\b|not\b|lack|none|without|do\s+not|does\s+not|have\s+not|has\s+not|"
    r"currently\s+(?:no|not)|not\s+(?:yet|currently|implemented|in\s+place))\b",
    re.I,
)


def _detect_controls(text: str) -> dict[str, Any]:
    controls = {}
    for name, pat in _CONTROL_PATTERNS:
        m = pat.search(text)
        if m:
            window = text[max(0, m.start() - 80):m.end() + 80]
            negative = bool(_NEGATIVE_INDICATORS.search(window))
            controls[name] = {
                "present": not negative,
                "evidence": window.replace("\n", " ").strip()[:200],
            }
        else:
            controls[name] = {"present": False, "evidence": None}
    return controls


# ── Certification mentions ────────────────────────────────────────────────────

def _extract_cert_mentions(text: str) -> dict[str, Any]:
    certs = {}
    cert_patterns = {
        "soc2_type2": re.compile(r"SOC\s*2\s+Type\s+II|SOC2\s+Type\s*2", re.I),
        "iso27001": re.compile(r"ISO\s*/?27001", re.I),
        "iso27701": re.compile(r"ISO\s*/?27701", re.I),
        "pci_dss": re.compile(r"PCI[- ]DSS|PCI\s+DSS", re.I),
        "csa_star": re.compile(r"CSA\s+STAR", re.I),
        "fedramp": re.compile(r"FedRAMP", re.I),
    }
    for cert, pat in cert_patterns.items():
        m = pat.search(text)
        if m:
            window = text[max(0, m.start() - 60):m.end() + 100]
            expired = bool(re.search(r"expir|lapsed|revoked|not\s+current", window, re.I))
            certs[cert] = {
                "mentioned": True,
                "expired_or_lapsed": expired,
                "evidence": window.replace("\n", " ").strip()[:200],
            }
        else:
            certs[cert] = {"mentioned": False, "expired_or_lapsed": False, "evidence": None}
    return certs


# ── Risk gap scoring ──────────────────────────────────────────────────────────

def _compute_assessment_risk(controls: dict, certs: dict, qa_blocks: list) -> dict:
    gaps = []
    score_penalty = 0.0

    critical_controls = ["access_control", "encryption", "incident_response"]
    for ctrl in critical_controls:
        if not controls.get(ctrl, {}).get("present"):
            gaps.append(f"Missing critical control: {ctrl.replace('_', ' ').title()}")
            score_penalty += 15.0

    other_controls = ["vulnerability_mgmt", "backup_dr", "audit_logging", "personnel_security"]
    for ctrl in other_controls:
        if not controls.get(ctrl, {}).get("present"):
            gaps.append(f"No evidence of: {ctrl.replace('_', ' ').title()}")
            score_penalty += 7.0

    if not certs.get("soc2_type2", {}).get("mentioned"):
        gaps.append("SOC 2 Type II not mentioned in assessment")
        score_penalty += 10.0

    # Negative QA answers
    neg_count = sum(
        1 for b in qa_blocks
        if re.search(r"^(No|N/A|Not applicable)$", b.get("answer", ""), re.I)
    )
    if neg_count > 5:
        gaps.append(f"{neg_count} negative/N-A responses in questionnaire")
        score_penalty += min(neg_count * 2.0, 20.0)

    return {
        "risk_penalty": round(min(score_penalty, 100.0), 1),
        "gaps": gaps,
        "controls_present": [k for k, v in controls.items() if v.get("present")],
        "controls_missing": [k for k, v in controls.items() if not v.get("present")],
    }


# ── Main entry point ──────────────────────────────────────────────────────────

def parse_security_assessment(text: str, vendor_id: str | None = None) -> dict:
    """
    Parse free-form security questionnaire / audit report text.
    Returns structured fields: controls, certs, gaps, risk_penalty.

    Complies with NIST SP 800-53 SA-9 (third-party assessments) and
    GDPR Art. 28 (processor security documentation requirements).
    """
    qa_blocks = _extract_qa_blocks(text)
    controls = _detect_controls(text)
    certs = _extract_cert_mentions(text)
    risk_summary = _compute_assessment_risk(controls, certs, qa_blocks)

    return {
        "vendor_id": vendor_id,
        "extraction_method": "regex_keyword",
        "qa_pairs_found": len(qa_blocks),
        "controls": controls,
        "certifications": certs,
        "risk_summary": risk_summary,
        "compliance_notes": {
            "gdpr_art28": "Assessment documents vendor technical/organisational measures as required by GDPR Art. 28",
            "nist_sa9": "Covers third-party security requirements per NIST SP 800-53 SA-9",
        },
    }