"""Assessment parsing, email notifications, and monitoring scheduler endpoints."""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..assessment import parse_security_assessment
from ..notifications import send_monthly_summary, send_expiry_alerts, send_breach_notification
from ..scheduler import start_scheduler, stop_scheduler, scheduler_status, run_once
from ..deps import AnyUser, require_role

router = APIRouter(tags=["advanced"])


# ── Security Assessment ───────────────────────────────────────────────────────

class AssessmentRequest(BaseModel):
    text: str
    vendor_id: Optional[str] = None


@router.post("/assessment/parse")
def parse_assessment(body: AssessmentRequest, _user: AnyUser):
    """
    Parse a security questionnaire / audit report.
    Returns structured controls, certs, risk gaps.
    Covers NIST SA-9 (third-party security assessments) and GDPR Art. 28.
    """
    return parse_security_assessment(body.text, vendor_id=body.vendor_id)


# ── Email Notifications ───────────────────────────────────────────────────────

class NotifyRequest(BaseModel):
    to_email: str
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    severity: Optional[str] = "HIGH"
    description: Optional[str] = None


@router.post("/notify/summary")
def notify_summary(body: NotifyRequest, _user=Depends(require_role("ADMIN", "ANALYST"))):
    """Send monthly vendor risk summary email. Configure SMTP_HOST/SMTP_USER/SMTP_PASS env vars."""
    return send_monthly_summary(body.to_email)


@router.post("/notify/expiry-alerts")
def notify_expiry(body: NotifyRequest, _user=Depends(require_role("ADMIN", "ANALYST"))):
    """Send expiring cert/contract alert email."""
    return send_expiry_alerts(body.to_email)


@router.post("/notify/breach")
def notify_breach(body: NotifyRequest, _user=Depends(require_role("ADMIN", "ANALYST"))):
    """
    Send breach notification email (GDPR Art. 33 — 72h notification support).
    Requires vendor_id, vendor_name, severity, description.
    """
    if not body.vendor_id or not body.vendor_name:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="vendor_id and vendor_name required")
    return send_breach_notification(
        to_email=body.to_email,
        vendor_id=body.vendor_id,
        vendor_name=body.vendor_name,
        severity=body.severity or "HIGH",
        description=body.description or "Breach event detected",
    )


# ── Continuous Monitoring Scheduler ──────────────────────────────────────────

class SchedulerRequest(BaseModel):
    interval_seconds: int = 3600


@router.post("/scheduler/start")
def start_monitoring(body: SchedulerRequest, _user=Depends(require_role("ADMIN"))):
    """Start continuous background rescoring. NIST SA-9: continuous third-party monitoring."""
    return start_scheduler(body.interval_seconds)


@router.post("/scheduler/stop")
def stop_monitoring(_user=Depends(require_role("ADMIN"))):
    return stop_scheduler()


@router.get("/scheduler/status")
def monitoring_status(_user: AnyUser):
    return scheduler_status()


@router.post("/scheduler/run-now")
def trigger_rescore(_user=Depends(require_role("ADMIN", "ANALYST"))):
    """Immediately rescore all vendors and return level changes."""
    return run_once()