"""
VendorLens Eval Harness
=======================
Measures precision, recall, and CRITICAL recall against vendor_labels.csv.

Run:  python backend/eval.py
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).parent))

from app.db import init_db, load_labels_csv, load_registry_csv, fetch_all_vendors, fetch_labels, save_scores
from app.engine import score_vendor
from app.ingest import normalise_row

SAMPLE = Path(__file__).parent.parent / "sample_data"


def run_eval(verbose: bool = True) -> dict:
    # ── Setup ─────────────────────────────────────────────────────────────
    init_db()
    reg_count = load_registry_csv(SAMPLE / "vendor_registry.csv")
    lbl_count = load_labels_csv(SAMPLE / "vendor_labels.csv")

    if verbose:
        print(f"Loaded {reg_count} vendors, {lbl_count} labels")

    # ── Score all vendors ─────────────────────────────────────────────────
    rows = fetch_all_vendors()
    scored_map: dict[str, dict] = {}
    for row in rows:
        raw = dict(row)
        result = score_vendor(raw)
        save_scores(raw["vendor_id"], result)
        scored_map[raw["vendor_id"]] = result

    labels = fetch_labels()

    # ── Metrics ──────────────────────────────────────────────────────────
    # We define "predicted anomaly" as risk_level in (CRITICAL, HIGH, MEDIUM)
    # — i.e., anything NOT LOW.
    # But for precision/recall against is_anomaly we use NOT LOW.
    # For CRITICAL recall: ground truth severity==CRITICAL vs predicted CRITICAL.

    tp = fp = fn = tn = 0
    crit_tp = crit_fn = 0
    misses: list[str] = []
    false_alarms: list[str] = []
    crit_misses: list[str] = []

    for vid, lbl in labels.items():
        gt_anomaly = bool(int(lbl.get("is_anomaly", 0) or 0))
        gt_critical = str(lbl.get("severity", "")).upper() == "CRITICAL"

        scored = scored_map.get(vid)
        if scored is None:
            if verbose:
                print(f"  WARNING: no score for {vid}")
            continue

        predicted_level = scored["risk_level"]
        predicted_anomaly = predicted_level != "LOW"
        predicted_critical = predicted_level == "CRITICAL"

        if gt_anomaly and predicted_anomaly:
            tp += 1
        elif gt_anomaly and not predicted_anomaly:
            fn += 1
            misses.append(f"  MISS  {vid} (gt={lbl['severity']}, pred={predicted_level}, score={scored['risk_score']:.1f})")
        elif not gt_anomaly and predicted_anomaly:
            fp += 1
            false_alarms.append(f"  FALSE_ALARM  {vid} (pred={predicted_level}, score={scored['risk_score']:.1f})")
        else:
            tn += 1

        if gt_critical and predicted_critical:
            crit_tp += 1
        elif gt_critical and not predicted_critical:
            crit_fn += 1
            crit_misses.append(f"  CRIT_MISS  {vid} (pred={predicted_level}, score={scored['risk_score']:.1f}): {lbl['explanation'][:80]}")

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    crit_recall = crit_tp / (crit_tp + crit_fn) if (crit_tp + crit_fn) > 0 else 0.0

    # ── Per-vendor detail ─────────────────────────────────────────────────
    if verbose:
        print()
        print("=" * 70)
        print("VENDOR SCORES")
        print("=" * 70)
        header = f"{'ID':<6} {'Name':<25} {'Score':>6} {'Pred':<9} {'GT':<9} {'OK?'}"
        print(header)
        print("-" * 70)
        for vid in sorted(scored_map.keys()):
            s = scored_map[vid]
            lbl = labels.get(vid, {})
            gt_a = bool(int(lbl.get("is_anomaly", 0) or 0))
            gt_sev = lbl.get("severity", "-") or "-"
            pred = s["risk_level"]
            pred_a = pred != "LOW"
            ok = "OK" if gt_a == pred_a else "MISS" if gt_a and not pred_a else "FP"
            e_row = s.get("_enriched", {})
            print(f"{vid:<6} {s['vendor_id']:<6} score={s['risk_score']:5.1f} {pred:<9} gt={gt_sev:<9} {ok}")

        print()
        print("=" * 70)
        print("EVAL REPORT")
        print("=" * 70)
        print(f"  Vendors evaluated : {len(labels)}")
        print(f"  TP={tp}  FP={fp}  FN={fn}  TN={tn}")
        print(f"  Precision         : {precision:.3f}")
        print(f"  Recall            : {recall:.3f}")
        print(f"  F1                : {f1:.3f}")
        print(f"  CRITICAL recall   : {crit_recall:.3f}  ({crit_tp}/{crit_tp+crit_fn})")

        if misses:
            print()
            print("MISSED ANOMALIES (FN):")
            for m in misses: print(m)
        if false_alarms:
            print()
            print("FALSE ALARMS (FP):")
            for m in false_alarms: print(m)
        if crit_misses:
            print()
            print("CRITICAL MISSES:")
            for m in crit_misses: print(m)

        print()
        if crit_recall == 1.0:
            print("*** CRITICAL recall = 100% ***")
        else:
            print(f"!!! CRITICAL recall below 100%: {crit_recall:.1%} — add override rules !!!")

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "critical_recall": crit_recall,
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


if __name__ == "__main__":
    run_eval(verbose=True)
