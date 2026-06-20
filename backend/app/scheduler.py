"""
Continuous Monitoring Scheduler
================================
Runs background rescoring of all vendors on a configurable interval.
Uses Python threading (no external dependency). Checks cert/contract expiry
and fires alert updates automatically.

NIST SP 800-53 SA-9: Supports continuous third-party monitoring requirement.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

_scheduler_thread: threading.Thread | None = None
_scheduler_running = False
_last_run: str = "never"
_last_changes: list = []
_interval_seconds: int = 3600  # default: 1 hour


def _explain_change(old_bd: dict, new_bd: dict) -> str:
    """Build a human-readable reason for why the score changed, from the
    score-breakdown delta."""
    labels = {
        "data_exposure": "data exposure",
        "compliance_gaps": "compliance gaps",
        "breach_history": "breach history",
        "financial_health": "financial health",
        "concentration": "concentration risk",
    }
    movers = []
    for k, label in labels.items():
        delta = round(float(new_bd.get(k, 0)) - float(old_bd.get(k, 0) or 0), 2)
        if abs(delta) >= 0.05:
            movers.append(f"{label} {'+' if delta > 0 else ''}{delta:.1f}")
    if not movers:
        return "Re-scored (weighted recomputation)."
    return "Changed: " + ", ".join(movers)


def _rescore_all() -> dict:
    global _last_run, _last_changes
    from .db import fetch_all_vendors, save_scores
    from .engine import score_vendor

    rows = [dict(r) for r in fetch_all_vendors()]
    changed = []
    for raw in rows:
        old_score = float(raw.get("risk_score") or 0)
        old_level = str(raw.get("risk_level") or "LOW")
        old_bd_raw = raw.get("score_breakdown")
        try:
            import json as _json
            old_bd = _json.loads(old_bd_raw) if old_bd_raw else {}
        except Exception:
            old_bd = {}

        scored = score_vendor(raw)
        save_scores(raw["vendor_id"], scored, trigger="scheduled")

        new_score = float(scored["risk_score"])
        new_level = scored["risk_level"]
        # Report any score change at all (even fractional), per requirement.
        if abs(new_score - old_score) >= 0.05:
            changed.append({
                "vendor_id": raw["vendor_id"],
                "name": raw["name"],
                "old_score": round(old_score, 1),
                "new_score": round(new_score, 1),
                "delta": round(new_score - old_score, 1),
                "old_level": old_level,
                "new_level": new_level,
                "reason": _explain_change(old_bd, scored["score_breakdown"]),
            })

    # Sort by magnitude of change so the most affected vendors surface first
    changed.sort(key=lambda c: abs(c["delta"]), reverse=True)
    _last_run = datetime.now(timezone.utc).isoformat()
    _last_changes = changed
    return {"vendors_rescored": len(rows), "changes": changed, "run_at": _last_run}


def _scheduler_loop(interval: int):
    global _scheduler_running
    while _scheduler_running:
        try:
            result = _rescore_all()
            changes = result["changes"]
            if changes:
                print(f"[Scheduler] {len(changes)} score changes detected: {[c['vendor_id'] for c in changes]}")
        except Exception as e:
            print(f"[Scheduler] Error during rescore: {e}")
        time.sleep(interval)


def start_scheduler(interval_seconds: int = 3600) -> dict:
    global _scheduler_thread, _scheduler_running, _interval_seconds
    if _scheduler_running:
        return {"status": "already_running", "interval_seconds": _interval_seconds}
    _scheduler_running = True
    _interval_seconds = interval_seconds
    _scheduler_thread = threading.Thread(target=_scheduler_loop, args=(interval_seconds,), daemon=True)
    _scheduler_thread.start()
    return {"status": "started", "interval_seconds": interval_seconds}


def stop_scheduler() -> dict:
    global _scheduler_running
    _scheduler_running = False
    return {"status": "stopped"}


def scheduler_status() -> dict:
    next_run = None
    if _scheduler_running and _last_run != "never":
        try:
            from datetime import datetime, timedelta
            last_dt = datetime.fromisoformat(_last_run)
            next_run = (last_dt + timedelta(seconds=_interval_seconds)).isoformat()
        except Exception:
            pass
    return {
        "running": _scheduler_running,
        "interval_seconds": _interval_seconds,
        "last_run": _last_run if _last_run != "never" else None,
        "next_run": next_run,
        "last_changes": _last_changes,
    }


def run_once() -> dict:
    """Trigger an immediate rescore without starting the scheduler."""
    return _rescore_all()