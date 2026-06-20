"""
Deterministic AI suggestion engine for VendorLens.

Generates ranked, actionable remediation steps for each vendor based on
their exact risk profile. No external API calls — fully deterministic.

Each suggestion includes:
  - priority: CRITICAL / HIGH / MEDIUM / LOW
  - category: compliance area
  - action: one-line imperative
  - detail: full explanation with numbers
  - score_impact: estimated final-score reduction if action taken
  - effort: LOW / MEDIUM / HIGH
  - timeline: human-readable time estimate
  - framework: governing standard (GDPR / NIST / SOX / ISO)
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any

_PRIORITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
_RATING_RISK = {"AAA": 0, "AA": 1, "A": 2, "BBB": 3, "BB": 4, "B": 5, "CCC": 6, "CC": 7, "C": 8}


def _days_since(date_str: str) -> int:
    try:
        return (date.today() - date.fromisoformat(str(date_str))).days
    except Exception:
        return 9999


def _days_until(date_str: str) -> int:
    try:
        return (date.fromisoformat(str(date_str)) - date.today()).days
    except Exception:
        return 9999


def _parse_breach_list(raw: dict) -> list[dict]:
    try:
        val = raw.get("breach_history") or "[]"
        return json.loads(val) if isinstance(val, str) else []
    except Exception:
        return []


def generate_suggestions(raw: dict, scored: dict) -> list[dict]:
    """
    Return a sorted list of suggestion dicts for a vendor.
    raw   — flat vendor row from DB
    scored — output of score_vendor(raw)
    """
    suggestions: list[dict] = []
    bd = scored.get("score_breakdown", {})

    # ── Compliance: SOC 2 Type II ─────────────────────────────────────────
    if not int(raw.get("soc2_type2") or 0):
        suggestions.append({
            "id": "SOC2_MISSING",
            "priority": "HIGH",
            "category": "Compliance",
            "action": "Request SOC 2 Type II audit engagement",
            "detail": (
                "SOC 2 Type II is absent, adding 20 pts to compliance gap (5 pts final-score impact). "
                "Issue a formal request requiring the vendor to share audit timeline within 30 days "
                "and provide interim security controls documentation (security policy, pentest summary)."
            ),
            "score_impact": -5.0,
            "effort": "HIGH",
            "timeline": "3–6 months",
            "framework": "NIST SA-9 / SOC 2",
        })
    else:
        expiry_str = str(raw.get("soc2_expiry") or "")
        if expiry_str:
            days = _days_until(expiry_str)
            if days < 90:
                priority = "CRITICAL" if days <= 0 else ("HIGH" if days < 30 else "MEDIUM")
                label = "expired" if days <= 0 else f"expires in {days} days"
                suggestions.append({
                    "id": "SOC2_EXPIRING",
                    "priority": priority,
                    "category": "Compliance",
                    "action": f"Renew SOC 2 Type II — {label}",
                    "detail": (
                        f"SOC 2 certificate {label}. An expired cert triggers a 12-pt compliance penalty "
                        "even if the cert previously existed. Confirm renewal audit is underway, obtain a "
                        "bridge letter from auditor, and set a 30-day follow-up."
                    ),
                    "score_impact": -3.0,
                    "effort": "MEDIUM",
                    "timeline": "30–60 days",
                    "framework": "NIST SA-9",
                })

    # ── Compliance: ISO 27001 ─────────────────────────────────────────────
    if not int(raw.get("iso27001") or 0):
        suggestions.append({
            "id": "ISO27001_MISSING",
            "priority": "MEDIUM",
            "category": "Compliance",
            "action": "Request ISO 27001 certification or documented equivalent",
            "detail": (
                "Missing ISO 27001 adds 15 pts to compliance gap (3.75 pts final-score). "
                "If vendor cannot obtain ISO cert, accept a third-party ISMS audit as a documented "
                "equivalent and add the requirement to the next contract renewal."
            ),
            "score_impact": -3.75,
            "effort": "HIGH",
            "timeline": "6–12 months",
            "framework": "ISO/IEC 27001",
        })

    # ── Compliance: GDPR DPA ─────────────────────────────────────────────
    if not int(raw.get("gdpr_dpa") or 0):
        suggestions.append({
            "id": "GDPR_DPA_MISSING",
            "priority": "HIGH",
            "category": "Data Privacy",
            "action": "Execute GDPR Article 28 Data Processing Agreement immediately",
            "detail": (
                "No DPA in place — a GDPR Art.28 violation. Missing DPA adds 18 pts to compliance gap "
                "(4.5 pts final-score). Use standard SG DPA template; target execution within 5 business days. "
                "If vendor processes data outside EU, also execute Standard Contractual Clauses (Art.46)."
            ),
            "score_impact": -4.5,
            "effort": "LOW",
            "timeline": "1 week",
            "framework": "GDPR Art.28",
        })

    # ── Compliance: Breach notification SLA ──────────────────────────────
    sla_h = int(raw.get("breach_notification_sla_hours") or 72)
    if sla_h > 72:
        suggestions.append({
            "id": "BREACH_SLA_HIGH",
            "priority": "MEDIUM",
            "category": "Incident Response",
            "action": f"Renegotiate breach notification SLA to ≤72 hours (current: {sla_h}h)",
            "detail": (
                f"Current contractual SLA is {sla_h}h, exceeding GDPR Art.33's 72-hour supervisory-authority "
                "notification window. Add a clause at next renewal requiring vendor to notify within 24–48h "
                "to allow time for internal escalation before the Art.33 deadline."
            ),
            "score_impact": -2.0,
            "effort": "MEDIUM",
            "timeline": "Next contract renewal",
            "framework": "GDPR Art.33",
        })

    # ── Data exposure: High sensitivity + write access ─────────────────
    sensitivity = str(raw.get("data_sensitivity") or "LOW").upper()
    access_type = str(raw.get("access_type") or "read").lower()
    if sensitivity == "HIGH" and "write" in access_type:
        suggestions.append({
            "id": "HIGH_SENS_RW",
            "priority": "HIGH",
            "category": "Access Control",
            "action": "Restrict vendor to read-only access for HIGH-sensitivity data",
            "detail": (
                "Read-write access to HIGH-sensitivity systems adds ~10 pts to data exposure. "
                "Work with the vendor to remove write permissions unless operationally critical. "
                "If write access is required, implement attribute-based access control and quarterly access reviews."
            ),
            "score_impact": -3.0,
            "effort": "MEDIUM",
            "timeline": "2–4 weeks",
            "framework": "NIST AC-6 (Least Privilege)",
        })

    # ── Data exposure: Non-EU residency ──────────────────────────────────
    if str(raw.get("data_residency") or "EU").lower() == "non-eu":
        suggestions.append({
            "id": "NON_EU_RESIDENCY",
            "priority": "HIGH",
            "category": "Data Privacy",
            "action": "Negotiate EU data residency or execute SCCs/adequacy safeguards",
            "detail": (
                "Non-EU data residency triggers GDPR Chapter V transfer restrictions and adds 15 pts "
                "to exposure score for PII data. Options: (1) request EU-region deployment, "
                "(2) execute Standard Contractual Clauses (Art.46(2)(c)), or (3) verify country adequacy decision."
            ),
            "score_impact": -4.5,
            "effort": "MEDIUM",
            "timeline": "1–3 months",
            "framework": "GDPR Art.44–49",
        })

    # ── Breach history ────────────────────────────────────────────────────
    breach_list = _parse_breach_list(raw)
    if breach_list:
        recent = [b for b in breach_list if _days_since(str(b.get("date", ""))) < 365]
        all_severities = [b.get("severity", "LOW") for b in breach_list]
        worst = ("CRITICAL" if "CRITICAL" in all_severities
                 else "HIGH" if "HIGH" in all_severities
                 else "MEDIUM" if "MEDIUM" in all_severities else "LOW")

        if recent:
            r_sev = [b.get("severity", "LOW") for b in recent]
            r_worst = ("CRITICAL" if "CRITICAL" in r_sev else "HIGH" if "HIGH" in r_sev else "MEDIUM")
            suggestions.append({
                "id": "RECENT_BREACH",
                "priority": "CRITICAL" if r_worst == "CRITICAL" else "HIGH",
                "category": "Incident Response",
                "action": f"Request post-breach remediation evidence for {len(recent)} incident(s) in past 12 months",
                "detail": (
                    f"{len(recent)} breach event(s) detected in the last 12 months (worst severity: {r_worst}). "
                    "Required deliverables: (1) root-cause analysis report, (2) penetration test results post-incident, "
                    "(3) evidence of control improvements, (4) updated incident response runbook."
                ),
                "score_impact": -5.0,
                "effort": "LOW",
                "timeline": "30 days",
                "framework": "NIST IR-6 / GDPR Art.33",
            })

        if len(breach_list) >= 2:
            suggestions.append({
                "id": "REPEAT_BREACH",
                "priority": "HIGH",
                "category": "Governance",
                "action": f"Escalate repeat-breach vendor ({len(breach_list)} total incidents) to senior risk committee",
                "detail": (
                    f"Vendor has {len(breach_list)} recorded breach events, triggering a HIGH override floor. "
                    "Recommend formal risk-acceptance sign-off or active remediation plan with executive sponsor. "
                    "Consider contract exit clauses if no improvement plan within 90 days."
                ),
                "score_impact": -7.0,
                "effort": "MEDIUM",
                "timeline": "30–90 days",
                "framework": "SOX 404 / NIST SA-9",
            })

    # ── Financial health ──────────────────────────────────────────────────
    rating = str(raw.get("financial_rating") or "BBB").strip().upper()
    risk_rank = _RATING_RISK.get(rating, 3)
    if risk_rank >= 5:  # B or worse
        priority = "CRITICAL" if risk_rank >= 6 else "HIGH"
        suggestions.append({
            "id": "FINANCIAL_DISTRESS",
            "priority": priority,
            "category": "Financial Health",
            "action": f"Activate vendor business-continuity contingency plan (rating: {rating})",
            "detail": (
                f"Financial rating {rating} indicates {'severe ' if risk_rank >= 6 else ''}distress. "
                "Immediate actions: (1) Obtain source-code escrow, (2) Identify backup/substitute supplier, "
                "(3) Add step-in rights and insolvency notification clause to contract, "
                "(4) Request quarterly financial reporting."
            ),
            "score_impact": -3.75,
            "effort": "MEDIUM",
            "timeline": "1–2 months",
            "framework": "SOX 404 / NIST CP-2",
        })
    elif risk_rank == 4:  # BB
        suggestions.append({
            "id": "FINANCIAL_WATCH",
            "priority": "MEDIUM",
            "category": "Financial Health",
            "action": f"Place vendor on financial watch list (rating: {rating})",
            "detail": (
                f"Rating {rating} is sub-investment grade (speculative). "
                "Increase monitoring cadence: (1) Quarterly financial review, "
                "(2) Confirm vendor has business interruption insurance, (3) Begin backup-supplier assessment."
            ),
            "score_impact": -1.5,
            "effort": "LOW",
            "timeline": "1 month",
            "framework": "SOX 404",
        })

    # ── Concentration risk ────────────────────────────────────────────────
    conc = str(raw.get("concentration_risk") or "LOW").upper()
    if conc == "HIGH":
        suggestions.append({
            "id": "HIGH_CONCENTRATION",
            "priority": "MEDIUM",
            "category": "Business Continuity",
            "action": "Identify and qualify a backup supplier within 90 days",
            "detail": (
                "HIGH concentration risk means this vendor is a single point of failure. "
                "Actions: (1) Map all critical dependencies on this vendor, "
                "(2) Issue RFI to 2–3 alternative suppliers, "
                "(3) Document transition playbook including data migration and timeline."
            ),
            "score_impact": -6.5,
            "effort": "HIGH",
            "timeline": "3–6 months",
            "framework": "NIST CP-2 / BCM",
        })
    elif conc == "MEDIUM":
        suggestions.append({
            "id": "MEDIUM_CONCENTRATION",
            "priority": "LOW",
            "category": "Business Continuity",
            "action": "Document vendor exit strategy and data portability requirements",
            "detail": (
                "MEDIUM concentration risk. Mitigate by ensuring contract includes: "
                "(1) data portability clause, (2) 90-day transition-assistance obligation, "
                "(3) no lock-in on proprietary formats."
            ),
            "score_impact": -3.0,
            "effort": "LOW",
            "timeline": "Next contract renewal",
            "framework": "NIST CP-2",
        })

    # ── Assessment currency ────────────────────────────────────────────────
    last_assessment = str(raw.get("last_assessment_date") or "")
    if last_assessment:
        age_days = _days_since(last_assessment)
        if age_days > 365:
            overdue_months = round(age_days / 30)
            suggestions.append({
                "id": "STALE_ASSESSMENT",
                "priority": "MEDIUM",
                "category": "Governance",
                "action": f"Schedule annual vendor risk re-assessment ({overdue_months} months overdue)",
                "detail": (
                    f"Last assessment was {age_days} days ago — annual cycle overdue. "
                    "Adds 12 pts to compliance gap (3 pts final-score). "
                    "Actions: (1) Send security questionnaire this week, "
                    "(2) Schedule a 30-min review call, "
                    "(3) Update assessment date in VendorLens on completion."
                ),
                "score_impact": -3.0,
                "effort": "LOW",
                "timeline": "2 weeks",
                "framework": "NIST SA-9",
            })

    # ── Contract expiry ────────────────────────────────────────────────────
    contract_end = str(raw.get("contract_end") or "")
    access_last = str(raw.get("access_last_used_at") or "")
    if contract_end:
        days_to_expiry = _days_until(contract_end)
        if days_to_expiry < 0:
            days_overdue = abs(days_to_expiry)
            if _days_since(access_last) < 90:
                suggestions.append({
                    "id": "CONTRACT_EXPIRED_ACTIVE",
                    "priority": "CRITICAL",
                    "category": "Governance",
                    "action": f"URGENT: Contract expired {days_overdue}d ago but vendor access is still active",
                    "detail": (
                        f"Contract expired {days_overdue} days ago yet access was used within the last 90 days. "
                        "This triggers a CRITICAL override (score floor 95). "
                        "Immediate actions: (1) Suspend access pending contract renewal or formal termination, "
                        "(2) Obtain emergency legal review, (3) Expedite renewal negotiation."
                    ),
                    "score_impact": -30.0,
                    "effort": "LOW",
                    "timeline": "Immediate (24–48 hours)",
                    "framework": "SOX 404 / GDPR Art.28",
                })
        elif days_to_expiry < 60:
            suggestions.append({
                "id": "CONTRACT_EXPIRING",
                "priority": "HIGH" if days_to_expiry < 30 else "MEDIUM",
                "category": "Governance",
                "action": f"Initiate contract renewal — expires in {days_to_expiry} days",
                "detail": (
                    f"Contract expires in {days_to_expiry} days. "
                    "Begin renewal 60 days before expiry to allow time for legal review and negotiation. "
                    "Use renewal as an opportunity to add updated GDPR, SLA, and exit-rights clauses."
                ),
                "score_impact": -2.0,
                "effort": "MEDIUM",
                "timeline": f"{min(days_to_expiry, 30)} days",
                "framework": "SOX 404",
            })

    # ── Under investigation ────────────────────────────────────────────────
    if int(raw.get("under_investigation") or 0):
        suggestions.append({
            "id": "UNDER_INVESTIGATION",
            "priority": "CRITICAL",
            "category": "Governance",
            "action": "Convene emergency risk committee — vendor under active investigation",
            "detail": (
                "Vendor is flagged as under active investigation, triggering a CRITICAL override (score floor 92). "
                "Required actions: (1) Obtain investigation details from vendor in writing, "
                "(2) Evaluate whether to suspend access pending outcome, "
                "(3) Review indemnity/liability clauses, "
                "(4) Prepare board notification if systemic risk identified."
            ),
            "score_impact": -50.0,
            "effort": "LOW",
            "timeline": "Immediate",
            "framework": "SOX 404 / GDPR Art.33",
        })

    # ── Sub-processors ─────────────────────────────────────────────────────
    sub_count = int(raw.get("sub_processor_count") or 0)
    if sub_count >= 5:
        suggestions.append({
            "id": "HIGH_SUBPROCESSORS",
            "priority": "MEDIUM",
            "category": "Data Privacy",
            "action": f"Obtain sub-processor list and flow-down DPA for {sub_count} sub-processors",
            "detail": (
                f"Vendor uses {sub_count} sub-processors. GDPR Art.28(2) requires controller consent "
                "and flow-down obligations. Request: (1) Complete sub-processor list, "
                "(2) Confirmation DPA obligations flow down, "
                "(3) Notification process for sub-processor changes."
            ),
            "score_impact": -2.0,
            "effort": "LOW",
            "timeline": "2–4 weeks",
            "framework": "GDPR Art.28(2)",
        })

    # Sort by priority then score_impact
    suggestions.sort(
        key=lambda s: (_PRIORITY_ORDER.get(s["priority"], 4), s.get("score_impact", 0))
    )
    return suggestions
