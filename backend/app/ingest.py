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

TODAY = date(2024, 6, 19)

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
                        concentration_risk, last_assessment_date, under_investigation
                    ) VALUES (
                        :vendor_id, :name, :category, :contract_start, :contract_end,
                        :systems, :data_sensitivity, :access_type, :access_last_used_at,
                        :soc2_type2, :soc2_expiry, :iso27001, :gdpr_dpa,
                        :breach_notification_sla_hours, :breach_history,
                        :financial_rating, :data_residency, :sub_processor_count,
                        :concentration_risk, :last_assessment_date, :under_investigation
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
                        under_investigation=excluded.under_investigation
                    """,
                    normed,
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
