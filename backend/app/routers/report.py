from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..mock_data import ALL_VENDORS

router = APIRouter(prefix="/report", tags=["report"])


@router.get("")
def get_report():
    vendors = list(ALL_VENDORS.values())
    return JSONResponse({
        "generated_at": "2024-06-19T00:00:00Z",
        "total_vendors": len(vendors),
        "rag_summary": {
            "RED": sum(1 for v in vendors if v.rag == "RED"),
            "AMBER": sum(1 for v in vendors if v.rag == "AMBER"),
            "GREEN": sum(1 for v in vendors if v.rag == "GREEN"),
        },
        "average_risk_score": round(
            sum(v.risk_score for v in vendors) / len(vendors), 2
        ),
        "top_risks": [
            {"vendor_id": v.vendor_id, "name": v.name, "risk_score": v.risk_score}
            for v in sorted(vendors, key=lambda x: x.risk_score, reverse=True)[:5]
        ],
    })
