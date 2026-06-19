import json
from datetime import date, timedelta

from fastapi import APIRouter

from ..db import fetch_all_vendors
from ..schema import AlertItem, RAG

router = APIRouter(prefix="/alerts", tags=["alerts"])

TODAY = date(2024, 6, 19)


@router.get("", response_model=list[AlertItem])
def get_alerts():
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
            ))

    # Sort: RED first, then AMBER, then score desc
    priority = {"RED": 0, "AMBER": 1, "GREEN": 2}
    alerts.sort(key=lambda a: priority.get(a.rag.value, 2))
    return alerts
