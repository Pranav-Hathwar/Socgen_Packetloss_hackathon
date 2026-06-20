import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { useRefresh } from "./_app";
import { AdminSandbox } from "../components/AdminSandbox";
import { api } from "../lib/api";
import {
  BoltIcon,
  ClockIcon,
  EnvelopeIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import type { ScoreChange } from "../types/vendor";

interface SchedulerStatus {
  running: boolean;
  interval_seconds: number;
  next_run: string | null;
  last_run: string | null;
  last_changes?: ScoreChange[];
}

const LEVEL_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-emerald-100 text-emerald-700",
};

export default function AdminPage() {
  const { user, loading } = useAuth();
  const { triggerRefresh } = useRefresh();
  const router = useRouter();

  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [changes, setChanges] = useState<ScoreChange[]>([]);

  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyType, setNotifyType] = useState<"summary" | "expiry">("summary");
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && user.role !== "ADMIN") router.replace("/");
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") loadStatus();
  }, [user]);

  function loadStatus() {
    setStatusLoading(true);
    api.scheduler.status()
      .then((s) => { 
        setStatus(s);
        if (s.last_changes) setChanges(s.last_changes);
        if (s.last_run) setLastRunAt(s.last_run);
        setStatusLoading(false); 
      })
      .catch(() => setStatusLoading(false));
  }

  async function runNow() {
    setRunLoading(true);
    setChanges([]);
    try {
      const res = await api.scheduler.runNow();
      setChanges(res.changes ?? []);
      setLastRunAt(res.run_at ?? null);
      triggerRefresh();
    } catch (e) {
      setChanges([]);
      setLastRunAt(`Error: ${String(e)}`);
    } finally {
      setRunLoading(false);
      loadStatus();
    }
  }

  async function sendNotification() {
    if (!notifyEmail) return;
    setNotifyLoading(true);
    setNotifyMsg(null);
    try {
      const fn = notifyType === "summary" ? api.notify.summary : api.notify.expiry;
      const res = await fn(notifyEmail);
      setNotifyMsg(res.message || "Sent");
    } catch (e) {
      setNotifyMsg(`Error: ${String(e)}`);
    } finally {
      setNotifyLoading(false);
    }
  }

  if (loading || !user) return null;
  if (user.role !== "ADMIN") return null;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Panel</h1>
        <p className="text-sm text-slate-500 mt-1">Rescore monitoring and email notifications</p>
      </div>

      {/* Rescore Card */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-slate-800">Continuous Monitoring</h2>
          </div>
          <button onClick={loadStatus} className="text-slate-400 hover:text-slate-600 transition-colors" title="Refresh status">
            <ArrowPathIcon className={`w-4 h-4 ${statusLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {status && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Last Run</p>
              <p className="text-sm font-bold text-slate-800 mt-1 truncate">
                {status.last_run ? new Date(status.last_run).toLocaleString() : "Never"}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Vendors Changed</p>
              <p className="text-sm font-bold text-slate-800 mt-1">{changes.length}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Run At</p>
              <p className="text-sm font-bold text-slate-800 mt-1 truncate">
                {lastRunAt && !lastRunAt.startsWith("Error") ? new Date(lastRunAt).toLocaleTimeString() : "—"}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={runNow}
          disabled={runLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <BoltIcon className="w-4 h-4" />
          {runLoading ? "Rescoring…" : "Run Now"}
        </button>

        {lastRunAt?.startsWith("Error") && (
          <p className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700">{lastRunAt}</p>
        )}
      </div>

      {/* Changed Vendors */}
      {changes.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">
              Vendors with score changes ({changes.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {changes.map((c) => {
              const up = c.delta > 0;
              const levelChanged = c.old_level !== c.new_level;
              return (
                <div key={c.vendor_id} className="px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900">{c.name}</span>
                    <span className="font-mono text-xs text-slate-400">{c.vendor_id}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${up ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {up ? "▲" : "▼"} {up ? "+" : ""}{c.delta.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold text-slate-700">{c.old_score.toFixed(1)}</span>
                    <span className="text-slate-500 font-bold">→</span>
                    <span className="font-mono font-semibold text-slate-900">{c.new_score.toFixed(1)}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 ml-2 rounded-full ${up ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {c.old_level} → {c.new_level}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">{c.reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Email Notifications Card */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <EnvelopeIcon className="w-5 h-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-800">Email Notifications</h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Recipient Email</label>
            <input
              type="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="recipient@company.com"
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
            <div className="flex gap-2">
              {(["summary", "expiry"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setNotifyType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    notifyType === t
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "border-slate-200 text-slate-600 hover:border-indigo-300"
                  }`}
                >
                  {t === "summary" ? "Monthly Summary" : "Expiry Alerts"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {notifyMsg && (
          <p className={`text-sm px-3 py-2 rounded-lg ${notifyMsg.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {notifyMsg}
          </p>
        )}

        <button
          onClick={sendNotification}
          disabled={notifyLoading || !notifyEmail}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <EnvelopeIcon className="w-4 h-4" />
          {notifyLoading ? "Sending…" : "Send Email"}
        </button>
      </div>

      {/* Demo event simulator — only visible here */}
      <AdminSandbox onDataChange={triggerRefresh} />
    </div>
  );
}
