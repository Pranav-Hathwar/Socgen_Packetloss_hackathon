"""SQLite data layer — init schema, load CSVs, fetch vendors."""
from __future__ import annotations

import csv
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Generator, Optional

DB_PATH = Path(__file__).parent.parent / "vendorlens.db"
SAMPLE_DATA = Path(__file__).parent.parent.parent / "sample_data"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_conn() -> Generator[sqlite3.Connection, None, None]:
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


DDL = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('ADMIN','ANALYST','AUDITOR')),
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
    vendor_id            TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    category             TEXT,
    contract_start       TEXT,
    contract_end         TEXT,
    systems              TEXT,          -- comma-separated
    data_sensitivity     TEXT,
    access_type          TEXT,
    access_last_used_at  TEXT,
    soc2_type2           INTEGER,
    soc2_expiry          TEXT,
    iso27001             INTEGER,
    gdpr_dpa             INTEGER,
    breach_notification_sla_hours INTEGER,
    breach_history       TEXT,          -- pipe-separated events
    financial_rating     TEXT,
    data_residency       TEXT DEFAULT 'EU',
    sub_processor_count  INTEGER DEFAULT 0,
    concentration_risk   TEXT DEFAULT 'LOW',
    last_assessment_date TEXT,
    under_investigation  INTEGER DEFAULT 0,
    contact_name         TEXT,
    contact_email        TEXT,
    -- engine outputs stored back
    risk_score           REAL,
    risk_level           TEXT,
    rag                  TEXT,
    score_breakdown      TEXT,          -- JSON
    risk_factors         TEXT,          -- JSON array
    anomaly_flags        TEXT,          -- JSON array
    recommendation_action TEXT,
    recommendation_detail TEXT,
    alerts               TEXT,          -- JSON array
    scored_at            TEXT
);

CREATE TABLE IF NOT EXISTS score_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id   TEXT NOT NULL,
    risk_score  REAL,
    risk_level  TEXT,
    rag         TEXT,
    scored_at   TEXT NOT NULL,
    trigger     TEXT DEFAULT 'rescore'
);

CREATE TABLE IF NOT EXISTS remediations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id    TEXT NOT NULL,
    issue        TEXT NOT NULL,
    resolved_by  TEXT,
    resolved_at  TEXT NOT NULL,
    score_before REAL,
    score_after  REAL,
    note         TEXT
);

CREATE TABLE IF NOT EXISTS cert_documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id   TEXT NOT NULL,
    cert_type   TEXT NOT NULL,
    filename    TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    expiry_date TEXT
);

