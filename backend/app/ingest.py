"""
Ingestion & normalisation pipeline.

Accepts:
  - A CSV file path (vendor_registry or ad-hoc upload)
  - Raw text (pasted email / contract snippet) — simple field extraction
  - Returns conflict flags when an incoming row disagrees with stored data.
"""
from __future__ import annotations

import csv
import io
import re
from datetime import date
from pathlib import Path
from typing import Any

from .db import fetch_vendor, load_labels_csv, load_registry_csv, save_scores
from .engine import score_vendor
from .enrichment import enrich

TODAY = date(2026, 6, 21)

# ── Field normalisation ───────────────────────────────────────────────────

_BOOL_MAP = {"true": True, "yes": True, "1": True, "false": False, "no": False, "0": False}


def _norm_bool(val: Any) -> bool | None:
    if val is None or str(val).strip() == "":
        return None
    return _BOOL_MAP.get(str(val).strip().lower())


def _norm_sensitivity(val: str) -> str:
    v = str(val).strip().upper()
    return v if v in ("LOW", "MEDIUM", "HIGH") else "LOW"


def _norm_access(val: str) -> str:
    v = str(val).strip().lower()
    return "read_write" if "write" in v else "read"


def _norm_date(val: str) -> str | None:
    if not val:
        return None
    val = val.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            from datetime import datetime
            return datetime.strptime(val, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def normalise_row(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalise a raw CSV/dict row into a canonical vendor record."""
    r: dict[str, Any] = {}

    r["vendor_id"] = str(raw.get("vendor_id", raw.get("id", ""))).strip()
    r["name"] = str(raw.get("name", raw.get("vendor_name", ""))).strip()
    r["category"] = str(raw.get("category", raw.get("type", ""))).strip()

    r["contract_start"] = _norm_date(str(raw.get("contract_start", "") or ""))
    r["contract_end"]   = _norm_date(str(raw.get("contract_end", "") or ""))

    r["systems"] = str(raw.get("systems", raw.get("accessed_systems", "")) or "").strip()
    r["data_sensitivity"] = _norm_sensitivity(str(raw.get("data_sensitivity", "LOW") or "LOW"))
    r["access_type"]      = _norm_access(str(raw.get("access_type", "read") or "read"))
    r["access_last_used_at"] = str(raw.get("access_last_used_at", "") or "").strip()

    r["soc2_type2"] = int(_norm_bool(raw.get("soc2_type2")) or False)
    r["soc2_expiry"] = _norm_date(str(raw.get("soc2_expiry", "") or "")) or ""
    r["iso27001"]   = int(_norm_bool(raw.get("iso27001")) or False)
    r["gdpr_dpa"]   = int(_norm_bool(raw.get("gdpr_dpa")) or False)
    r["breach_notification_sla_hours"] = int(raw.get("breach_notification_sla_hours", 72) or 72)
    r["breach_history"] = str(raw.get("breach_history", "") or "").strip()
    r["financial_rating"] = str(raw.get("financial_rating", "BBB") or "BBB").strip()

    r["data_residency"]      = str(raw.get("data_residency", "EU") or "EU").strip()
    r["sub_processor_count"] = int(raw.get("sub_processor_count", 0) or 0)
    r["concentration_risk"]  = str(raw.get("concentration_risk", "") or "").strip().upper()
    r["last_assessment_date"]= _norm_date(str(raw.get("last_assessment_date", "") or "")) or ""
    r["under_investigation"] = int(_norm_bool(raw.get("under_investigation")) or False)
    r["contact_name"]  = str(raw.get("contact_name", "") or "").strip() or None
    r["contact_email"] = str(raw.get("contact_email", "") or "").strip() or None

    # Run enrichment for any missing fields
    r = enrich(r)
    return r


def detect_conflicts(incoming: dict, stored_row: Any) -> list[str]:
    """
    Compare an incoming normalised row against the stored DB row.
    Returns human-readable conflict descriptions.
    """
    if stored_row is None:
        return []
    conflicts = []
    fields_to_check = [
        ("soc2_type2", "SOC 2 Type II status"),
        ("iso27001", "ISO 27001 status"),
        ("gdpr_dpa", "GDPR DPA status"),
        ("data_sensitivity", "Data sensitivity"),
        ("financial_rating", "Financial rating"),
        ("data_residency", "Data residency"),
    ]
    for field, label in fields_to_check:
        inc = str(incoming.get(field, "")).lower()
        stored = str(stored_row[field] if stored_row[field] is not None else "").lower()
        if inc and stored and inc != stored:
            conflicts.append(
                f"{label} conflict: incoming='{inc}' vs stored='{stored}'"
            )
    return conflicts


def ingest_csv_bytes(content: bytes, filename: str = "upload.csv") -> dict:
    """
    Process raw CSV bytes (from HTTP upload or file read).
    Returns summary with rows_processed, conflicts, and any errors.
    """
    from .db import get_conn, save_scores

    text = content.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    processed = 0
    conflicts_found = []
    errors = []

    for raw in rows:
        try:
            normed = normalise_row(raw)
            if not normed.get("vendor_id"):
                errors.append(f"Row missing vendor_id: {raw}")
                continue

            # Conflict detection
            stored = fetch_vendor(normed["vendor_id"])
            conflicts = detect_conflicts(normed, stored)
            if conflicts:
                conflicts_found.append({
                    "vendor_id": normed["vendor_id"],
                    "conflicts": conflicts,
                })

            # Upsert into DB
            with get_conn() as conn:
                conn.execute(
                    """
                    INSERT INTO vendors (
                        vendor_id, name, category, contract_start, contract_end,
                        systems, data_sensitivity, access_type, access_last_used_at,
                        soc2_type2, soc2_expiry, iso27001, gdpr_dpa,
                        breach_notification_sla_hours, breach_history,
                        financial_rating, data_residency, sub_processor_count,
                        concentration_risk, last_assessment_date, under_investigation,
                        contact_name, contact_email
                    ) VALUES (
                        :vendor_id, :name, :category, :contract_start, :contract_end,
                        :systems, :data_sensitivity, :access_type, :access_last_used_at,
                        :soc2_type2, :soc2_expiry, :iso27001, :gdpr_dpa,
                        :breach_notification_sla_hours, :breach_history,
                        :financial_rating, :data_residency, :sub_processor_count,
                        :concentration_risk, :last_assessment_date, :under_investigation,
                        :contact_name, :contact_email
                    )
                    ON CONFLICT(vendor_id) DO UPDATE SET
                        name=excluded.name, category=excluded.category,
                        contract_start=excluded.contract_start,
                        contract_end=excluded.contract_end,
                        systems=excluded.systems,
                        data_sensitivity=excluded.data_sensitivity,
                        access_type=excluded.access_type,
                        access_last_used_at=excluded.access_last_used_at,
                        soc2_type2=excluded.soc2_type2,
                        soc2_expiry=excluded.soc2_expiry,
                        iso27001=excluded.iso27001,
                        gdpr_dpa=excluded.gdpr_dpa,
                        breach_notification_sla_hours=excluded.breach_notification_sla_hours,
                        breach_history=excluded.breach_history,
                        financial_rating=excluded.financial_rating,
                        data_residency=excluded.data_residency,
                        sub_processor_count=excluded.sub_processor_count,
                        concentration_risk=excluded.concentration_risk,
                        last_assessment_date=excluded.last_assessment_date,
                        under_investigation=excluded.under_investigation,
                        contact_name=excluded.contact_name,
                        contact_email=excluded.contact_email
                    """,
                    {**normed, "contact_name": normed.get("contact_name"), "contact_email": normed.get("contact_email")},
                )

            # Score and persist
            scored = score_vendor(normed)
            save_scores(normed["vendor_id"], scored)
            processed += 1

        except Exception as e:
            errors.append(f"Row {raw.get('vendor_id','?')}: {e}")

    return {
        "status": "ok",
        "rows_processed": processed,
        "conflicts": conflicts_found,
        "errors": errors,
        "message": (
            f"Ingested {processed}/{len(rows)} rows from '{filename}'. "
            f"{len(conflicts_found)} conflict(s) flagged."
        ),
    }


def ingest_text(text: str, vendor_id: str | None = None) -> dict:
    """
    Extract fields from free-form text (email, contract paste).
    Uses regex heuristics — supplement with LLM extraction for production.
    """
    fields: dict[str, Any] = {}
    if vendor_id:
        fields["vendor_id"] = vendor_id

    # SOC2
    if re.search(r"soc[\s-]?2\s+type\s+ii", text, re.I):
        fields["soc2_type2"] = True
    # ISO
    if re.search(r"iso\s*27001", text, re.I):
        fields["iso27001"] = True
    # GDPR
    if re.search(r"gdpr|data processing agreement|dpa", text, re.I):
        fields["gdpr_dpa"] = True
    # SLA hours
    m = re.search(r"(\d+)\s*hour", text, re.I)
    if m:
        fields["breach_notification_sla_hours"] = int(m.group(1))
    # Data sensitivity
    if re.search(r"\bpersonal\b|\bpii\b|\bpayment\b|\bfinancial\b", text, re.I):
        fields["data_sensitivity"] = "HIGH"
    # Data residency
    if re.search(r"\beu\b|\beurope\b|\bEEA\b", text):
        fields["data_residency"] = "EU"
    elif re.search(r"\bus\b|\bunited states\b|\basia\b", text, re.I):
        fields["data_residency"] = "non-EU"

    return {"extracted_fields": fields, "raw_text_length": len(text)}


# ── JSON ingest ───────────────────────────────────────────────────────────

def ingest_json_bytes(content: bytes, filename: str = "upload.json") -> dict:
    """Accept a JSON array (or single object) of vendor records."""
    import json as _json
    try:
        payload = _json.loads(content.decode("utf-8", errors="replace"))
    except Exception as e:
        return {"status": "error", "rows_processed": 0, "conflicts": [], "errors": [str(e)],
                "message": "Invalid JSON"}
    rows = payload if isinstance(payload, list) else [payload]
    return _ingest_rows(rows, filename)


# ── Excel ingest (.xlsx) ─────────────────────────────────────────────────

def ingest_excel_bytes(content: bytes, filename: str = "upload.xlsx") -> dict:
    """Accept an Excel workbook (.xlsx). First sheet, first row = headers."""
    try:
        import openpyxl  # type: ignore
    except ImportError:
        return {"status": "error", "rows_processed": 0, "conflicts": [],
                "errors": ["openpyxl not installed — run: pip install openpyxl"],
                "message": "openpyxl missing"}
    import io as _io
    wb = openpyxl.load_workbook(_io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    headers = [str(h).strip() if h is not None else "" for h in next(rows_iter, [])]
    rows = []
    for row in rows_iter:
        rows.append({headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))})
    wb.close()
    return _ingest_rows(rows, filename)


# ── Email / free-text ingest ─────────────────────────────────────────────

_KV_PATTERNS = [
    # "Vendor Name: Acme Corp" or "vendor_name = Acme Corp"
    re.compile(r"^[\s\-\*]*(?P<key>[\w\s]+?)\s*[:=]\s*(?P<val>.+)$", re.M),
]

# Map common email field names → canonical vendor field names
_EMAIL_FIELD_MAP: dict[str, str] = {
    "vendor name": "name",
    "vendor_name": "name",
    "company": "name",
    "company name": "name",
    "id": "vendor_id",
    "vendor id": "vendor_id",
    "vendor_id": "vendor_id",
    "category": "category",
    "type": "category",
    "contract end": "contract_end",
    "contract_end": "contract_end",
    "contract end date": "contract_end",
    "contract start": "contract_start",
    "data sensitivity": "data_sensitivity",
    "data_sensitivity": "data_sensitivity",
    "access type": "access_type",
    "access_type": "access_type",
    "soc2": "soc2_type2",
    "soc 2": "soc2_type2",
    "soc2 type ii": "soc2_type2",
    "soc 2 type ii": "soc2_type2",
    "iso27001": "iso27001",
    "iso 27001": "iso27001",
    "gdpr dpa": "gdpr_dpa",
    "gdpr_dpa": "gdpr_dpa",
    "dpa": "gdpr_dpa",
    "breach sla": "breach_notification_sla_hours",
    "breach notification sla": "breach_notification_sla_hours",
    "financial rating": "financial_rating",
    "rating": "financial_rating",
    "data residency": "data_residency",
    "data_residency": "data_residency",
    "contact name": "contact_name",
    "contact_name": "contact_name",
    "contact email": "contact_email",
    "contact_email": "contact_email",
    "systems": "systems",
    "concentration risk": "concentration_risk",
    "concentration_risk": "concentration_risk",
    "sub processor count": "sub_processor_count",
    "sub_processor_count": "sub_processor_count",
    "under investigation": "under_investigation",
}


def _extract_email_records(text: str) -> list[dict[str, Any]]:
    """
    Parse email body text into one or more vendor dicts.
    Handles: key:value blocks, forwarded email sections, table-like formatting.
    Multiple vendors separated by blank lines or "---" dividers.
    """
    # Split on dividers (blank lines ≥2, ---, ===)
    sections = re.split(r"\n{2,}|^-{3,}$|^={3,}$", text, flags=re.M)
    records: list[dict] = []

    for section in sections:
        if not section.strip():
            continue
        fields: dict[str, Any] = {}
        for pat in _KV_PATTERNS:
            for m in pat.finditer(section):
                raw_key = m.group("key").strip().lower()
                val = m.group("val").strip()
                canonical = _EMAIL_FIELD_MAP.get(raw_key)
                if canonical:
                    fields[canonical] = val
        if fields:
            records.append(fields)

    # Fallback: if no structured records, treat whole text as one record
    if not records:
        fields = {}
        # Detect bool certs from text
        if re.search(r"soc[\s-]?2\s+type\s+ii", text, re.I):
            fields["soc2_type2"] = "true"
        if re.search(r"iso\s*27001", text, re.I):
            fields["iso27001"] = "true"
        if re.search(r"\bgdpr\b|\bdpa\b", text, re.I):
            fields["gdpr_dpa"] = "true"
        # Sensitivity keywords
        if re.search(r"\bpii\b|\bpayment\b|\bpersonal data\b", text, re.I):
            fields["data_sensitivity"] = "HIGH"
        if fields:
            records.append(fields)

    return records


def ingest_email_text(text: str) -> dict:
    """
    Parse a pasted email body and ingest any vendor records found.
    Returns standard ingest summary.
    """
    raw_records = _extract_email_records(text)
    if not raw_records:
        return {"status": "ok", "rows_processed": 0, "conflicts": [], "errors": [],
                "message": "No vendor records detected in email text",
                "extracted_fields": []}
    result = _ingest_rows(raw_records, "email_paste")
    result["extracted_fields"] = raw_records
    return result


# ── YAML ingest ───────────────────────────────────────────────────────────

def ingest_yaml_bytes(content: bytes, filename: str = "upload.yaml") -> dict:
    """Accept a YAML file containing a list of vendor records."""
    try:
        import yaml  # type: ignore
    except ImportError:
        # Fallback: minimal YAML-to-dict via regex for simple cases
        text = content.decode("utf-8", errors="replace")
        return {"status": "error", "rows_processed": 0, "conflicts": [],
                "errors": ["PyYAML not installed — run: pip install pyyaml"],
                "message": "pyyaml missing"}
    payload = yaml.safe_load(content.decode("utf-8", errors="replace"))
    rows = payload if isinstance(payload, list) else ([payload] if isinstance(payload, dict) else [])
    return _ingest_rows(rows, filename)


# ── Shared row processor ──────────────────────────────────────────────────

def _ingest_rows(rows: list[dict], source: str) -> dict:
    """Normalise and upsert a list of raw dicts. Shared by all parsers."""
    from .db import get_conn

    processed = 0
    conflicts_found = []
    errors = []

    for raw in rows:
        try:
            # Convert all values to strings for normalise_row compatibility
            str_row = {k: (str(v) if v is not None else "") for k, v in raw.items()}
            normed = normalise_row(str_row)
            if not normed.get("vendor_id"):
                # Auto-generate ID if missing
                import uuid
                normed["vendor_id"] = "V" + uuid.uuid4().hex[:6].upper()
                if not normed.get("name"):
                    errors.append(f"Row skipped — no vendor_id or name: {raw}")
                    continue

            stored = fetch_vendor(normed["vendor_id"])
            conflicts = detect_conflicts(normed, stored)
            if conflicts:
                conflicts_found.append({"vendor_id": normed["vendor_id"], "conflicts": conflicts})

            with get_conn() as conn:
                conn.execute(
                    """
                    INSERT INTO vendors (
                        vendor_id, name, category, contract_start, contract_end,
                        systems, data_sensitivity, access_type, access_last_used_at,
                        soc2_type2, soc2_expiry, iso27001, gdpr_dpa,
                        breach_notification_sla_hours, breach_history,
                        financial_rating, data_residency, sub_processor_count,
                        concentration_risk, last_assessment_date, under_investigation,
                        contact_name, contact_email
                    ) VALUES (
                        :vendor_id, :name, :category, :contract_start, :contract_end,
                        :systems, :data_sensitivity, :access_type, :access_last_used_at,
                        :soc2_type2, :soc2_expiry, :iso27001, :gdpr_dpa,
                        :breach_notification_sla_hours, :breach_history,
                        :financial_rating, :data_residency, :sub_processor_count,
                        :concentration_risk, :last_assessment_date, :under_investigation,
                        :contact_name, :contact_email
                    )
                    ON CONFLICT(vendor_id) DO UPDATE SET
                        name=excluded.name, category=excluded.category,
                        contract_start=excluded.contract_start,
                        contract_end=excluded.contract_end,
                        systems=excluded.systems,
                        data_sensitivity=excluded.data_sensitivity,
                        access_type=excluded.access_type,
                        access_last_used_at=excluded.access_last_used_at,
                        soc2_type2=excluded.soc2_type2,
                        soc2_expiry=excluded.soc2_expiry,
                        iso27001=excluded.iso27001,
                        gdpr_dpa=excluded.gdpr_dpa,
                        breach_notification_sla_hours=excluded.breach_notification_sla_hours,
                        breach_history=excluded.breach_history,
                        financial_rating=excluded.financial_rating,
                        data_residency=excluded.data_residency,
                        sub_processor_count=excluded.sub_processor_count,
                        concentration_risk=excluded.concentration_risk,
                        last_assessment_date=excluded.last_assessment_date,
                        under_investigation=excluded.under_investigation,
                        contact_name=excluded.contact_name,
                        contact_email=excluded.contact_email
                    """,
                    normed,
                )

            scored = score_vendor(normed)
            save_scores(normed["vendor_id"], scored)
            processed += 1

        except Exception as e:
            errors.append(f"Row {raw.get('vendor_id', raw.get('name', '?'))}: {e}")

    return {
        "status": "ok" if not errors else "partial",
        "rows_processed": processed,
        "conflicts": conflicts_found,
        "errors": errors,
        "message": (
            f"Ingested {processed}/{len(rows)} rows from '{source}'. "
            f"{len(conflicts_found)} conflict(s) flagged."
            + (f" {len(errors)} error(s)." if errors else "")
        ),
    }


# ── Auto-detect dispatcher ────────────────────────────────────────────────

def ingest_auto(content: bytes, filename: str, content_type: str = "") -> dict:
    """
    Auto-detect format from filename extension or content_type and dispatch
    to the appropriate parser.
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    ct = content_type.lower()

    if ext in ("xlsx", "xls") or "spreadsheet" in ct or "excel" in ct:
        return ingest_excel_bytes(content, filename)
    if ext == "json" or "json" in ct:
        return ingest_json_bytes(content, filename)
    if ext in ("yaml", "yml") or "yaml" in ct:
        return ingest_yaml_bytes(content, filename)
    # Default: CSV
    return ingest_csv_bytes(content, filename)
