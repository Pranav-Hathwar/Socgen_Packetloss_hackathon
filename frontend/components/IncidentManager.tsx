import { useState, useEffect } from "react";
import { ExclamationTriangleIcon, ShieldCheckIcon, BoltIcon } from "@heroicons/react/24/solid";
import { api } from "../lib/api";
import type { GlobalIncident } from "../types/vendor";

export function IncidentManager({ onUpdate }: { onUpdate: () => void }) {
  const [incidents, setIncidents] = useState<GlobalIncident[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{ platform: string; count: number; names: string[] } | null>(null);
  const [systemSuggestions, setSystemSuggestions] = useState<string[]>([]);

  const [form, setForm] = useState({
    platform: "",
    severity: "CRITICAL",
    description: ""
  });

  async function fetchIncidents() {
    try {
      const data = await api.incidents.list();
      setIncidents(data);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchIncidents();
    // Fetch available system names for suggestions
    api.incidents.systems().then(setSystemSuggestions).catch(() => {});
  }, []);

  async function handleSubmit() {
    if (!form.platform || !form.description) return;
    setLoading(true);
    try {
      const result = await api.incidents.report(form);
      setLastResult({ platform: form.platform, count: result.impacted_vendors, names: result.impacted_vendor_names ?? [] });
      setForm({ platform: "", severity: "CRITICAL", description: "" });
      setShowForm(false);
      fetchIncidents();
      onUpdate(); // Refresh vendors list
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(id: number) {
    try {
      await api.incidents.resolve(id);
      fetchIncidents();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-orange-500" />
          Incident Response Center
        </h2>
        <button
          onClick={() => { setShowForm(!showForm); setLastResult(null); }}
          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors shadow-sm"
        >
          {showForm ? "Cancel" : "Report Global Incident"}
        </button>
      </div>

      {/* Impact Result Banner */}
      {lastResult && (
        <div className="flex items-center justify-between gap-4 px-5 py-4 bg-gradient-to-r from-orange-600 to-red-700 rounded-2xl text-white animate-slide-up shadow-lg shadow-red-200">
          <div className="flex items-center gap-3">
            <BoltIcon className="w-6 h-6 text-yellow-300 shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-200">Incident Broadcasted</p>
              <p className="text-base font-bold mt-0.5">
                {lastResult.count > 0
                  ? <><span className="text-yellow-300 text-xl">{lastResult.count}</span> vendor{lastResult.count !== 1 ? 's' : ''} auto-escalated to <span className="text-yellow-300">CRITICAL</span> due to {lastResult.platform} outage<br/><span className="text-xs font-normal text-orange-200">{lastResult.names.join(', ')}{lastResult.count > 10 ? '...' : ''}</span></>
                  : <>No vendors use <span className="font-mono">{lastResult.platform}</span>. Try: CRM, ERP, Payment Gateway, Data Warehouse</>
                }
              </p>
            </div>
          </div>
          <button onClick={() => setLastResult(null)} className="text-orange-200 hover:text-white text-lg font-bold shrink-0">✕</button>
        </div>
      )}

      {showForm && (
        <div className="card p-5 bg-red-50 border-red-100 animate-slide-up">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-red-800 uppercase mb-1">Platform / System Name</label>
              <input
                type="text"
                list="system-suggestions"
                placeholder="e.g. CRM, ERP, Payment Gateway, Data Warehouse"
                className="w-full px-3 py-2 bg-white border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                value={form.platform}
                onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
              />
              <datalist id="system-suggestions">
                {systemSuggestions.map(s => <option key={s} value={s} />)}
              </datalist>
              <p className="text-[10px] text-red-500 mt-1">💡 Type a system name from your registry, e.g. <span className="font-mono font-bold">CRM</span>, <span className="font-mono font-bold">ERP</span>, <span className="font-mono font-bold">Payment Gateway</span></p>
            </div>
            <div>
              <label className="block text-xs font-bold text-red-800 uppercase mb-1">Severity</label>
              <select
                className="w-full px-3 py-2 bg-white border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-red-800 uppercase mb-1">Incident Detail</label>
              <textarea
                placeholder="Describe the nature of the breach or outage..."
                className="w-full px-3 py-2 bg-white border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || !form.platform || !form.description}
              className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-all shadow-lg shadow-red-200"
            >
              {loading ? "Triggering Escalations..." : "Broadcast Incident & Escalate Vendors"}
            </button>
          </div>
        </div>
      )}

      {incidents.length > 0 ? (
        <div className="space-y-3">
          {incidents.map(inc => (
            <div key={inc.id} className="card p-4 border-l-4 border-red-600 bg-white flex items-start justify-between group">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase">{inc.platform} INCIDENT</h3>
                  <p className="text-xs text-slate-600 mt-0.5">{inc.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold">{inc.severity}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{inc.reported_at.slice(11, 16)} GMT</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleResolve(inc.id)}
                className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
              >
                Mark Resolved
              </button>
            </div>
          ))}
        </div>
      ) : !showForm && (
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
          <ShieldCheckIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-medium text-slate-500">No active infrastructure incidents detected.</p>
        </div>
      )}
    </div>
  );
}