CREATE TABLE IF NOT EXISTS labels (
    vendor_id    TEXT PRIMARY KEY,
    is_anomaly   INTEGER,
    anomaly_type TEXT,
    severity     TEXT,
    explanation  TEXT
);
"""


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(DDL)
        # Migrations for existing DBs
        _migrate(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    existing = {row[1] for row in conn.execute("PRAGMA table_info(vendors)").fetchall()}
    for col, defn in [("contact_name", "TEXT"), ("contact_email", "TEXT")]:
        if col not in existing:
            conn.execute(f"ALTER TABLE vendors ADD COLUMN {col} {defn}")


def _parse_bool(val: str | bool | int) -> int:
    if isinstance(val, bool):
        return int(val)
    if isinstance(val, int):
        return val
    return 1 if str(val).lower() in ("true", "1", "yes") else 0


def load_registry_csv(path: Path | None = None) -> int:
    """
    Seed vendors table from CSV. Uses INSERT OR IGNORE so existing rows
    (including user-ingested data) are never overwritten on restart.
    Returns count of newly inserted rows.
    """
    p = path or (SAMPLE_DATA / "vendor_registry.csv")
    if not p.exists():
        return 0

    with get_conn() as conn:
        with open(p, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))

        count = 0
        for r in rows:
            conn.execute(
                """
                INSERT OR IGNORE INTO vendors (
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
                """,
                {
                    **r,
                    "soc2_type2": _parse_bool(r.get("soc2_type2", False)),
                    "iso27001": _parse_bool(r.get("iso27001", False)),
                    "gdpr_dpa": _parse_bool(r.get("gdpr_dpa", False)),
                    "under_investigation": _parse_bool(r.get("under_investigation", False)),
                    "data_residency": r.get("data_residency", "EU") or "EU",
                    "sub_processor_count": int(r.get("sub_processor_count", 0) or 0),
                    "concentration_risk": r.get("concentration_risk", "LOW") or "LOW",
                    "contact_name": r.get("contact_name") or None,
                    "contact_email": r.get("contact_email") or None,
                },
            )
            count += conn.execute("SELECT changes()").fetchone()[0]
    return count


def load_labels_csv(path: Path | None = None) -> int:
    p = path or (SAMPLE_DATA / "vendor_labels.csv")
    if not p.exists():
        return 0

    with get_conn() as conn:
        with open(p, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        for r in rows:
            conn.execute(
                """
                INSERT INTO labels (vendor_id, is_anomaly, anomaly_type, severity, explanation)
                VALUES (:vendor_id, :is_anomaly, :anomaly_type, :severity, :explanation)
                ON CONFLICT(vendor_id) DO UPDATE SET
                    is_anomaly=excluded.is_anomaly,
                    anomaly_type=excluded.anomaly_type,
                    severity=excluded.severity,
                    explanation=excluded.explanation
                """,
                {**r, "is_anomaly": _parse_bool(r.get("is_anomaly", False))},
            )
    return len(rows)


def save_scores(vendor_id: str, scored: dict, trigger: str = "rescore") -> None:
    """Write engine outputs back to the vendors table and append to score_history."""
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE vendors SET
                risk_score=:risk_score, risk_level=:risk_level, rag=:rag,
                score_breakdown=:score_breakdown, risk_factors=:risk_factors,
                anomaly_flags=:anomaly_flags,
                recommendation_action=:recommendation_action,
                recommendation_detail=:recommendation_detail,
                alerts=:alerts, scored_at=:scored_at
            WHERE vendor_id=:vendor_id
            """,
            {
                "vendor_id": vendor_id,
                "risk_score": scored["risk_score"],
                "risk_level": scored["risk_level"],
                "rag": scored["rag"],
                "score_breakdown": json.dumps(scored["score_breakdown"]),
                "risk_factors": json.dumps(scored["risk_factors"]),
                "anomaly_flags": json.dumps(scored["anomaly_flags"]),
                "recommendation_action": scored["recommendation"]["action"],
                "recommendation_detail": scored["recommendation"]["detail"],
                "alerts": json.dumps(scored["alerts"]),
                "scored_at": now,
            },
        )
        conn.execute(
            "INSERT INTO score_history (vendor_id, risk_score, risk_level, rag, scored_at, trigger) VALUES (?,?,?,?,?,?)",
            (vendor_id, scored["risk_score"], scored["risk_level"], scored["rag"], now, trigger),
        )


def fetch_all_vendors() -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM vendors ORDER BY risk_score DESC NULLS LAST").fetchall()


def fetch_vendor(vendor_id: str) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM vendors WHERE vendor_id=?", (vendor_id,)
        ).fetchone()


def fetch_labels() -> dict[str, dict]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM labels").fetchall()
    return {r["vendor_id"]: dict(r) for r in rows}


# ── User CRUD ─────────────────────────────────────────────────────────────

def create_user(email: str, hashed_password: str, role: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, hashed_password, role, created_at) VALUES (?,?,?,?)",
            (email, hashed_password, role, datetime.utcnow().isoformat()),
        )
        return cur.lastrowid


def get_user_by_email(email: str) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE email=?", (email,)
        ).fetchone()


def list_users() -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("SELECT id, email, role, created_at FROM users").fetchall()


def fetch_score_history(vendor_id: str) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM score_history WHERE vendor_id=? ORDER BY scored_at ASC",
            (vendor_id,),
        ).fetchall()


def add_remediation(vendor_id: str, issue: str, resolved_by: str,
                    score_before: float, score_after: float, note: str = "") -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO remediations (vendor_id, issue, resolved_by, resolved_at, score_before, score_after, note) VALUES (?,?,?,?,?,?,?)",
            (vendor_id, issue, resolved_by, datetime.utcnow().isoformat(), score_before, score_after, note),
        )
        return cur.lastrowid


def fetch_remediations(vendor_id: str) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM remediations WHERE vendor_id=? ORDER BY resolved_at DESC",
            (vendor_id,),
        ).fetchall()


