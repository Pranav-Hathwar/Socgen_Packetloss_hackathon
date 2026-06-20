import json
from datetime import date

from fastapi import APIRouter

from ..db import fetch_all_vendors
from ..deps import AnyUser
from ..schema import AlertItem, RAG

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _classify_alert_type(text: str) -> str:
    t = text.lower()
    if "overdue" in t or ("assessment" in t and "review" in t):
        return "ASSESSMENT_OVERDUE"
    if "breach" in t or "ransomware" in t or "exfil" in t or "leak" in t:
        return "BREACH"
    if "soc 2" in t and "expir" in t:
        return "CERT_EXPIRY"
    if "iso 27001" in t and "expir" in t:
        return "CERT_EXPIRY"
    if "contract expires" in t or "contract renewal" in t:
        return "CONTRACT"
    if "isolate" in t or "access" in t:
        return "ACCESS"
    if "gdpr" in t or "dpa" in t:
        return "COMPLIANCE"
    return "GENERAL"


@router.get("", response_model=list[AlertItem])
def get_alerts(_user: AnyUser):
    rows = fetch_all_vendors()
    alerts: list[AlertItem] = []

    for row in rows:
        raw = dict(row)
        rag = raw.get("rag") or "GREEN"
        stored_alerts = []
        try:
            stored_alerts = json.loads(raw.get("alerts") or "[]")
        except Exception:
            pass

        for alert_text in stored_alerts:
            alerts.append(AlertItem(
                vendor_id=raw["vendor_id"],
                vendor_name=raw["name"],
                alert=alert_text,
                rag=RAG(rag),
                alert_type=_classify_alert_type(alert_text),
            ))

    priority = {"RED": 0, "AMBER": 1, "GREEN": 2}
    alerts.sort(key=lambda a: priority.get(a.rag.value, 2))
    return alerts
