"""
Email Notification Service
===========================
Sends alert emails for:
  - Monthly vendor risk summary
  - Expiring cert / contract alerts (30-day window)
  - New RED-flag vendor notifications

Uses SMTP (configure via env vars). Falls back to console log if unconfigured.
GDPR Art. 33: Supports 72h breach notification workflow via email.
"""
from __future__ import annotations

import json
import os
import smtplib
import ssl
from datetime import date, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from .db import fetch_all_vendors, get_conn

TODAY = date(2024, 6, 19)

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "vendorlens@noreply.com")


def _send_email(to: str, subject: str, body_html: str, body_text: str) -> dict:
    if not SMTP_HOST or not SMTP_USER:
        # Not configured — log to console, return preview
        print(f"[EMAIL NOT CONFIGURED] To: {to}\nSubject: {subject}\n{body_text}")
        return {"status": "simulated", "to": to, "subject": subject, "preview": body_text[:500]}

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = EMAIL_FROM
    msg["To"] = to
    msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    ctx = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls(context=ctx)
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(EMAIL_FROM, to, msg.as_string())

    return {"status": "sent", "to": to, "subject": subject}


def send_monthly_summary(to_email: str) -> dict:
    rows = [dict(r) for r in fetch_all_vendors()]
    total = len(rows)
    red = sum(1 for r in rows if r.get("rag") == "RED")
    amber = sum(1 for r in rows if r.get("rag") == "AMBER")
    green = sum(1 for r in rows if r.get("rag") == "GREEN")
    scores = [r["risk_score"] for r in rows if r.get("risk_score") is not None]
    avg = round(sum(scores) / len(scores), 1) if scores else 0.0

    red_vendors = [r for r in rows if r.get("rag") == "RED"]

    text = f"""VendorLens Monthly Risk Summary — {TODAY.isoformat()}

Portfolio: {total} vendors | Avg Score: {avg}
RED: {red} | AMBER: {amber} | GREEN: {green}

Red-flag vendors requiring action:
"""
    for v in red_vendors[:10]:
        text += f"  - {v['name']} ({v.get('category', '')}): score {v.get('risk_score', 0):.1f} [{v.get('risk_level', '')}]\n"

    html = f"""<html><body>
<h2>VendorLens Monthly Risk Summary</h2>
<p><b>Date:</b> {TODAY.isoformat()} | <b>Total Vendors:</b> {total} | <b>Avg Score:</b> {avg}</p>
<table border="1" cellpadding="6" style="border-collapse:collapse">
<tr><th>RAG</th><th>Count</th></tr>
<tr style="color:red"><td>RED</td><td>{red}</td></tr>
<tr style="color:orange"><td>AMBER</td><td>{amber}</td></tr>
<tr style="color:green"><td>GREEN</td><td>{green}</td></tr>
</table>
<h3>Red-Flag Vendors</h3><ul>
{"".join(f"<li><b>{v['name']}</b> — {v.get('risk_level','')} ({v.get('risk_score',0):.1f})</li>" for v in red_vendors[:10])}
</ul></body></html>"""

    return _send_email(to_email, f"VendorLens Risk Summary — {TODAY.isoformat()}", html, text)


def send_expiry_alerts(to_email: str) -> dict:
    rows = [dict(r) for r in fetch_all_vendors()]
    alerts_text = []

    for r in rows:
        stored_alerts = []
        try:
            stored_alerts = json.loads(r.get("alerts") or "[]")
        except Exception:
            pass
        expiry_alerts = [a for a in stored_alerts if "expires" in a.lower() or "expir" in a.lower()]
        for a in expiry_alerts:
            alerts_text.append(f"  [{r['name']}] {a}")

    if not alerts_text:
        return {"status": "skipped", "reason": "No expiry alerts found"}

    body = "VendorLens Expiry Alerts\n\n" + "\n".join(alerts_text)
    html = "<html><body><h2>VendorLens Expiry Alerts</h2><ul>" + \
           "".join(f"<li>{a.strip()}</li>" for a in alerts_text) + \
           "</ul></body></html>"

    return _send_email(to_email, "VendorLens — Expiry Alerts", html, body)


def send_breach_notification(to_email: str, vendor_id: str, vendor_name: str,
                              severity: str, description: str) -> dict:
    """GDPR Art. 33 — 72h breach notification support."""
    subject = f"[URGENT] Security Breach Detected — {vendor_name}"
    body = f"""SECURITY BREACH NOTIFICATION
Vendor: {vendor_name} ({vendor_id})
Severity: {severity}
Description: {description}
Detected: {datetime.utcnow().isoformat()}

Action required within 72 hours per GDPR Art. 33.
Review VendorLens dashboard for remediation steps.
"""
    html = f"""<html><body>
<h2 style="color:red">Security Breach Notification</h2>
<p><b>Vendor:</b> {vendor_name} ({vendor_id})</p>
<p><b>Severity:</b> {severity}</p>
<p><b>Description:</b> {description}</p>
<p><b>Detected:</b> {datetime.utcnow().isoformat()}</p>
<p style="color:red"><b>Action required within 72 hours per GDPR Art. 33.</b></p>
</body></html>"""

    return _send_email(to_email, subject, html, body)