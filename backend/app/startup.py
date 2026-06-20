"""Run once at application startup: init DB, load CSVs, score all vendors."""
from __future__ import annotations

from .auth import hash_password
from .db import (
    create_user,
    fetch_all_vendors,
    get_conn,
    get_user_by_email,
    init_db,
    load_labels_csv,
    load_registry_csv,
    save_scores,
)
from .engine import score_vendor

_DEMO_USERS = [
    ("admin@vendorlens.com",   "Admin@Demo1",   "ADMIN"),
    ("analyst@vendorlens.com", "Analyst@Demo1", "ANALYST"),
    ("auditor@vendorlens.com", "Auditor@Demo1", "AUDITOR"),
]


def _seed_demo_users() -> int:
    seeded = 0
    for email, password, role in _DEMO_USERS:
        if not get_user_by_email(email):
            create_user(email, hash_password(password), role)
            seeded += 1
    return seeded


def bootstrap() -> dict:
    init_db()
    users_seeded = _seed_demo_users()
    reg = load_registry_csv()
    lbl = load_labels_csv()

    rows = fetch_all_vendors()
    scored = 0
    history_seeded = 0
    for row in rows:
        raw = dict(row)
        if raw.get("risk_score") is None:
            result = score_vendor(raw)
            save_scores(raw["vendor_id"], result, trigger="initial")
            scored += 1
        else:
            # Ensure score_history has at least one record per vendor
            with get_conn() as conn:
                count = conn.execute(
                    "SELECT COUNT(*) FROM score_history WHERE vendor_id=?",
                    (raw["vendor_id"],),
                ).fetchone()[0]
            if count == 0:
                # Seed from current stored score
                result = {
                    "risk_score": raw["risk_score"],
                    "risk_level": raw["risk_level"],
                    "rag": raw.get("rag", "GREEN"),
                    "score_breakdown": {},
                    "risk_factors": [],
                    "anomaly_flags": [],
                    "recommendation": {
                        "action": raw.get("recommendation_action", "MONITOR"),
                        "detail": raw.get("recommendation_detail", ""),
                    },
                    "alerts": [],
                }
                save_scores(raw["vendor_id"], result, trigger="seed")
                history_seeded += 1

    return {
        "vendors_loaded": reg,
        "labels_loaded": lbl,
        "vendors_scored": scored,
        "history_seeded": history_seeded,
        "users_seeded": users_seeded,
    }
