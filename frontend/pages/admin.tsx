import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { useRefresh } from "./_app";
import { AdminSandbox } from "../components/AdminSandbox";
import { api } from "../lib/api";
import {
  PlayIcon,
  StopIcon,
  BoltIcon,
  ClockIcon,
  EnvelopeIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface SchedulerStatus {
  running: boolean;
  interval_seconds: number;
  next_run: string | null;
  last_run: string | null;
}

function StatusDot({ running }: { running: boolean }) {
  return (
    <span className={`inline-flex w-2.5 h-2.5 rounded-full ${running ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const { triggerRefresh } = useRefresh();
  const router = useRouter();

  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState(3600);

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
      .then((s) => { setStatus(s); setStatusLoading(false); })
      .catch(() => setStatusLoading(false));
  }

  async function runAction(fn: () => Promise<unknown>, msg: string) {
    setActionMsg(null);
    try {
      const res = await fn() as Record<string, unknown>;
      const detail = res.vendors_rescored != null
        ? `${msg} — ${res.vendors_rescored} vendors rescored`
        : msg;
      setActionMsg(detail);
      await loadStatus();
    } catch (e) {
      setActionMsg(`Error: ${String(e)}`);
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
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Panel</h1>
        <p className="text-sm text-slate-500 mt-1">Scheduler controls and email notifications</p>
      </div>

      {/* Scheduler Card */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-slate-800">Background Scheduler</h2>
          </div>
          <button onClick={loadStatus} className="text-slate-400 hover:text-slate-600 transition-colors" title="Refresh status">
            <ArrowPathIcon className={`w-4 h-4 ${statusLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {status && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Status</p>
              <div className="flex items-center gap-2 mt-1">
                <StatusDot running={status.running} />
                <p className="text-sm font-bold text-slate-800">{status.running ? "Running" : "Stopped"}</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Interval</p>
              <p className="text-sm font-bold text-slate-800 mt-1">{Math.round(status.interval_seconds / 60)} min</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Last Run</p>
              <p className="text-sm font-bold text-slate-800 mt-1 truncate">
                {status.last_run ? new Date(status.last_run).toLocaleTimeString() : "Never"}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Next Run</p>
              <p className="text-sm font-bold text-slate-800 mt-1 truncate">
                {status.next_run ? new Date(status.next_run).toLocaleTimeString() : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Interval picker */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700 shrink-0">Interval</label>
          <select
            value={intervalSeconds}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
            disabled={status?.running}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value={300}>5 minutes</option>
            <option value={900}>15 minutes</option>
            <option value={1800}>30 minutes</option>
            <option value={3600}>1 hour</option>
            <option value={21600}>6 hours</option>
            <option value={86400}>24 hours</option>
          </select>
        </div>

        {actionMsg && (
          <p className={`text-sm px-3 py-2 rounded-lg ${actionMsg.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {actionMsg}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runAction(() => api.scheduler.start(intervalSeconds), "Scheduler started")}
            disabled={status?.running}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <PlayIcon className="w-4 h-4" /> Start
          </button>
          <button
            onClick={() => runAction(api.scheduler.stop, "Scheduler stopped")}
            disabled={!status?.running}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <StopIcon className="w-4 h-4" /> Stop
          </button>
          <button
            onClick={() => runAction(api.scheduler.runNow, "Rescore triggered")}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <BoltIcon className="w-4 h-4" /> Run Now
          </button>
        </div>
      </div>

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
