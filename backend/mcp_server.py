"""
VendorLens MCP Server
=====================
Exposes scoring and query tools via Model Context Protocol (FastMCP).
Completely separate from the FastAPI app — shares only the engine module.

Run:
    python backend/mcp_server.py

Or wire into Claude Desktop / any MCP-compatible client:
    {
      "mcpServers": {
        "vendorlens": {
          "command": "python",
          "args": ["backend/mcp_server.py"]
        }
      }
    }
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Annotated, Optional

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).parent))

from fastmcp import FastMCP

from app.db import (
    fetch_all_vendors,
    fetch_vendor,
    init_db,
    load_labels_csv,
    load_registry_csv,
    save_scores,
)
from app.engine import score_vendor, _safe_date
from app.hydrate import row_to_summary, row_to_vendor_score
from app.qa import answer_question

from datetime import date

TODAY = date(2024, 6, 19)

# ── Bootstrap DB on startup ───────────────────────────────────────────────
init_db()
load_registry_csv()
load_labels_csv()
for row in fetch_all_vendors():
    raw = dict(row)
    if raw.get("risk_score") is None:
        save_scores(raw["vendor_id"], score_vendor(raw))

# ── MCP server ────────────────────────────────────────────────────────────
mcp = FastMCP(
    name="VendorLens",
    instructions=(
        "VendorLens is a Third-Party Vendor Risk Management tool for a European bank. "
        "Use score_vendor to get a full risk assessment, query_vendors to filter the "
        "register, get_report for portfolio summary, and ask_question for NL audit Q&A."
    ),
)


# ── Tool 1: score_vendor ──────────────────────────────────────────────────

@mcp.tool(
    description=(
        "Score a single vendor by ID. Returns full VendorScore including "
        "risk_score (0-100), risk_level (CRITICAL/HIGH/MEDIUM/LOW), RAG status, "
        "per-factor score_breakdown, risk_factors, anomaly_flags, alerts, "
        "and a structured recommendation {action, detail}."
    )
)
def score_vendor_tool(
    vendor_id: Annotated[str, "The vendor ID to score (e.g. 'V001')"],
) -> dict:
    row = fetch_vendor(vendor_id)
    if not row:
        return {"error": f"Vendor {vendor_id} not found"}
    raw = dict(row)
    if raw.get("risk_score") is None:
        scored = score_vendor(raw)
        save_scores(vendor_id, scored)
        raw.update(scored)
    try:
        vs = row_to_vendor_score(raw)
        return vs.model_dump(mode="json")
    except Exception as e:
        return {"error": str(e), "vendor_id": vendor_id}


# ── Tool 2: query_vendors ─────────────────────────────────────────────────

@mcp.tool(
    description=(
        "Filter the vendor register and return matching summaries. "
        "All parameters are optional — combine them to narrow results. "
        "Returns a list of VendorSummary objects sorted by risk_score descending."
    )
)
def query_vendors(
    risk_level: Annotated[
        Optional[str],
        "Filter by risk level: CRITICAL, HIGH, MEDIUM, or LOW",
    ] = None,
    rag: Annotated[
        Optional[str],
        "Filter by RAG status: RED, AMBER, or GREEN",
    ] = None,
    min_risk_score: Annotated[
        Optional[float],
        "Only return vendors with risk_score >= this value",
    ] = None,
    has_breach: Annotated[
        Optional[bool],
        "If True, only vendors with at least one breach event",
    ] = None,
    data_sensitivity: Annotated[
        Optional[str],
        "Filter by data_sensitivity: LOW, MEDIUM, or HIGH",
    ] = None,
    under_investigation: Annotated[
        Optional[bool],
        "If True, only vendors currently under investigation",
    ] = None,
    soc2_missing: Annotated[
        Optional[bool],
        "If True, only vendors without SOC 2 Type II",
    ] = None,
    gdpr_missing: Annotated[
        Optional[bool],
        "If True, only vendors without a GDPR DPA",
    ] = None,
    contract_expiring_days: Annotated[
        Optional[int],
        "Only vendors whose contract expires within this many days",
    ] = None,
    category: Annotated[
        Optional[str],
        "Partial match on vendor category (case-insensitive)",
    ] = None,
) -> list[dict]:
    rows = [dict(r) for r in fetch_all_vendors()]
    result = []

    for r in rows:
        if risk_level and r.get("risk_level") != risk_level.upper():
            continue
        if rag and r.get("rag") != rag.upper():
            continue
        if min_risk_score is not None and (r.get("risk_score") or 0) < min_risk_score:
            continue
        if has_breach is True and not r.get("breach_history"):
            continue
        if has_breach is False and r.get("breach_history"):
            continue
        if data_sensitivity and str(r.get("data_sensitivity", "")).upper() != data_sensitivity.upper():
            continue
        if under_investigation is True and not int(r.get("under_investigation", 0) or 0):
            continue
        if under_investigation is False and int(r.get("under_investigation", 0) or 0):
            continue
        if soc2_missing is True and int(r.get("soc2_type2", 0) or 0):
            continue
        if gdpr_missing is True and int(r.get("gdpr_dpa", 0) or 0):
            continue
        if contract_expiring_days is not None:
            ce = _safe_date(r.get("contract_end"))
            if not ce:
                continue
            days_left = (ce - TODAY).days
            if not (0 <= days_left <= contract_expiring_days):
                continue
        if category and category.lower() not in str(r.get("category", "")).lower():
            continue

        try:
            summary = row_to_summary(r)
            result.append(summary.model_dump(mode="json"))
        except Exception:
            result.append({
                "vendor_id": r["vendor_id"],
                "name": r["name"],
                "risk_score": r.get("risk_score"),
                "risk_level": r.get("risk_level"),
                "rag": r.get("rag"),
            })

    return result


# ── Tool 3: get_report ────────────────────────────────────────────────────

@mcp.tool(
    description=(
        "Return a portfolio-level risk report: RAG summary, level distribution, "
        "average score, top-10 riskiest vendors, and action-required lists "
        "(critical vendors, orphaned access, expiring contracts/certs)."
    )
)
def get_report() -> dict:
    from collections import Counter
    rows = [dict(r) for r in fetch_all_vendors()]

    rag_counts = Counter(r.get("rag", "GREEN") for r in rows)
    level_counts = Counter(r.get("risk_level", "LOW") for r in rows)
    scores = [r["risk_score"] for r in rows if r.get("risk_score") is not None]
    avg = round(sum(scores) / len(scores), 2) if scores else 0.0

    top_risks = sorted(
        [r for r in rows if r.get("risk_score") is not None],
        key=lambda x: x["risk_score"],
        reverse=True,
    )[:10]

    critical = [
        {"vendor_id": r["vendor_id"], "name": r["name"], "risk_score": r["risk_score"]}
        for r in rows if r.get("risk_level") == "CRITICAL"
    ]

    orphaned = []
    expiring_contracts = []
    expiring_certs = []
    for r in rows:
        ce = _safe_date(r.get("contract_end"))
        if ce and ce < TODAY:
            orphaned.append({"vendor_id": r["vendor_id"], "name": r["name"],
                             "contract_ended": ce.isoformat()})
        if ce and 0 <= (ce - TODAY).days <= 60:
            expiring_contracts.append({"vendor_id": r["vendor_id"], "name": r["name"],
                                       "contract_end": ce.isoformat(),
                                       "days_left": (ce - TODAY).days})
        soc2_exp = _safe_date(r.get("soc2_expiry"))
        if soc2_exp and int(r.get("soc2_type2", 0) or 0):
            days = (soc2_exp - TODAY).days
            if 0 <= days <= 90:
                expiring_certs.append({"vendor_id": r["vendor_id"], "name": r["name"],
                                       "soc2_expiry": soc2_exp.isoformat(),
                                       "days_left": days})

    return {
        "generated_at": TODAY.isoformat(),
        "total_vendors": len(rows),
        "rag_summary": dict(rag_counts),
        "risk_level_summary": dict(level_counts),
        "average_risk_score": avg,
        "top_10_risks": [
            {"vendor_id": r["vendor_id"], "name": r["name"],
             "risk_score": r["risk_score"], "risk_level": r["risk_level"]}
            for r in top_risks
        ],
        "action_required": {
            "critical_vendors": critical,
            "orphaned_access": orphaned,
            "contracts_expiring_60d": expiring_contracts,
            "certs_expiring_90d": expiring_certs,
        },
    }


# ── Tool 4: ask_question ──────────────────────────────────────────────────

@mcp.tool(
    description=(
        "Answer a natural-language audit question about the vendor register. "
        "Translates the question into a structured filter, retrieves relevant "
        "vendors, and returns a grounded answer citing specific vendor IDs. "
        "Examples: 'Which vendors have PII access with expired SOC 2?', "
        "'Is CloudBackup Inc compliant?', 'Show me all CRITICAL vendors'."
    )
)
def ask_question(
    question: Annotated[str, "Natural language audit question"],
    vendor_id: Annotated[
        Optional[str],
        "Optional: scope the question to a single vendor ID",
    ] = None,
) -> dict:
    return answer_question(question=question, vendor_id=vendor_id)


# ── Run ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run()
