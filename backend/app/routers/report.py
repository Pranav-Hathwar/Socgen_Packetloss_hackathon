import json
from collections import Counter
from datetime import date

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..db import fetch_all_vendors
from ..deps import AnyUser

router = APIRouter(prefix="/report", tags=["report"])

TODAY = date(2024, 6, 19)


@router.get("")
def get_report(_user: AnyUser):
    rows = [dict(r) for r in fetch_all_vendors()]
    total = len(rows)

    rag_counts = Counter(r.get("rag", "GREEN") for r in rows)
    level_counts = Counter(r.get("risk_level", "LOW") for r in rows)
    scores = [r["risk_score"] for r in rows if r.get("risk_score") is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0

    top_risks = sorted(
        [r for r in rows if r.get("risk_score") is not None],
        key=lambda x: x["risk_score"],
        reverse=True,
    )[:10]

    def _compliance_stat(field: str) -> dict:
        count = sum(1 for r in rows if int(r.get(field, 0) or 0))
        pct = round(count / total * 100) if total else 0
        return {"count": count, "total": total, "percentage": pct}

    red_flag_vendors = []
    for r in rows:
        if r.get("rag") != "RED":
            continue
        try:
            risk_factors = json.loads(r.get("risk_factors") or "[]")
        except Exception:
            risk_factors = []
        action = r.get("recommendation_action") or "ESCALATE"
        detail = r.get("recommendation_detail") or "Immediate review required."
        red_flag_vendors.append({
            "vendor_id": r["vendor_id"],
            "name": r["name"],
            "category": r.get("category", ""),
            "risk_score": r.get("risk_score", 0.0),
            "risk_level": r.get("risk_level", ""),
            "rag": r.get("rag", "RED"),
            "required_actions": detail,
            "action_type": action,
            "risk_factors": risk_factors,
        })

    return JSONResponse({
        "generated_at": TODAY.isoformat(),
        "total_vendors": total,
        "rag_summary": {
            "RED": rag_counts.get("RED", 0),
            "AMBER": rag_counts.get("AMBER", 0),
            "GREEN": rag_counts.get("GREEN", 0),
        },
        "risk_level_summary": {
            "CRITICAL": level_counts.get("CRITICAL", 0),
            "HIGH": level_counts.get("HIGH", 0),
            "MEDIUM": level_counts.get("MEDIUM", 0),
            "LOW": level_counts.get("LOW", 0),
        },
        "average_risk_score": avg_score,
        "compliance_coverage": {
            "soc2_type2": _compliance_stat("soc2_type2"),
            "iso27001": _compliance_stat("iso27001"),
            "gdpr_dpa": _compliance_stat("gdpr_dpa"),
        },
        "top_risks": [
            {
                "vendor_id": r["vendor_id"],
                "name": r["name"],
                "risk_score": r["risk_score"],
                "risk_level": r["risk_level"],
                "rag": r["rag"],
            }
            for r in top_risks
        ],
        "red_flag_vendors": red_flag_vendors,
    })
