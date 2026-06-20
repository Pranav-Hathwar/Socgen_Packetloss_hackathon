"""Admin Sandbox endpoints for live monitoring demo.

These mutate the REAL SQLite database (the same store the dashboard, vendor
list, and report read from) so changes are immediately visible everywhere.
A random vendor is selected, a risk event is applied, the engine re-scores
it, and the result is persisted via save_scores().
"""
from __future__ import annotations

import random
from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from ..db import fetch_all_vendors, fetch_vendor, get_conn, save_scores
from ..deps import AnyUser
from ..engine import score_vendor

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


class SandboxResponse(BaseModel):
    action: str
    vendor_id: str
    vendor_name: str
    detail: str
    reason: str
    old_risk_score: float
    new_risk_score: float
    old_risk_level: str
    new_risk_level: str


def _fmt_score(v: float) -> float:
    return round(float(v or 0), 1)


def _append_breach_history(existing: str, new_date: date, severity: str, description: str) -> str:
    """Breach history is pipe-separated: date|severity|description[|date|...]."""
    parts = [p.strip() for p in (existing or "").split("|") if p.strip()]
    parts += [new_date.isoformat(), severity.upper(), description]
    return "|".join(parts)


def _pick_random_vendor() -> dict:
    rows = [dict(r) for r in fetch_all_vendors()]
    if not rows:
        raise RuntimeError("No vendors in database to target.")
    return random.choice(rows)


@router.post("/inject-breach", response_model=SandboxResponse)
def inject_breach(_user: AnyUser):
    """Pick a random vendor, append a HIGH-severity breach, re-score and persist."""
    raw = _pick_random_vendor()
    vendor_id = raw["vendor_id"]
    old_score = _fmt_score(raw.get("risk_score"))
    old_level = str(raw.get("risk_level") or "LOW")

    description = "[SIMULATED] Unauthorized data access detected in production environment."
    new_history = _append_breach_history(
        str(raw.get("breach_history") or ""), date.today(), "HIGH", description
    )

    with get_conn() as conn:
        conn.execute(
            "UPDATE vendors SET breach_history=? WHERE vendor_id=?",
            (new_history, vendor_id),
        )

    fresh = dict(fetch_vendor(vendor_id))
    scored = score_vendor(fresh)
    # We DO NOT call save_scores here so that scheduler's Run Now detects the DB gap and rescores!

    new_score = _fmt_score(scored["risk_score"])
    new_level = scored["risk_level"]
    delta = round(new_score - old_score, 1)

    return SandboxResponse(
        action="inject-breach",
        vendor_id=vendor_id,
        vendor_name=fresh["name"],
        detail=f"Breached injected into {fresh['name']}.",
        reason=f"New HIGH-severity breach logged today (+{delta:.1f} points from breach history).",
        old_risk_score=old_score,
        new_risk_score=new_score,
        old_risk_level=old_level,
        new_risk_level=new_level,
    )


@router.post("/advance-time", response_model=SandboxResponse)
def advance_time(_user: AnyUser):
    """Find a vendor with a valid SOC2 cert and mark it expired, then re-score."""
    rows = [dict(r) for r in fetch_all_vendors()]
    candidates = [
        r for r in rows
        if int(r.get("soc2_type2", 0) or 0) and r.get("soc2_expiry")
    ]
    if not candidates:
        raw = rows[0] if rows else None
        if raw is None:
            raise RuntimeError("No vendors in database to target.")
        reason_suffix = "No SOC2 vendors left to expire — no change applied."
    else:
        raw = random.choice(candidates)
        reason_suffix = "SOC 2 Type II certification marked expired."

    vendor_id = raw["vendor_id"]
    old_score = _fmt_score(raw.get("risk_score"))
    old_level = str(raw.get("risk_level") or "LOW")

    if candidates:
        with get_conn() as conn:
            conn.execute(
                "UPDATE vendors SET soc2_type2=0, soc2_expiry=NULL WHERE vendor_id=?",
                (vendor_id,),
            )

    fresh = dict(fetch_vendor(vendor_id))
    scored = score_vendor(fresh)
    # We DO NOT call save_scores here so that scheduler's Run Now detects the DB gap and rescores!

    new_score = _fmt_score(scored["risk_score"])
    new_level = scored["risk_level"]
    delta = round(new_score - old_score, 1)

    return SandboxResponse(
        action="advance-time",
        vendor_id=vendor_id,
        vendor_name=fresh["name"],
        detail=f"Time advanced for {fresh['name']}.",
        reason=f"{reason_suffix} (+{delta:.1f} points from compliance gap).",
        old_risk_score=old_score,
        new_risk_score=new_score,
        old_risk_level=old_level,
        new_risk_level=new_level,
    )
