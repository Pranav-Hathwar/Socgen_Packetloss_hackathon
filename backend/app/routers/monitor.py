"""
Live monitoring simulation + what-if scoring.

POST /monitor/inject-breach
    Inject a breach event into a vendor record, rescore, return new alerts.

POST /monitor/advance-time
    Advance the engine's reference date by N days, rescore all vendors,
    return vendors whose risk_level changed.

POST /whatif
    Given a hypothetical change (e.g. renew SOC2, sign DPA, revoke access),
    return the score delta without mutating the DB.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import fetch_all_vendors, fetch_vendor, get_conn, save_scores
from ..deps import AnyUser, require_role
from ..engine import score_vendor, W, TODAY as ENGINE_TODAY
from ..hydrate import row_to_vendor_score

router = APIRouter(tags=["monitoring"])


# ── Inject breach ─────────────────────────────────────────────────────────

class BreachInjectRequest(BaseModel):
    vendor_id: str
    severity: str = "HIGH"          # LOW / MEDIUM / HIGH / CRITICAL
    description: str = "Simulated breach event"
    date_offset_days: int = 0       # 0 = today, negative = in the past


class BreachInjectResponse(BaseModel):
    vendor_id: str
    vendor_name: str
    previous_risk_level: str
    new_risk_level: str
    previous_risk_score: float
    new_risk_score: float
    new_alerts: list[str]
    recommendation: dict


@router.post("/monitor/inject-breach", response_model=BreachInjectResponse)
def inject_breach(req: BreachInjectRequest, _user=Depends(require_role("ADMIN", "ANALYST"))):
    row = fetch_vendor(req.vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {req.vendor_id} not found")

    raw = dict(row)
    prev_level = raw.get("risk_level") or "LOW"
    prev_score = float(raw.get("risk_score") or 0)

    # Build breach entry
    breach_date = (ENGINE_TODAY + timedelta(days=req.date_offset_days)).isoformat()
    new_entry = f"{breach_date}|{req.severity.upper()}|{req.description}"

    existing = raw.get("breach_history") or ""
    raw["breach_history"] = (existing + "|" + new_entry).lstrip("|")

    # Persist updated breach history
    with get_conn() as conn:
        conn.execute(
            "UPDATE vendors SET breach_history=? WHERE vendor_id=?",
            (raw["breach_history"], req.vendor_id),
        )

    # Rescore
    scored = score_vendor(raw)
    save_scores(req.vendor_id, scored)

    return BreachInjectResponse(
        vendor_id=req.vendor_id,
        vendor_name=raw["name"],
        previous_risk_level=prev_level,
        new_risk_level=scored["risk_level"],
        previous_risk_score=prev_score,
        new_risk_score=scored["risk_score"],
        new_alerts=scored["alerts"],
        recommendation=scored["recommendation"],
    )


# ── Advance time ──────────────────────────────────────────────────────────

class AdvanceTimeRequest(BaseModel):
    days: int = 30


class TimeAdvanceResult(BaseModel):
    vendor_id: str
    name: str
    old_risk_level: str
    new_risk_level: str
    old_score: float
    new_score: float
    new_alerts: list[str]


class AdvanceTimeResponse(BaseModel):
    simulated_date: str
    vendors_changed: list[TimeAdvanceResult]
    total_vendors: int


@router.post("/monitor/advance-time", response_model=AdvanceTimeResponse)
def advance_time(req: AdvanceTimeRequest, _user=Depends(require_role("ADMIN", "ANALYST"))):
    """
    Simulate time passing by shifting all date comparisons forward.
    Scores every vendor with the new reference date and returns those
    whose risk_level changed (new breaches surfacing, certs expiring, etc.).
    """
    import app.engine as eng_module

    new_date = ENGINE_TODAY + timedelta(days=req.days)
    # Temporarily patch the engine's TODAY
    original_today = eng_module.TODAY
    eng_module.TODAY = new_date

    # Also patch enrichment module
    import app.enrichment as enrich_module
    orig_enrich_today = enrich_module.TODAY
    enrich_module.TODAY = new_date

    try:
        rows = [dict(r) for r in fetch_all_vendors()]
        changed = []
        for raw in rows:
            old_level = raw.get("risk_level") or "LOW"
            old_score = float(raw.get("risk_score") or 0)
            scored = score_vendor(raw)
            if scored["risk_level"] != old_level:
                changed.append(TimeAdvanceResult(
                    vendor_id=raw["vendor_id"],
                    name=raw["name"],
                    old_risk_level=old_level,
                    new_risk_level=scored["risk_level"],
                    old_score=old_score,
                    new_score=scored["risk_score"],
                    new_alerts=scored["alerts"],
                ))
    finally:
        eng_module.TODAY = original_today
        enrich_module.TODAY = orig_enrich_today

    return AdvanceTimeResponse(
        simulated_date=new_date.isoformat(),
        vendors_changed=changed,
        total_vendors=len(rows),
    )


# ── What-if simulator ─────────────────────────────────────────────────────

class WhatIfChange(BaseModel):
    field: str       # e.g. "soc2_type2", "gdpr_dpa", "iso27001", "access_type",
                     # "data_sensitivity", "breach_history", "under_investigation",
                     # "financial_rating", "concentration_risk", "contract_end"
    value: Any       # new value


class WhatIfRequest(BaseModel):
    vendor_id: str
    changes: list[WhatIfChange]
    label: Optional[str] = None      # optional description of the scenario


class WhatIfResponse(BaseModel):
    vendor_id: str
    vendor_name: str
    scenario: str
    original_score: float
    original_risk_level: str
    original_rag: str
    new_score: float
    new_risk_level: str
    new_rag: str
    score_delta: float
    level_changed: bool
    breakdown_delta: dict[str, float]
    new_recommendation: dict
    new_risk_factors: list[str]


@router.post("/whatif", response_model=WhatIfResponse)
def whatif(req: WhatIfRequest, _user=Depends(require_role("ADMIN", "ANALYST"))):
    row = fetch_vendor(req.vendor_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Vendor {req.vendor_id} not found")

    raw = dict(row)
    # Clone and apply changes — never touches the DB
    modified = dict(raw)
    for change in req.changes:
        f = change.field
        v = change.value
        # Normalise booleans
        if f in ("soc2_type2", "iso27001", "gdpr_dpa", "under_investigation"):
            modified[f] = 1 if str(v).lower() in ("true", "1", "yes") else 0
        else:
            modified[f] = v

    orig_scored    = score_vendor(raw)
    new_scored     = score_vendor(modified)

    orig_bd = orig_scored["score_breakdown"]
    new_bd  = new_scored["score_breakdown"]
    bd_delta = {k: round(new_bd[k] - orig_bd.get(k, 0), 2) for k in new_bd}

    label = req.label or (
        ", ".join(f"{c.field}={c.value}" for c in req.changes)
    )

    return WhatIfResponse(
        vendor_id=req.vendor_id,
        vendor_name=raw["name"],
        scenario=label,
        original_score=orig_scored["risk_score"],
        original_risk_level=orig_scored["risk_level"],
        original_rag=orig_scored["rag"],
        new_score=new_scored["risk_score"],
        new_risk_level=new_scored["risk_level"],
        new_rag=new_scored["rag"],
        score_delta=round(new_scored["risk_score"] - orig_scored["risk_score"], 2),
        level_changed=new_scored["risk_level"] != orig_scored["risk_level"],
        breakdown_delta=bd_delta,
        new_recommendation=new_scored["recommendation"],
        new_risk_factors=new_scored["risk_factors"],
    )


# ── Contract text extraction endpoint ─────────────────────────────────────

class ContractTextRequest(BaseModel):
    text: str
    vendor_id: Optional[str] = None


@router.post("/contract/extract-text")
def extract_contract_text(req: ContractTextRequest, _user: AnyUser):
    """Extract structured fields from pasted contract text (regex, no LLM)."""
    from ..contract import extract_from_text
    return extract_from_text(req.text, vendor_id=req.vendor_id)
