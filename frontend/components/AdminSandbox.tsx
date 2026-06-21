import { useState } from "react";
import { BoltIcon, XMarkIcon } from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import { api } from "../lib/api";

interface AdminSandboxProps {
  onDataChange?: () => void;
}

export function AdminSandbox({ onDataChange }: AdminSandboxProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleInjectBreach() {
    setLoading("breach");
    try {
      const res = await api.sandbox.injectBreach();
      toast.error(
        `🔓 ${res.vendor_name}\n${res.old_risk_score.toFixed(1)} → ${res.new_risk_score.toFixed(1)}  (${res.old_risk_level} → ${res.new_risk_level})\n${res.reason}`,
        { duration: 6000 }
      );
      onDataChange?.();
    } catch (e) {
      toast.error(`Failed: ${String(e)}`);
    } finally {
      setLoading(null);
    }
  }

  async function handleAdvanceTime() {
    setLoading("time");
    try {
      const res = await api.sandbox.advanceTime();
      toast(
        `⏰ ${res.vendor_name}\n${res.old_risk_score.toFixed(1)} → ${res.new_risk_score.toFixed(1)}  (${res.old_risk_level} → ${res.new_risk_level})\n${res.reason}`,
        { duration: 6000, icon: "⏰" }
      );
      onDataChange?.();
    } catch (e) {
      toast.error(`Failed: ${String(e)}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="admin-sandbox fixed bottom-6 right-6 z-50 no-print">
      {open && (
        <div className="mb-3 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-scale-in">
          <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Admin Sandbox</h3>
                <p className="text-xs text-slate-400 mt-0.5">Simulate risk events for demo</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-4 space-y-2.5">
            <button
              onClick={handleInjectBreach}
              disabled={loading !== null}
              className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl text-left transition-colors disabled:opacity-50"
            >
              <span className="text-xl">🔓</span>
              <div>
                <p className="text-sm font-semibold text-red-700">Inject Breach</p>
                <p className="text-xs text-red-500">Simulate a random vendor data breach</p>
              </div>
              {loading === "breach" && (
                <div className="ml-auto w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
              )}
            </button>
            <button
              onClick={handleAdvanceTime}
              disabled={loading !== null}
              className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-left transition-colors disabled:opacity-50"
            >
              <span className="text-xl">⏰</span>
              <div>
                <p className="text-sm font-semibold text-amber-700">Advance Time</p>
                <p className="text-xs text-amber-600">Expire a vendor&apos;s SOC 2 certification</p>
              </div>
              {loading === "time" && (
                <div className="ml-auto w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
              )}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-sm font-semibold transition-all duration-200 ${
          open
            ? "bg-ink text-white shadow-slate-300"
            : "bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-teal/30 hover:shadow-teal/40 hover:shadow-xl"
        }`}
      >
        <BoltIcon className="w-4 h-4" />
        Admin Sandbox
      </button>
    </div>
  );
}