def delete_vendor(vendor_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM vendors WHERE vendor_id=?", (vendor_id,))
        return cur.rowcount > 0


def update_vendor_fields(vendor_id: str, fields: dict) -> bool:
    if not fields:
        return False
    allowed = {
        "contact_name", "contact_email", "category", "contract_end",
        "data_sensitivity", "access_type", "soc2_type2", "soc2_expiry",
        "iso27001", "gdpr_dpa", "financial_rating", "concentration_risk",
        "under_investigation", "breach_notification_sla_hours",
    }
    safe = {k: v for k, v in fields.items() if k in allowed}
    if not safe:
        return False
    sets = ", ".join(f"{k}=?" for k in safe)
    vals = list(safe.values()) + [vendor_id]
    with get_conn() as conn:
        cur = conn.execute(f"UPDATE vendors SET {sets}, risk_score=NULL WHERE vendor_id=?", vals)
        return cur.rowcount > 0


def add_cert_document(vendor_id: str, cert_type: str, filename: str,
                      file_path: str, expiry_date: str = "") -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO cert_documents (vendor_id, cert_type, filename, file_path, uploaded_at, expiry_date) VALUES (?,?,?,?,?,?)",
            (vendor_id, cert_type, filename, file_path, datetime.utcnow().isoformat(), expiry_date),
        )
        return cur.lastrowid


def fetch_cert_documents(vendor_id: str) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM cert_documents WHERE vendor_id=? ORDER BY uploaded_at DESC",
            (vendor_id,),
        ).fetchall()


def fetch_cert_document(cert_id: int, vendor_id: str) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM cert_documents WHERE id=? AND vendor_id=?",
            (cert_id, vendor_id),
        ).fetchone()


def create_vendor(data: dict) -> str:
    """Insert a new vendor row. Returns the assigned vendor_id."""
    import uuid as _uuid
    vendor_id = data.get("vendor_id") or "V" + _uuid.uuid4().hex[:6].upper()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO vendors (
                vendor_id, name, category, contract_start, contract_end,
                systems, data_sensitivity, access_type, access_last_used_at,
                soc2_type2, soc2_expiry, iso27001, gdpr_dpa,
                breach_notification_sla_hours, financial_rating,
                data_residency, sub_processor_count, concentration_risk,
                last_assessment_date, under_investigation, breach_history,
                contact_name, contact_email
            ) VALUES (
                :vendor_id,:name,:category,:contract_start,:contract_end,
                :systems,:data_sensitivity,:access_type,:access_last_used_at,
                :soc2_type2,:soc2_expiry,:iso27001,:gdpr_dpa,
                :breach_notification_sla_hours,:financial_rating,
                :data_residency,:sub_processor_count,:concentration_risk,
                :last_assessment_date,:under_investigation,:breach_history,
                :contact_name,:contact_email
            )
            """,
            {
                "vendor_id": vendor_id,
                "name": data["name"],
                "category": data.get("category", "Other"),
                "contract_start": data.get("contract_start") or date.today().isoformat(),
                "contract_end": data.get("contract_end") or "",
                "systems": data.get("systems") or "",
                "data_sensitivity": data.get("data_sensitivity", "LOW"),
                "access_type": data.get("access_type", "read"),
                "access_last_used_at": date.today().isoformat(),
                "soc2_type2": _parse_bool(data.get("soc2_type2", False)),
                "soc2_expiry": data.get("soc2_expiry") or "",
                "iso27001": _parse_bool(data.get("iso27001", False)),
                "gdpr_dpa": _parse_bool(data.get("gdpr_dpa", False)),
                "breach_notification_sla_hours": int(data.get("breach_notification_sla_hours") or 72),
                "financial_rating": data.get("financial_rating") or "BBB",
                "data_residency": data.get("data_residency") or "EU",
                "sub_processor_count": int(data.get("sub_processor_count") or 0),
                "concentration_risk": data.get("concentration_risk") or "LOW",
                "last_assessment_date": data.get("last_assessment_date") or date.today().isoformat(),
                "under_investigation": _parse_bool(data.get("under_investigation", False)),
                "breach_history": data.get("breach_history") or "",
                "contact_name": data.get("contact_name"),
                "contact_email": data.get("contact_email"),
            },
        )
    return vendor_id
