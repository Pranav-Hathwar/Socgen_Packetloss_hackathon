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
from datetime import datetime

_scheduler_thread: threading.Thread | None = None
_scheduler_running = False
_last_run: str = "never"
_interval_seconds: int = 3600  # default: 1 hour


def _rescore_all() -> dict:
    from .db import fetch_all_vendors, save_scores
    from .engine import score_vendor

    rows = [dict(r) for r in fetch_all_vendors()]
    changed = []
    for raw in rows:
        old_level = raw.get("risk_level") or "LOW"
        scored = score_vendor(raw)
        save_scores(raw["vendor_id"], scored, trigger="scheduled")
        if scored["risk_level"] != old_level:
            changed.append({
                "vendor_id": raw["vendor_id"],
                "name": raw["name"],
                "old_level": old_level,
                "new_level": scored["risk_level"],
            })

    return {"vendors_rescored": len(rows), "level_changes": changed, "run_at": datetime.utcnow().isoformat()}


def _scheduler_loop(interval: int):
    global _last_run, _scheduler_running
    while _scheduler_running:
        try:
            result = _rescore_all()
            _last_run = result["run_at"]
            changes = result["level_changes"]
            if changes:
                print(f"[Scheduler] {len(changes)} risk level changes detected: {[c['vendor_id'] for c in changes]}")
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
    return {
        "running": _scheduler_running,
        "interval_seconds": _interval_seconds,
        "last_run": _last_run,
    }


def run_once() -> dict:
    """Trigger an immediate rescore without starting the scheduler."""
    return _rescore_all()