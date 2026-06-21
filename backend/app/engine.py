"""
VendorLens Scoring Engine
=========================
Produces risk_score (0-100), risk_level, RAG, score_breakdown,
risk_factors, anomaly_flags, recommendation, and alerts from a raw
vendor dict (as loaded from SQLite / CSV).

Design principles
-----------------
- Fully explainable: every point has a named factor in score_breakdown.
- Override rules guarantee CRITICAL recall before the numeric score is
  consulted, so a 58/100 vendor that is under investigation still
  surfaces as CRITICAL.
- Weights are exposed at module level so eval.py can tune them.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

from .enrichment import enrich_scoring_signals

TODAY = date(2026, 6, 21)

# ── Weight table (tune via eval.py) ───────────────────────────────────────
W = {
    "data_sensitivity_base": {
        "LOW": 10.0,
        "MEDIUM": 35.0,
        "HIGH": 65.0,
    },
    "access_type_mult": {
        "read": 1.0,
        "read_write": 1.45,
    },
    "systems_per_extra": 4.0,   # per system beyond 1
    "systems_max_bonus": 25.0,

    # Compliance
    "no_soc2": 20.0,
    "soc2_expired": 18.0,
    "soc2_expiry_90d": 10.0,
    "soc2_expiry_30d": 15.0,
    "no_iso": 8.0,
    "no_gdpr_dpa": 18.0,
    "sla_long": 6.0,            # SLA > 72h

    # Breach
    "breach_base_critical": 40.0,
    "breach_base_high": 28.0,
    "breach_base_medium": 14.0,
    "breach_base_low": 6.0,
    "breach_decay_halflife_days": 365,   # score halves each year
    "breach_access_amp": 1.5,            # amplifier when access is HIGH+RW

    # Financial
    "fin_grade": {
        "AAA": 2.0, "AA": 5.0, "A": 10.0,
        "BBB": 20.0, "BB+": 28.0, "BB": 32.0,
        "B": 50.0, "CCC": 80.0,
    },

    # Concentration
    "concentration": {"HIGH": 30.0, "MEDIUM": 15.0, "LOW": 0.0},

    # Enrichment penalties
    "non_eu_pii": 12.0,
    "high_sub_proc": 8.0,
    "stale_assessment": 6.0,

    # Normalisation cap per factor
    "max_data_exposure": 100.0,
    "max_compliance": 100.0,
    "max_breach": 100.0,
    "max_financial": 100.0,
    "max_concentration": 100.0,

    # Factor weights for final score
    "weight_data_exposure": 0.30,
    "weight_compliance": 0.25,
    "weight_breach": 0.20,
    "weight_financial": 0.15,
    "weight_concentration": 0.10,
}

# ── Helpers ───────────────────────────────────────────────────────────────

def _safe_date(val: Any) -> date | None:
    if not val:
        return None
    try:
        if isinstance(val, date):
            return val
        s = str(val).split("T")[0]
        return date.fromisoformat(s)
    except ValueError:
        return None


def _parse_breaches(raw: str) -> list[dict]:
    """Parse pipe-separated breach records: date|severity|description[|date|…]"""
    events = []
    if not raw:
        return events
    parts = [p.strip() for p in raw.split("|")]
    i = 0
    while i + 2 < len(parts):
        d = _safe_date(parts[i])
        if d:
            events.append({
                "date": d,
                "severity": parts[i + 1].upper(),
                "description": parts[i + 2],
            })
        i += 3
    return events


def _days_since(d: date | None) -> int:
    if d is None:
        return 9999
    return (TODAY - d).days


def _breach_score(events: list[dict], access_type: str, sensitivity: str) -> tuple[float, list[str]]:
    raw = 0.0
    flags = []
    base_map = {
        "CRITICAL": W["breach_base_critical"],
        "HIGH": W["breach_base_high"],
        "MEDIUM": W["breach_base_medium"],
        "LOW": W["breach_base_low"],
    }
    amp = W["breach_access_amp"] if (
        access_type == "read_write" and sensitivity == "HIGH"
    ) else 1.0
    halflife = W["breach_decay_halflife_days"]

    for e in events:
        base = base_map.get(e["severity"], W["breach_base_medium"])
        days = _days_since(e["date"])
        decay = 0.5 ** (days / halflife)
        contribution = base * decay * amp
        raw += contribution
        if days <= 365:
            flags.append(
                f"Breach within 12 months ({e['date'].isoformat()}, {e['severity']}): {e['description']}"
            )
        else:
            flags.append(
                f"Historic breach ({e['date'].isoformat()}, {e['severity']}): {e['description']}"
            )

    return min(raw, W["max_breach"]), flags


def _compliance_score(row: dict) -> tuple[float, list[str]]:
    raw = 0.0
    gaps = []
    soc2 = bool(int(row.get("soc2_type2", 0) or 0))
    iso = bool(int(row.get("iso27001", 0) or 0))
    gdpr = bool(int(row.get("gdpr_dpa", 0) or 0))
    sla = int(row.get("breach_notification_sla_hours", 72) or 72)
    expiry = _safe_date(row.get("soc2_expiry"))
    sensitivity = str(row.get("data_sensitivity", "LOW")).upper()

    if not soc2:
        raw += W["no_soc2"]
        gaps.append("No SOC 2 Type II certification")
    elif expiry:
        days_left = (expiry - TODAY).days
        if days_left < 0:
            raw += W["soc2_expired"]
            gaps.append(f"SOC 2 Type II expired {expiry.isoformat()}")
        elif days_left <= 30:
            raw += W["soc2_expiry_30d"]
            gaps.append(f"SOC 2 Type II expires in {days_left} days ({expiry.isoformat()})")
        elif days_left <= 90:
            raw += W["soc2_expiry_90d"]
            gaps.append(f"SOC 2 Type II expires in {days_left} days ({expiry.isoformat()})")

    if not iso:
        if sensitivity == "HIGH":
            raw += W["no_iso"]
            gaps.append("No ISO 27001 (HIGH sensitivity data)")
        else:
            raw += W["no_iso"] * 0.5

    if not gdpr:
        raw += W["no_gdpr_dpa"]
        gaps.append("No GDPR Data Processing Agreement")

    if sla > 72:
        raw += W["sla_long"]
        gaps.append(f"Breach notification SLA is {sla}h (>72h threshold)")

    return min(raw, W["max_compliance"]), gaps


def _data_exposure_score(row: dict) -> tuple[float, list[str]]:
    sensitivity = str(row.get("data_sensitivity", "LOW")).upper()
    access_type = str(row.get("access_type", "read")).lower()
    systems_raw = str(row.get("systems", ""))
    sys_count = len([s for s in systems_raw.split(",") if s.strip()])

    base = W["data_sensitivity_base"].get(sensitivity, 10.0)
    mult = W["access_type_mult"].get(access_type, 1.0)
    sys_bonus = min(
        (sys_count - 1) * W["systems_per_extra"],
        W["systems_max_bonus"],
    )
    raw = (base * mult) + sys_bonus
    notes = []
    if sensitivity == "HIGH":
        notes.append(f"HIGH sensitivity data ({sys_count} systems, {access_type} access)")
    elif sys_count >= 3:
        notes.append(f"{sys_count} systems with {sensitivity} sensitivity")
    return min(raw, W["max_data_exposure"]), notes


def _financial_score(row: dict) -> tuple[float, list[str]]:
    rating = str(row.get("financial_rating", "BBB")).strip()
    score = W["fin_grade"].get(rating, 35.0)
    notes = []
    if score >= 50:
        notes.append(f"Poor financial rating ({rating})")
    elif score >= 30:
        notes.append(f"Sub-investment grade rating ({rating})")
    return min(score, W["max_financial"]), notes


def _concentration_score(row: dict) -> tuple[float, list[str]]:
    conc = str(row.get("concentration_risk", "LOW")).upper()
    score = W["concentration"].get(conc, 0.0)
    sub_proc = int(row.get("sub_processor_count", 0) or 0)
    notes = []
    if conc == "HIGH":
        notes.append(f"High concentration risk — critical single-vendor dependency")
    if row.get("_high_sub_proc"):
        score = min(score + W["high_sub_proc"], W["max_concentration"])
        notes.append(f"High sub-processor count ({sub_proc}) — supply chain risk")
    return min(score, W["max_concentration"]), notes


# ── Override rules (guarantee CRITICAL recall) ───────────────────────────

def _apply_overrides(row: dict, base_level: str, base_score: float, breaches: list[dict]) -> tuple[str, float, list[str]]:
    """
    Returns (risk_level, risk_score, override_flags).
    Overrides can only escalate — they never lower the level.
    """
    level = base_level
    score = base_score
    flags: list[str] = []
    sensitivity = str(row.get("data_sensitivity", "LOW")).upper()
    access_type = str(row.get("access_type", "read")).lower()
    contract_end = _safe_date(row.get("contract_end"))
    access_last_used = _safe_date(
        str(row.get("access_last_used_at", "")).split("T")[0]
        if row.get("access_last_used_at") else None
    )

    LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

    def escalate(to: str, reason: str, score_floor: float):
        nonlocal level, score
        if LEVELS.index(to) > LEVELS.index(level):
            level = to
            score = max(score, score_floor)
        elif LEVELS.index(level) >= LEVELS.index(to):
            score = max(score, score_floor)
        flags.append(reason)

    # 1. Under investigation → CRITICAL
    if int(row.get("under_investigation", 0) or 0):
        escalate("CRITICAL", "OVERRIDE: Vendor under active investigation", 92.0)

    # 2. Breach in last 12 months AND PII/financial access → CRITICAL
    recent_critical_breach = any(
        e["severity"] in ("CRITICAL", "HIGH") and _days_since(e["date"]) <= 365
        for e in breaches
    )
    if recent_critical_breach and sensitivity == "HIGH" and access_type == "read_write":
        escalate(
            "CRITICAL",
            "OVERRIDE: High/Critical severity breach in last 12 months with HIGH sensitivity read-write access",
            90.0,
        )

    # 3. Contract ended AND access used recently → escalate + isolate flag
    if contract_end and contract_end < TODAY:
        days_since_end = (TODAY - contract_end).days
        if access_last_used and _days_since(access_last_used) <= 90:
            escalate(
                "CRITICAL",
                f"OVERRIDE: Contract expired {days_since_end} days ago but access used {_days_since(access_last_used)} days ago — ISOLATE ACCESS",
                95.0,
            )

    # 4. Expired cert + sensitive data → HIGH floor
    soc2 = bool(int(row.get("soc2_type2", 0) or 0))
    expiry = _safe_date(row.get("soc2_expiry"))
    cert_expired = soc2 and expiry and expiry < TODAY
    if cert_expired and sensitivity == "HIGH":
        escalate(
            "HIGH",
            f"OVERRIDE: SOC 2 expired ({expiry.isoformat()}) with HIGH sensitivity data",
            72.0,
        )

    # 5. Repeat breaches → at minimum HIGH
    if len(breaches) >= 2:
        escalate(
            "HIGH",
            f"OVERRIDE: Repeat breach history ({len(breaches)} events)",
            75.0,
        )

    # 6. Non-EU + PII + no GDPR DPA → HIGH floor
    if row.get("_non_eu_pii") and not int(row.get("gdpr_dpa", 0) or 0):
        escalate(
            "HIGH",
            "OVERRIDE: Non-EU data residency with PII access and no GDPR DPA",
            70.0,
        )

    # 7. No SOC2 + read_write + MEDIUM/HIGH sensitivity → MEDIUM floor
    #    (guarantees zero-cert vendors with write access are never LOW)
    soc2 = bool(int(row.get("soc2_type2", 0) or 0))
    if (not soc2 and access_type == "read_write"
            and sensitivity in ("MEDIUM", "HIGH")):
        escalate(
            "MEDIUM",
            "OVERRIDE: No SOC 2 Type II with read-write access on sensitive data",
            38.0,
        )

    # 8. Concentration risk HIGH → at least MEDIUM
    if str(row.get("concentration_risk", "")).upper() == "HIGH":
        escalate(
            "MEDIUM",
            "OVERRIDE: High concentration risk — single-vendor critical dependency",
            36.0,
        )

    # 9. Contract ending within 30 days → at least MEDIUM
    if contract_end and 0 <= (contract_end - TODAY).days <= 30:
        escalate(
            "MEDIUM",
            f"OVERRIDE: Contract expires in {(contract_end - TODAY).days} days",
            36.0,
        )

    # 10. Stale assessment (>12 months) → at least MEDIUM
    if row.get("_stale_assessment"):
        escalate(
            "MEDIUM",
            "OVERRIDE: Risk assessment overdue — last review >12 months ago",
            36.0,
        )

    # 11. B or worse financial rating + any compliance gap → at least MEDIUM
    fin_score_val = W["fin_grade"].get(str(row.get("financial_rating", "BBB")).strip(), 35.0)
    soc2_ok = bool(int(row.get("soc2_type2", 0) or 0))
    has_compliance_gap = (not soc2_ok) or (not bool(int(row.get("iso27001", 0) or 0))) or (not bool(int(row.get("gdpr_dpa", 0) or 0)))
    soc2_expiry_d = _safe_date(row.get("soc2_expiry"))
    cert_expiring_180 = soc2_ok and soc2_expiry_d and 0 <= (soc2_expiry_d - TODAY).days <= 180
    if fin_score_val >= 50.0 and (has_compliance_gap or cert_expiring_180):
        escalate(
            "MEDIUM",
            f"OVERRIDE: Poor financial rating ({row.get('financial_rating','?')}) combined with compliance gaps",
            36.0,
        )

    return level, min(score, 100.0), flags


# ── Level → RAG mapping ───────────────────────────────────────────────────

def _to_rag(level: str) -> str:
    return {"CRITICAL": "RED", "HIGH": "RED", "MEDIUM": "AMBER", "LOW": "GREEN"}.get(level, "AMBER")


# ── Recommendation ────────────────────────────────────────────────────────

def _recommend(level: str, override_flags: list[str], row: dict) -> dict:
    is_orphaned = any("ISOLATE ACCESS" in f for f in override_flags)
    is_investigated = int(row.get("under_investigation", 0) or 0)
    contract_end = _safe_date(row.get("contract_end"))
    expiry = _safe_date(row.get("soc2_expiry"))

    if is_orphaned:
        return {"action": "ISOLATE_ACCESS", "detail": "Contract expired but access still active. Revoke all system access immediately and initiate offboarding."}
    if is_investigated:
        return {"action": "REPLACE", "detail": "Vendor under active investigation. Initiate contingency sourcing. Freeze new data sharing pending investigation outcome."}
    if level == "CRITICAL":
        return {"action": "REPLACE", "detail": "Critical risk level. Engage CISO and procurement. Begin alternative vendor assessment within 7 days."}
    if level == "HIGH":
        if expiry and (expiry - TODAY).days < 90:
            return {"action": "REMEDIATE", "detail": f"Obtain updated SOC 2 Type II certificate by {expiry.isoformat()} or suspend access to sensitive systems."}
        return {"action": "REMEDIATE", "detail": "Address compliance gaps and breach history within 30 days. Require evidence of remediation before contract renewal."}
    if level == "MEDIUM":
        if contract_end and 0 <= (contract_end - TODAY).days <= 60:
            return {"action": "RENEGOTIATE", "detail": "Contract expiring soon. Renegotiate with enhanced security SLAs before renewal."}
        return {"action": "MONITOR", "detail": "No immediate action. Review at next scheduled assessment cycle."}
    return {"action": "MONITOR", "detail": "Compliant posture. Confirm at annual review."}


# ── Alert generation ──────────────────────────────────────────────────────

def _generate_alerts(row: dict, level: str, breaches: list[dict], override_flags: list[str]) -> list[str]:
    alerts = []
    contract_end = _safe_date(row.get("contract_end"))
    expiry = _safe_date(row.get("soc2_expiry"))
    soc2 = bool(int(row.get("soc2_type2", 0) or 0))
    sensitivity = str(row.get("data_sensitivity", "LOW")).upper()

    if int(row.get("under_investigation", 0) or 0):
        alerts.append("CRITICAL: Vendor under active investigation")

    for b in breaches:
        if _days_since(b["date"]) <= 365:
            alerts.append(f"Breach in last 12 months ({b['severity']}): {b['description'][:80]}")

    if soc2 and expiry:
        days = (expiry - TODAY).days
        if days < 0:
            alerts.append(f"SOC 2 Type II expired {abs(days)} days ago")
        elif days <= 30:
            alerts.append(f"SOC 2 Type II expires in {days} days")
        elif days <= 90:
            alerts.append(f"SOC 2 Type II expires in {days} days")

    if contract_end:
        days = (contract_end - TODAY).days
        if days < 0:
            alerts.append(f"Contract expired {abs(days)} days ago — access must be reviewed")
        elif days <= 30:
            alerts.append(f"Contract expires in {days} days")

    for f in override_flags:
        if "ISOLATE" in f and f not in alerts:
            alerts.append(f)

    if row.get("_non_eu_pii") and not int(row.get("gdpr_dpa", 0) or 0):
        alerts.append("Non-EU data residency with PII — no GDPR DPA in place")

    if row.get("_stale_assessment"):
        alerts.append("Risk assessment overdue (>12 months since last review)")

    return alerts


# ── Main entry point ──────────────────────────────────────────────────────

def score_vendor(raw_row: dict[str, Any]) -> dict[str, Any]:
    """
    Score a raw vendor dict (from DB row or CSV).
    Returns a dict ready to be saved back to DB and serialised as VendorScore.
    """
    row = enrich_scoring_signals(raw_row)
    sensitivity = str(row.get("data_sensitivity", "LOW")).upper()
    access_type = str(row.get("access_type", "read")).lower()
    breaches = _parse_breaches(str(row.get("breach_history", "") or ""))

    # ── Sub-scores ───────────────────────────────────────────────────────
    de_score, de_notes = _data_exposure_score(row)
    comp_score, comp_gaps = _compliance_score(row)
    breach_score, breach_flags = _breach_score(breaches, access_type, sensitivity)
    fin_score, fin_notes = _financial_score(row)
    conc_score, conc_notes = _concentration_score(row)

    # Stale assessment penalty goes into data_exposure
    if row.get("_stale_assessment"):
        de_score = min(de_score + W["stale_assessment"], 100.0)
    if row.get("_non_eu_pii"):
        de_score = min(de_score + W["non_eu_pii"], 100.0)

    # ── Weighted composite ───────────────────────────────────────────────
    composite = (
        de_score    * W["weight_data_exposure"] +
        comp_score  * W["weight_compliance"] +
        breach_score * W["weight_breach"] +
        fin_score   * W["weight_financial"] +
        conc_score  * W["weight_concentration"]
    )
    composite = round(min(max(composite, 0.0), 100.0), 2)

    # ── Numeric → risk_level ─────────────────────────────────────────────
    if composite >= 75:
        base_level = "CRITICAL"
    elif composite >= 55:
        base_level = "HIGH"
    elif composite >= 30:
        base_level = "MEDIUM"
    else:
        base_level = "LOW"

    # ── Override rules ───────────────────────────────────────────────────
    risk_level, risk_score, override_flags = _apply_overrides(
        row, base_level, composite, breaches
    )

    rag = _to_rag(risk_level)

    # ── Collate human-readable output ────────────────────────────────────
    risk_factors = []
    risk_factors.extend(de_notes)
    risk_factors.extend(comp_gaps)
    risk_factors.extend(fin_notes)
    risk_factors.extend(conc_notes)

    anomaly_flags = list(breach_flags)
    anomaly_flags.extend(override_flags)

    recommendation = _recommend(risk_level, override_flags, row)
    alerts = _generate_alerts(row, risk_level, breaches, override_flags)

    return {
        "vendor_id": row.get("vendor_id"),
        "risk_score": risk_score,
        "risk_level": risk_level,
        "rag": rag,
        "score_breakdown": {
            "data_exposure": round(de_score, 2),
            "compliance_gaps": round(comp_score, 2),
            "breach_history": round(breach_score, 2),
            "financial_health": round(fin_score, 2),
            "concentration": round(conc_score, 2),
        },
        "risk_factors": risk_factors,
        "anomaly_flags": anomaly_flags,
        "recommendation": recommendation,
        "alerts": alerts,
        # Enriched fields for schema hydration
        "_enriched": row,
    }
