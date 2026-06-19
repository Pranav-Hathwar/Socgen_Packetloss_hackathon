"""Run once at application startup: init DB, load CSVs, score all vendors."""
from __future__ import annotations

from .db import (
    fetch_all_vendors,
    init_db,
    load_labels_csv,
    load_registry_csv,
    save_scores,
)
from .engine import score_vendor


def bootstrap() -> dict:
    init_db()
    reg = load_registry_csv()
    lbl = load_labels_csv()

    rows = fetch_all_vendors()
    scored = 0
    for row in rows:
        raw = dict(row)
        if raw.get("risk_score") is None:
            result = score_vendor(raw)
            save_scores(raw["vendor_id"], result)
            scored += 1

    return {"vendors_loaded": reg, "labels_loaded": lbl, "vendors_scored": scored}
