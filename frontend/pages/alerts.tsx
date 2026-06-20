import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ShieldExclamationIcon,
  DocumentTextIcon,
  CheckBadgeIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowTopRightOnSquareIcon,
  BellAlertIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { api } from "../lib/api";
import { RagBadge } from "../components/RagBadge";
import { ErrorState } from "../components/ErrorState";
import type { AlertItem } from "../types/vendor";
import { useRefresh } from "./_app";

type Severity = "Critical" | "High" | "Medium" | "Low";
type SortKey = "severity" | "vendor" | "rag";

function classifySeverity(alert: AlertItem): Severity {
  if (alert.rag === "RED") {
    const t = alert.alert.toLowerCase();
    if (t.includes("critical") || t.includes("expired") || t.includes("investigation") || t.includes("immediate")) return "Critical";
    return "High";
  }
  if (alert.rag === "AMBER") return "Medium";
  return "Low";
}

const SEV_ORDER: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const RAG_ORDER: Record<string, number> = { RED: 0, AMBER: 1, GREEN: 2 };

const SEV_CFG: Record<Severity, { dot: string; badge: string; border: string; row: string }> = {
  Critical: { dot: "bg-red-500",     badge: "bg-red-100 text-red-700",       border: "border-l-red-500",     row: "hover:bg-red-50/50" },
  High:     { dot: "bg-orange-500",  badge: "bg-orange-100 text-orange-700", border: "border-l-orange-400",  row: "hover:bg-orange-50/50" },
  Medium:   { dot: "bg-amber-400",   badge: "bg-amber-100 text-amber-700",   border: "border-l-amber-400",   row: "hover:bg-amber-50/30" },
  Low:      { dot: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700", border: "border-l-emerald-400", row: "hover:bg-emerald-50/30" },
};

function AlertTypeIcon({ text }: { text: string }) {
  const t = text.toLowerCase();
  if (t.includes("breach") || t.includes("leak") || t.includes("ransomware") || t.includes("exfil"))
    return <ShieldExclamationIcon className="w-4 h-4" />;
  if (t.includes("expir") || t.includes("soc") || t.includes("iso") || t.includes("cert"))
    return <DocumentTextIcon className="w-4 h-4" />;
  if (t.includes("contract") || t.includes("access") || t.includes("isolate"))
    return <ExclamationTriangleIcon className="w-4 h-4" />;
  return <BellAlertIcon className="w-4 h-4" />;
}

function FilterPill({
  label, count, active, colorClass, onClick,
}: { label: string; count: number; active: boolean; colorClass: string; onClick: () => void }) {
  const dot: Record<string, string> = {
    All: "bg-slate-400", Critical: "bg-red-500", High: "bg-orange-500", Medium: "bg-amber-400", Low: "bg-emerald-400",
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
        active ? `${colorClass} shadow-sm` : "text-slate-500 border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${dot[label] ?? "bg-slate-400"}`} />
      {label}
      <span className={`px-1.5 py-0.5 rounded-full font-bold ${active ? "bg-white/60 text-current" : "bg-slate-100 text-slate-600"}`}>
        {count}
      </span>
    </button>
  );
}

export default function AlertsPage() {
  const { refreshKey } = useRefresh();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Severity | "All">("All");
  const [sort, setSort] = useState<SortKey>("severity");

  function fetchAlerts() {
    setLoading(true);
    setError(null);
    api.alerts
      .list()
      .then((d) => { setAlerts(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }

  useEffect(() => { fetchAlerts(); }, [refreshKey]);

  const counts = useMemo(() => {
    const c: Record<Severity | "All", number> = { All: alerts.length, Critical: 0, High: 0, Medium: 0, Low: 0 };
    alerts.forEach((a) => { c[classifySeverity(a)]++; });
    return c;
  }, [alerts]);

  const vendorCount = useMemo(() => new Set(alerts.map((a) => a.vendor_id)).size, [alerts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = alerts.filter((a) => {
      if (q && !a.vendor_name.toLowerCase().includes(q) && !a.alert.toLowerCase().includes(q)) return false;
      if (filter !== "All" && classifySeverity(a) !== filter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "severity") return SEV_ORDER[classifySeverity(a)] - SEV_ORDER[classifySeverity(b)];
      if (sort === "vendor")   return a.vendor_name.localeCompare(b.vendor_name);
      return RAG_ORDER[a.rag] - RAG_ORDER[b.rag];
    });
    return list;
  }, [alerts, search, filter, sort]);

  if (error) return <div className="p-8"><ErrorState message={error} onRetry={fetchAlerts} /></div>;

  const hasActiveFilter = search || filter !== "All";

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Alerts</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loading
              ? "Loading…"
              : `${alerts.length} active alert${alerts.length !== 1 ? "s" : ""} across ${vendorCount} vendor${vendorCount !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="mt-1 text-xs text-indigo-600 hover:underline font-medium"
        >
          Refresh
        </button>
      </div>

      {/* Summary stat cards */}
      {!loading && alerts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["Critical", "High", "Medium", "Low"] as Severity[]).map((sev) => {
            const cfg = SEV_CFG[sev];
            const isActive = filter === sev;
            return (
              <button
                key={sev}
                onClick={() => setFilter(isActive ? "All" : sev)}
                className={`relative text-left p-4 rounded-2xl border transition-all ${
                  isActive
                    ? `${sev === "Critical" ? "bg-red-50 border-red-300" : sev === "High" ? "bg-orange-50 border-orange-300" : sev === "Medium" ? "bg-amber-50 border-amber-300" : "bg-emerald-50 border-emerald-300"} shadow-sm`
                    : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <span className={`inline-flex w-2.5 h-2.5 rounded-full ${cfg.dot} mb-2`} />
                <p className="text-2xl font-bold text-slate-900">{counts[sev]}</p>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">{sev}</p>
                {isActive && (
                  <span className="absolute top-2 right-2 text-[10px] font-bold text-slate-400">✓ filtered</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Search + filter bar */}
      {!loading && alerts.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by vendor name or alert text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <FilterPill
              label="All" count={counts.All} active={filter === "All"}
              colorClass="text-slate-700 bg-slate-100 border-slate-300"
              onClick={() => setFilter("All")}
            />
            {(["Critical", "High", "Medium", "Low"] as Severity[]).filter((s) => counts[s] > 0).map((sev) => (
              <FilterPill
                key={sev} label={sev} count={counts[sev]} active={filter === sev}
                colorClass={
                  sev === "Critical" ? "text-red-700 bg-red-50 border-red-300" :
                  sev === "High"     ? "text-orange-700 bg-orange-50 border-orange-300" :
                  sev === "Medium"   ? "text-amber-700 bg-amber-50 border-amber-300" :
                                       "text-emerald-700 bg-emerald-50 border-emerald-300"
                }
                onClick={() => setFilter(filter === sev ? "All" : sev)}
              />
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5 shrink-0">
            <FunnelIcon className="w-4 h-4 text-slate-400" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
            >
              <option value="severity">Severity</option>
              <option value="vendor">Vendor A–Z</option>
              <option value="rag">RAG status</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-2xl" />)}
        </div>
      ) : alerts.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckBadgeIcon className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700">All clear</h3>
          <p className="text-sm text-slate-500 mt-1">No active alerts across the portfolio.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <MagnifyingGlassIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-600">No matching alerts</h3>
          <p className="text-sm text-slate-400 mt-1">Try a different search term or filter.</p>
          <button
            onClick={() => { setSearch(""); setFilter("All"); }}
            className="mt-4 text-xs text-indigo-600 hover:underline font-medium"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden animate-slide-up">
          {/* Table header / meta */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-700">{filtered.length}</span> of{" "}
              <span className="font-bold text-slate-700">{alerts.length}</span> alerts
              {filter !== "All" && <span className="ml-1 text-slate-400">· {filter} only</span>}
              {search && <span className="ml-1 text-slate-400">· "{search}"</span>}
            </p>
            {hasActiveFilter && (
              <button
                onClick={() => { setSearch(""); setFilter("All"); }}
                className="text-xs text-indigo-600 hover:underline font-medium flex items-center gap-1"
              >
                <XMarkIcon className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.map((alert, i) => {
              const sev = classifySeverity(alert);
              const cfg = SEV_CFG[sev];
              return (
                <div
                  key={i}
                  className={`flex items-start gap-4 px-5 py-4 border-l-4 ${cfg.border} ${cfg.row} transition-colors group`}
                >
                  {/* Severity indicator */}
                  <div className="mt-0.5 flex flex-col items-center gap-2 shrink-0 pt-0.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ring-2 ring-white shadow-sm`} />
                    <span className="text-slate-400"><AlertTypeIcon text={alert.alert} /></span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Link
                        href={`/vendors/${alert.vendor_id}`}
                        className="text-sm font-bold text-slate-900 hover:text-indigo-600 transition-colors"
                      >
                        {alert.vendor_name}
                      </Link>
                      <RagBadge rag={alert.rag} size="sm" />
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {sev}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{alert.vendor_id}</span>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{alert.alert}</p>
                  </div>

                  {/* View button — appears on hover */}
                  <Link
                    href={`/vendors/${alert.vendor_id}`}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100"
                  >
                    View <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
