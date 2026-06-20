#!/usr/bin/env python3
"""
VendorLens Self-Evaluation
Compares engine risk scores against ground-truth labels.
Run from project root: python evaluate.py
"""
import csv
import sqlite3
from pathlib import Path

DB_PATH = Path("backend/vendorlens.db")
LABELS_PATH = Path("sample_data/vendor_labels.csv")

# Vendors with risk_score above this threshold are predicted as anomalous
THRESHOLD = 20.0


def main():
    # Load ground truth labels
    labels = {}
    with open(LABELS_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            labels[row["vendor_id"]] = {
                "is_anomaly": row["is_anomaly"].strip().lower() == "true",
                "severity": row.get("severity", "").strip(),
                "anomaly_type": row.get("anomaly_type", "").strip(),
            }

    # Load engine scores from DB
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute(
        "SELECT vendor_id, risk_score, risk_level FROM vendors WHERE risk_score IS NOT NULL"
    ).fetchall()
    conn.close()

    scores = {r[0]: {"score": float(r[1]), "level": r[2]} for r in rows}

    # Match on common vendor IDs
    common = [vid for vid in labels if vid in scores]
    if not common:
        print("No matching vendor IDs between labels and DB.")
        print(f"  Labels has: {list(labels.keys())[:5]} ...")
        print(f"  DB has:     {list(scores.keys())[:5]} ...")
        return

    y_true = [int(labels[vid]["is_anomaly"]) for vid in common]
    y_pred = [int(scores[vid]["score"] > THRESHOLD) for vid in common]

    # Precision, Recall, F1
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall    = tp / (tp + fn) if (tp + fn) else 0.0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    print("=" * 50)
    print("  VendorLens — Engine Self-Evaluation")
    print("=" * 50)
    print(f"  Vendors evaluated   : {len(common)}")
    print(f"  Ground truth anomaly: {sum(y_true)}  /  clean: {sum(1 for t in y_true if t == 0)}")
    print(f"  Predicted anomaly   : {sum(y_pred)}  /  clean: {sum(1 for p in y_pred if p == 0)}")
    print(f"  Score threshold     : > {THRESHOLD}")
    print()
    print(f"  Precision : {precision:.1%}   (of flagged vendors, how many were real risks)")
    print(f"  Recall    : {recall:.1%}   (of real risks, how many did we catch)")
    print(f"  F1 Score  : {f1:.1%}")
    print()
    print(f"  Confusion Matrix:")
    print(f"    TP={tp}  FP={fp}")
    print(f"    FN={fn}  TN={tn}")

    # CRITICAL vendor recall — missing these is worst case
    critical_ids = [vid for vid in common if labels[vid]["severity"] == "CRITICAL"]
    if critical_ids:
        crit_caught = sum(1 for vid in critical_ids if scores[vid]["score"] > THRESHOLD)
        crit_recall = crit_caught / len(critical_ids)
        print()
        print(f"  CRITICAL vendor recall: {crit_recall:.1%}  ({crit_caught}/{len(critical_ids)} caught)")
        missed_critical = [vid for vid in critical_ids if scores[vid]["score"] <= THRESHOLD]
        if missed_critical:
            print(f"  Missed CRITICAL vendors: {missed_critical}")

    # Show false negatives (missed anomalies)
    fn_ids = [vid for vid, t, p in zip(common, y_true, y_pred) if t == 1 and p == 0]
    if fn_ids:
        print()
        print(f"  Missed anomalies (FN={len(fn_ids)}):")
        for vid in fn_ids:
            s = scores[vid]["score"]
            atype = labels[vid]["anomaly_type"]
            print(f"    {vid}  score={s:.1f}  type={atype}")

    print("=" * 50)


if __name__ == "__main__":
    main()
