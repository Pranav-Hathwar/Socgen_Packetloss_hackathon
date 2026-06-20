from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..db import add_incident, fetch_active_incidents, resolve_incident, get_conn, fetch_all_vendors, save_scores
from ..engine import score_vendor
from ..deps import AnyUser

router = APIRouter(prefix="/incidents", tags=["incidents"])

class IncidentCreate(BaseModel):
    platform: str
    severity: str
    description: str

class IncidentAction(BaseModel):
    id: int

@router.post("/report")
def report_incident(data: IncidentCreate, _user: AnyUser):
    # 1. Store incident
    incident_id = add_incident(data.platform, data.severity, data.description)

    # 2. Identify impacted vendors using case-insensitive partial match on systems field
    all_vendors = [dict(r) for r in fetch_all_vendors()]
    impacted_count = 0
    impacted_names = []

    platform_q = data.platform.strip().lower()

    for v in all_vendors:
        # Match against systems field (comma-separated), vendor name, and category
        systems = str(v.get("systems", "") or "").lower()
        vendor_name = str(v.get("name", "") or "").lower()
        category = str(v.get("category", "") or "").lower()

        # Split systems into individual entries and check each one
        system_list = [s.strip() for s in systems.split(",")]
        matched = (
            any(platform_q in s or s in platform_q for s in system_list if s) or
            platform_q in vendor_name or
            platform_q in category
        )

        if matched:
            # Escalate vendor to under_investigation
            with get_conn() as conn:
                conn.execute(
                    "UPDATE vendors SET under_investigation = 1 WHERE vendor_id = ?",
                    (v["vendor_id"],)
                )

            # Recalculate score with investigation flag
            v["under_investigation"] = 1
            scored = score_vendor(v)
            save_scores(v["vendor_id"], scored, trigger=f"incident:{data.platform}")
            impacted_count += 1
            impacted_names.append(v["name"])

    return {
        "status": "reported",
        "incident_id": incident_id,
        "impacted_vendors": impacted_count,
        "impacted_vendor_names": impacted_names[:10],  # first 10 for display
        "message": f"Global incident on '{data.platform}' reported. {impacted_count} vendors auto-escalated to CRITICAL."
    }

@router.get("/active")
def get_active_incidents(_user: AnyUser):
    rows = fetch_active_incidents()
    return [dict(r) for r in rows]

@router.get("/systems")
def get_unique_systems(_user: AnyUser):
    """Return all unique system names across vendors — used to populate suggestions in the UI."""
    all_vendors = [dict(r) for r in fetch_all_vendors()]
    systems_set = set()
    for v in all_vendors:
        for s in str(v.get("systems", "") or "").split(","):
            s = s.strip()
            if s:
                systems_set.add(s)
    return sorted(systems_set)

@router.post("/resolve")
def resolve_global_incident(data: IncidentAction, _user: AnyUser):
    success = resolve_incident(data.id)
    if not success:
        raise HTTPException(status_code=404, detail="Incident not found or already resolved")
    return {"status": "resolved", "id": data.id}
