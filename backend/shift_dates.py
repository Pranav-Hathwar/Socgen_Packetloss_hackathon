"""
One-off: re-anchor sample_data/vendor_registry.csv from the old demo epoch
(2024-06-19) to the new one (2026-06-21).

Every date in the dataset is shifted forward by the SAME delta as the engine's
TODAY constant, so all relative relationships (recent breaches, expiring certs,
orphaned access, stale assessments) — and therefore the ground-truth labels and
eval results — are preserved exactly.

Run once:  python backend/shift_dates.py
"""
import csv
import re
from datetime import date, datetime, timedelta
from pathlib import Path

OLD_TODAY = date(2024, 6, 19)
NEW_TODAY = date(2026, 6, 21)
DELTA = timedelta(days=(NEW_TODAY - OLD_TODAY).days)  # 732 days

CSV = Path(__file__).parent.parent / "sample_data" / "vendor_registry.csv"

DATE_COLS = ["contract_start", "contract_end", "soc2_expiry", "last_assessment_date"]
DATETIME_COLS = ["access_last_used_at"]
_DATE_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")


def shift_date(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return s
    d = date.fromisoformat(s)
    return (d + DELTA).isoformat()


def shift_datetime(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return s
    dt = datetime.fromisoformat(s)
    return (dt + DELTA).isoformat()


def shift_embedded(s: str) -> str:
    """Shift every YYYY-MM-DD found in a free-text field (breach_history)."""
    def repl(m: re.Match) -> str:
        d = date.fromisoformat(m.group(0))
        return (d + DELTA).isoformat()
    return _DATE_RE.sub(repl, s or "")


def main() -> None:
    with open(CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)

    for r in rows:
        for c in DATE_COLS:
            if c in r:
                r[c] = shift_date(r[c])
        for c in DATETIME_COLS:
            if c in r:
                r[c] = shift_datetime(r[c])
        if "breach_history" in r:
            r["breach_history"] = shift_embedded(r["breach_history"])

    with open(CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    print(f"Shifted {len(rows)} vendor rows by {DELTA.days} days "
          f"({OLD_TODAY} -> {NEW_TODAY}).")


if __name__ == "__main__":
    main()
