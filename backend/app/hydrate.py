"""
Convert a raw SQLite row (dict) into fully-typed Pydantic VendorScore /
VendorSummary objects, re-running the engine if scores are stale.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from .engine import score_vendor, _parse_breaches, _safe_date
from .enrichment import enrich
from .schema import (
    AccessType,
    AlertItem,
    BreachEvent,
    Compliance,
    ConcentrationRisk,
    DataAccess,
    DataResidency,
    DataSensitivity,
    RAG,
    Recommendation,
    RiskLevel,
    ScoreBreakdown,
    VendorScore,
    VendorSummary,
)


def _str_list(val: Any) -> list[str]:
    if not val:
        return []
    if isinstance(val, list):
        return val
    try:
        parsed = json.loads(val)
        if isinstance(parsed, list):
            return [str(x) for x in parsed]
    except (json.JSONDecodeError, TypeError):
        pass
    return [s.strip() for s in str(val).split(",") if s.strip()]


def _json_list(val: Any) -> list[str]:
    if not val:
        return []
    try:
        return json.loads(val)
    except Exception:
        return []


def row_to_vendor_score(raw: dict[str, Any]) -> VendorScore:
    """Hydrate a DB row into a VendorScore, scoring on-the-fly if needed."""
    # Re-score if not yet scored
    if raw.get("risk_score") is None:
        scored = score_vendor(raw)
        enriched = scored["_enriched"]
    else:
        scored = {
            "risk_score": raw["risk_score"],
            "risk_level": raw["risk_level"],
            "rag": raw["rag"],
            "score_breakdown": json.loads(raw["score_breakdown"] or "{}"),
            "risk_factors": json.loads(raw["risk_factors"] or "[]"),
            "anomaly_flags": json.loads(raw["anomaly_flags"] or "[]"),
            "recommendation": {
                "action": raw["recommendation_action"] or "MONITOR",
                "detail": raw["recommendation_detail"] or "",
            },
            "alerts": json.loads(raw["alerts"] or "[]"),
        }
        enriched = enrich(raw)

    # Parse breach history
    breach_raw = str(raw.get("breach_history", "") or "")
    breaches = _parse_breaches(breach_raw)
    breach_events = [
        BreachEvent(
            date=b["date"],
            severity=b["severity"],
            description=b["description"],
        )
        for b in breaches
    ]

    # Systems list
    systems = [s.strip() for s in str(raw.get("systems", "") or "").split(",") if s.strip()]

    # access_last_used_at
    alu_raw = str(enriched.get("access_last_used_at", "") or "")
    try:
        access_last_used = datetime.fromisoformat(alu_raw)
    except ValueError:
        access_last_used = datetime(2024, 1, 1)

    # Dates
    def _d(val: Any) -> date:
        d = _safe_date(val)
        return d if d else date(2024, 1, 1)

    sb = scored["score_breakdown"]
    if isinstance(sb, str):
        sb = json.loads(sb)

    return VendorScore(
        vendor_id=raw["vendor_id"],
        name=raw["name"],
        category=raw.get("category", ""),
        contact_name=raw.get("contact_name") or None,
        contact_email=raw.get("contact_email") or None,
        contract_start=_d(raw.get("contract_start")),
        contract_end=_d(raw.get("contract_end")),
        data_access=DataAccess(
            systems=systems,
            data_sensitivity=DataSensitivity(
                str(raw.get("data_sensitivity", "LOW")).upper()
            ),
            access_type=AccessType(
                str(raw.get("access_type", "read")).lower()
            ),
            access_last_used_at=access_last_used,
        ),
        data_residency=DataResidency(
            str(enriched.get("data_residency", "EU"))
        ),
        sub_processor_count=int(enriched.get("sub_processor_count", 0) or 0),
        concentration_risk=ConcentrationRisk(
            str(raw.get("concentration_risk", "LOW")).upper()
        ),
        last_assessment_date=_d(enriched.get("last_assessment_date")),
        compliance=Compliance(
            soc2_type2=bool(int(raw.get("soc2_type2", 0) or 0)),
            soc2_expiry=_safe_date(raw.get("soc2_expiry")),
            iso27001=bool(int(raw.get("iso27001", 0) or 0)),
            gdpr_dpa=bool(int(raw.get("gdpr_dpa", 0) or 0)),
            breach_notification_sla_hours=int(
                raw.get("breach_notification_sla_hours", 72) or 72
            ),
        ),
        breach_history=breach_events,
        financial_rating=str(raw.get("financial_rating", "BBB") or "BBB"),
        risk_score=float(scored["risk_score"]),
        risk_level=RiskLevel(scored["risk_level"]),
        rag=RAG(scored["rag"]),
        score_breakdown=ScoreBreakdown(
            data_exposure=float(sb.get("data_exposure", 0)),
            compliance_gaps=float(sb.get("compliance_gaps", 0)),
            breach_history=float(sb.get("breach_history", 0)),
            financial_health=float(sb.get("financial_health", 0)),
            concentration=float(sb.get("concentration", 0)),
        ),
        risk_factors=_json_list(scored.get("risk_factors", [])),
        anomaly_flags=_json_list(scored.get("anomaly_flags", [])),
        recommendation=Recommendation(
            action=scored["recommendation"]["action"],
            detail=scored["recommendation"]["detail"],
        ),
        alerts=_json_list(scored.get("alerts", [])),
    )


def row_to_summary(raw: dict[str, Any]) -> VendorSummary:
    return VendorSummary(
        vendor_id=raw["vendor_id"],
        name=raw["name"],
        category=raw.get("category", ""),
        risk_score=float(raw.get("risk_score") or 0),
        risk_level=RiskLevel(raw.get("risk_level") or "LOW"),
        rag=RAG(raw.get("rag") or "GREEN"),
        alerts=_json_list(raw.get("alerts")),
    )
