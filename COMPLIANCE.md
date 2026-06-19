# VendorLens — Compliance Framework Alignment

## GDPR Article 28 — Data Processor Requirements

**Requirement:** Controllers must only use processors providing sufficient guarantees of appropriate technical and organisational security measures.

**VendorLens coverage:**
- `soc2_type2`, `iso27001`, `gdpr_dpa` fields track vendor compliance certifications
- `compliance_score` in engine penalises missing DPA (`no_gdpr_dpa: 18.0 pts`)
- `contract.py` extracts DPA terms, data ownership clauses, and sub-processor lists from contracts
- `assessment.py` parses vendor security questionnaires to document technical/organisational measures
- `GET /vendors/{id}` returns full compliance posture for audit documentation
- Score breakdown `compliance_gaps` factor directly maps to Art. 28 adequacy assessment

## GDPR Article 33 — Breach Notification (72-hour rule)

**Requirement:** Data controllers must notify supervisory authority within 72 hours of becoming aware of a breach. Vendor breach notification SLA must support this.

**VendorLens coverage:**
- `breach_notification_sla_hours` field stored per vendor (extracted from contracts via `contract.py`)
- Engine penalises SLA > 72h (`sla_long: 6.0 pts`) — directly enforces Art. 33 alignment
- `POST /monitor/inject-breach` simulates breach detection and immediate rescoring
- `POST /notify/breach` sends breach notification email with timestamp for audit trail
- Alert text explicitly references 72h threshold when SLA exceeds it

## NIST SP 800-53 SA-9 — External Information System Services

**Requirement:** Third-party security requirements, ongoing monitoring, and incident response addressing vendor breaches.

**VendorLens coverage:**
- **SA-9(1) Risk assessments:** `engine.py` scores all 5 risk dimensions on every vendor
- **SA-9(2) Identification of functions/ports/protocols:** `systems` field + `data_access` scope tracking
- **SA-9(3) Establish/Document/Review:** `last_assessment_date` tracked; stale assessments escalate risk (`stale_assessment: 6.0 pts`)
- **SA-9(4) Consistent interests:** `concentration_risk` field flags critical dependencies
- **SA-9(5) Processing, storage, service location:** `data_residency` field (EU vs non-EU) + penalty for non-EU PII processing without GDPR DPA
- **Continuous monitoring:** `POST /scheduler/start` runs background rescoring; `POST /monitor/advance-time` simulates time-based risk changes
- **Incident response:** `POST /monitor/inject-breach` triggers immediate rescore and alerts

## SOX Section 404 — Internal Control Over Financial Reporting

**Requirement:** Management must assess controls that third parties have over financial processes. Vendor failure/unavailability represents a control risk.

**VendorLens coverage:**
- `financial_rating` field scored via `engine.py:_financial_score` (poor rating → penalty up to 80 pts)
- `concentration_risk` identifies single-vendor critical dependencies (SOX: continuity risk)
- `recommendation.action = "REPLACE"` for critical financial vendors escalates to CISO/procurement
- `GET /report` category breakdown shows financial-sector vendor exposure
- `score_breakdown.financial_health` provides auditable evidence of third-party financial control assessment
- Override rule #11: Poor financial rating + compliance gap → minimum MEDIUM risk (SOX: combined risk escalation)