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

    rag_counts = Counter(r.get("rag", "GREEN") for r in rows)
    level_counts = Counter(r.get("risk_level", "LOW") for r in rows)
    scores = [r["risk_score"] for r in rows if r.get("risk_score") is not None]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0

    top_risks = sorted(
        [r for r in rows if r.get("risk_score") is not None],
        key=lambda x: x["risk_score"],
        reverse=True,
    )[:10]

    # Vendors needing immediate action
    critical = [r for r in rows if r.get("risk_level") == "CRITICAL"]
    orphaned = []
    expiring_contracts = []
    expiring_certs = []

    for r in rows:
        alerts = []
        try:
            alerts = json.loads(r.get("alerts") or "[]")
        except Exception:
            pass
        for a in alerts:
            if "ISOLATE" in a or "expired" in a.lower() and "access" in a.lower():
                orphaned.append({"vendor_id": r["vendor_id"], "name": r["name"], "alert": a})
            if "contract expires" in a.lower():
                expiring_contracts.append({"vendor_id": r["vendor_id"], "name": r["name"], "alert": a})
            if "soc 2" in a.lower() and "expire" in a.lower():
                expiring_certs.append({"vendor_id": r["vendor_id"], "name": r["name"], "alert": a})

    return JSONResponse({
        "generated_at": TODAY.isoformat(),
        "total_vendors": len(rows),
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
        "action_required": {
            "critical_vendors": [
                {"vendor_id": r["vendor_id"], "name": r["name"]} for r in critical
            ],
            "orphaned_access": orphaned,
            "contracts_expiring_soon": expiring_contracts,
            "certs_expiring_soon": expiring_certs,
        },
    })
