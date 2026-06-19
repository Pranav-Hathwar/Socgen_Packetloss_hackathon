from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..mock_data import ALL_VENDORS

router = APIRouter(prefix="/report", tags=["report"])


@router.get("")
def get_report():
    vendors = list(ALL_VENDORS.values())
    total = len(vendors)

    # Compliance coverage
    soc2_count = sum(1 for v in vendors if v.compliance.soc2_type2)
    iso_count = sum(1 for v in vendors if v.compliance.iso27001)
    gdpr_count = sum(1 for v in vendors if v.compliance.gdpr_dpa)

    # Red flag vendors (HIGH + CRITICAL)
    red_flags = [
        {
            "vendor_id": v.vendor_id,
            "name": v.name,
            "category": v.category,
            "risk_score": v.risk_score,
            "risk_level": v.risk_level.value,
            "rag": v.rag.value,
            "required_actions": v.recommendation.detail,
            "action_type": v.recommendation.action,
            "risk_factors": v.risk_factors,
        }
        for v in sorted(vendors, key=lambda x: x.risk_score, reverse=True)
        if v.risk_level.value in ("HIGH", "CRITICAL")
    ]

    return JSONResponse({
        "generated_at": "2024-06-19T00:00:00Z",
        "total_vendors": total,
        "rag_summary": {
            "RED": sum(1 for v in vendors if v.rag.value == "RED"),
            "AMBER": sum(1 for v in vendors if v.rag.value == "AMBER"),
            "GREEN": sum(1 for v in vendors if v.rag.value == "GREEN"),
        },
        "risk_level_summary": {
            "CRITICAL": sum(1 for v in vendors if v.risk_level.value == "CRITICAL"),
            "HIGH": sum(1 for v in vendors if v.risk_level.value == "HIGH"),
            "MEDIUM": sum(1 for v in vendors if v.risk_level.value == "MEDIUM"),
            "LOW": sum(1 for v in vendors if v.risk_level.value == "LOW"),
        },
        "average_risk_score": round(
            sum(v.risk_score for v in vendors) / total, 2
        ) if total else 0,
        "compliance_coverage": {
            "soc2_type2": {"count": soc2_count, "total": total, "percentage": round(soc2_count / total * 100, 1) if total else 0},
            "iso27001": {"count": iso_count, "total": total, "percentage": round(iso_count / total * 100, 1) if total else 0},
            "gdpr_dpa": {"count": gdpr_count, "total": total, "percentage": round(gdpr_count / total * 100, 1) if total else 0},
        },
        "top_risks": [
            {"vendor_id": v.vendor_id, "name": v.name, "risk_score": v.risk_score}
            for v in sorted(vendors, key=lambda x: x.risk_score, reverse=True)[:5]
        ],
        "red_flag_vendors": red_flags,
    })
