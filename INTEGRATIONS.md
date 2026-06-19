# VendorLens — Integration Recommendations

## ITSM (ServiceNow / Jira Service Management)

**Recommended integration:** Bi-directional sync of vendor risk alerts with ITSM tickets.

| VendorLens event | ITSM action |
|---|---|
| Vendor RAG turns RED | Auto-create P1 incident ticket assigned to TPRM team |
| SOC 2 expiry < 30 days | Create change request for certificate renewal |
| Contract expiry < 60 days | Create procurement task for renewal negotiation |
| `POST /monitor/inject-breach` | Create security incident ticket with 72h SLA (GDPR Art. 33) |
| Remediation recorded | Close/update linked incident ticket |

**Implementation:** Poll `GET /alerts` every 15 minutes or use webhook (add FastAPI WebSocket endpoint). Map `AlertItem.rag` to ITSM priority.

## Procurement / Vendor Management (Coupa / SAP Ariba)

**Recommended integration:** Surface risk scores in procurement approval workflows.

- During vendor onboarding: call `POST /ingest` with vendor data from procurement system
- On contract renewal: call `GET /vendors/{id}` to fetch current risk score; block renewal if RAG=RED
- During RFP evaluation: call `POST /whatif` with proposed vendor profile to project risk score
- Quarterly review: pull `GET /report` category breakdown for procurement risk reporting

**Implementation:** REST API calls from procurement workflow engine. Use JWT bearer token (ADMIN role for ingest, ANALYST for reads).

## SIEM / SOC (Splunk / Microsoft Sentinel)

**Recommended integration:** Forward VendorLens risk events to SIEM for correlation.

- Stream `score_history` table to SIEM as structured log events
- Alert when `risk_level` changes to CRITICAL — correlate with internal security events
- Use `anomaly_flags` field as SIEM enrichment for vendor-related incidents
- Feed breach injection events to SIEM for timeline reconstruction

## GRC Platform (Archer / OneTrust / MetricStream)

**Recommended integration:** VendorLens as a risk data source feeding the GRC register.

- Map VendorLens `VendorScore` to GRC vendor risk record
- Import `compliance_coverage` stats into GRC compliance dashboard
- Use `remediations` API to log remediation evidence in GRC audit trail
- Export `GET /report` as periodic GRC risk register update

## Identity & Access Management (Okta / Azure AD)

**Recommended integration:** Trigger access reviews based on risk score changes.

- When vendor RAG changes to RED → trigger immediate access review in IAM
- When contract expires and access active → auto-suspend vendor SSO credentials
- Feed `access_last_used_at` from IAM back into VendorLens via `PATCH /vendors/{id}`

## Authentication

All VendorLens API endpoints require JWT bearer token. Three roles:
- `ADMIN` — full access including delete, scheduler control, notifications
- `ANALYST` — read + write risk data, ingest, breach injection
- `AUDITOR` — read-only access to all data

Obtain token: `POST /auth/login` with `{email, password}`.