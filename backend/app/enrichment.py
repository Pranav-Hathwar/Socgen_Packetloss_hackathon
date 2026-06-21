"""
Deterministic enrichment of raw vendor rows.
Synthesises data_residency, sub_processor_count, concentration_risk,
access_last_used_at, and last_assessment_date for any row that is missing them.
Does NOT touch is_anomaly ground-truth labels.
"""
from __future__ import annotations

import hashlib
from datetime import date, datetime, timedelta
from typing import Any

TODAY = date(2026, 6, 21)


def _det_int(vendor_id: str, salt: str, lo: int, hi: int) -> int:
    """Deterministic pseudo-random int in [lo, hi] based on vendor_id."""
    h = int(hashlib.md5(f"{vendor_id}{salt}".encode()).hexdigest(), 16)
    return lo + (h % (hi - lo + 1))


def _det_bool(vendor_id: str, salt: str, p_true: float = 0.5) -> bool:
    h = int(hashlib.md5(f"{vendor_id}{salt}".encode()).hexdigest(), 16)
    return (h % 100) < int(p_true * 100)


def enrich(row: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of row with missing enrichment fields filled in."""
    r = dict(row)
    vid = r.get("vendor_id", "XX")
    sensitivity = str(r.get("data_sensitivity", "LOW")).upper()
    systems_raw = str(r.get("systems", ""))
    sys_count = len([s for s in systems_raw.split(",") if s.strip()])

    # ── data_residency ───────────────────────────────────────────────────
    if not r.get("data_residency"):
        # HIGH sensitivity vendors are more likely to be EU-hosted (regulated)
        p_eu = 0.85 if sensitivity == "HIGH" else 0.70
        r["data_residency"] = "EU" if _det_bool(vid, "residency", p_eu) else "non-EU"

    # ── sub_processor_count ──────────────────────────────────────────────
    if not r.get("sub_processor_count") and r.get("sub_processor_count") != 0:
        # Cloud infra / analytics tend to have more sub-processors
        cat = str(r.get("category", "")).lower()
        if any(k in cat for k in ("cloud", "analytics", "storage")):
            r["sub_processor_count"] = _det_int(vid, "subproc", 5, 20)
        else:
            r["sub_processor_count"] = _det_int(vid, "subproc", 0, 8)

    # ── concentration_risk ───────────────────────────────────────────────
    if not r.get("concentration_risk"):
        if sys_count >= 4:
            r["concentration_risk"] = "HIGH"
        elif sys_count >= 2:
            r["concentration_risk"] = "MEDIUM"
        else:
            r["concentration_risk"] = "LOW"

    # ── access_last_used_at ──────────────────────────────────────────────
    if not r.get("access_last_used_at"):
        days_ago = _det_int(vid, "access", 1, 45)
        dt = datetime.combine(TODAY - timedelta(days=days_ago), datetime.min.time())
        r["access_last_used_at"] = dt.isoformat()

    # ── last_assessment_date ─────────────────────────────────────────────
    if not r.get("last_assessment_date"):
        days_ago = _det_int(vid, "assess", 30, 400)
        r["last_assessment_date"] = (TODAY - timedelta(days=days_ago)).isoformat()

    return r


def enrich_scoring_signals(row: dict[str, Any]) -> dict[str, Any]:
    """
    Derive additional boolean signals used by the scoring engine.
    These are read from enriched row fields — not from labels.
    """
    r = enrich(row)

    residency = str(r.get("data_residency", "EU"))
    sensitivity = str(r.get("data_sensitivity", "LOW")).upper()
    sub_proc = int(r.get("sub_processor_count", 0) or 0)
    conc = str(r.get("concentration_risk", "LOW")).upper()

    # Non-EU residency + PII/financial data = elevated risk
    r["_non_eu_pii"] = (residency == "non-EU") and (sensitivity in ("HIGH", "MEDIUM"))

    # High sub-processor chain = supply chain risk
    r["_high_sub_proc"] = sub_proc > 15

    # Concentration penalty
    r["_concentration_high"] = conc == "HIGH"
    r["_concentration_medium"] = conc == "MEDIUM"

    # Stale assessment (>12 months)
    try:
        last = date.fromisoformat(str(r.get("last_assessment_date", "")))
        r["_stale_assessment"] = (TODAY - last).days > 365
    except (ValueError, TypeError):
        r["_stale_assessment"] = False

    return r
