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


def _parse_bool(val: str | bool | int) -> int:
    if isinstance(val, bool):
        return int(val)
    if isinstance(val, int):
        return val
    return 1 if str(val).lower() in ("true", "1", "yes") else 0


def load_registry_csv(path: Path | None = None) -> int:
    """Load vendor_registry.csv into vendors table. Returns rows upserted."""
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
                {
                    **r,
                    "soc2_type2": _parse_bool(r.get("soc2_type2", False)),
                    "iso27001": _parse_bool(r.get("iso27001", False)),
                    "gdpr_dpa": _parse_bool(r.get("gdpr_dpa", False)),
                    "under_investigation": _parse_bool(r.get("under_investigation", False)),
                    "data_residency": r.get("data_residency", "EU") or "EU",
                    "sub_processor_count": int(r.get("sub_processor_count", 0) or 0),
                    "concentration_risk": r.get("concentration_risk", "LOW") or "LOW",
                },
            )
            count += 1
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


def save_scores(vendor_id: str, scored: dict) -> None:
    """Write engine outputs back to the vendors table."""
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
                "scored_at": datetime.utcnow().isoformat(),
            },
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
