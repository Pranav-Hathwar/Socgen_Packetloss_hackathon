import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldExclamationIcon, DocumentTextIcon, CheckBadgeIcon, MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon, BellAlertIcon, ExclamationTriangleIcon, XMarkIcon,
  ClockIcon, ShieldCheckIcon, DocumentMagnifyingGlassIcon, ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { api } from "../lib/api";
import { RagBadge } from "../components/RagBadge";
import { ErrorState } from "../components/ErrorState";
import type { AlertItem } from "../types/vendor";
import { useRefresh } from "./_app";

type Severity = "Critical" | "High" | "Medium" | "Low";

function classifySeverity(alert: AlertItem): Severity {
  if (alert.rag === "RED") {
    const t = alert.alert.toLowerCase();
    if (t.includes("critical") || t.includes("expired") || t.includes("investigation") || t.includes("immediate")) return "Critical";
    return "High";
  }
  if (alert.rag === "AMBER") return "Medium";
  return "Low";
}

const SEV_LIST: Severity[] = ["Critical", "High", "Medium", "Low"];
const SEV_CFG: Record<Severity, { dot: string; badge: string; border: string; row: string; head: string }> = {
  Critical: { dot: "bg-rag-red",   badge: "bg-rag-red/15 text-rag-red",     border: "border-l-rag-red",   row: "hover:bg-rag-red/5",   head: "bg-rag-red/5" },
  High:     { dot: "bg-rag-amber", badge: "bg-rag-amber/15 text-rag-amber", border: "border-l-rag-amber", row: "hover:bg-rag-amber/5", head: "bg-rag-amber/5" },
  Medium:   { dot: "bg-rag-amber", badge: "bg-amber-100 text-amber-700",    border: "border-l-amber-400", row: "hover:bg-amber-50/40", head: "bg-amber-50/50" },
  Low:      { dot: "bg-rag-green", badge: "bg-rag-green/15 text-rag-green", border: "border-l-rag-green", row: "hover:bg-rag-green/5", head: "bg-rag-green/5" },
};

const ALERT_TYPE_META: Record<string, { label: string; badge: string }> = {
  ASSESSMENT_OVERDUE: { label: "Assessment Overdue", badge: "bg-brass/15 text-brass-700" },
  BREACH:            { label: "Security Breach",     badge: "bg-rag-red/15 text-rag-red" },
  CERT_EXPIRY:       { label: "Cert Expiry",         badge: "bg-rag-amber/15 text-rag-amber" },
  CONTRACT:          { label: "Contract",            badge: "bg-teal-100 text-teal-700" },
  ACCESS:            { label: "Access Risk",         badge: "bg-amber-100 text-amber-700" },
  COMPLIANCE:        { label: "Compliance",          badge: "bg-teal-100 text-teal-700" },
  GENERAL:           { label: "Alert",               badge: "bg-slate-100 text-slate-600" },
};

function AlertTypeIcon({ alertType }: { alertType: string }) {
  switch (alertType) {
    case "ASSESSMENT_OVERDUE": return <ClockIcon className="w-4 h-4" />;
    case "BREACH":             return <ShieldExclamationIcon className="w-4 h-4" />;
    case "CERT_EXPIRY":        return <DocumentTextIcon className="w-4 h-4" />;
    case "COMPLIANCE":         return <ShieldCheckIcon className="w-4 h-4" />;
    case "CONTRACT":           return <DocumentMagnifyingGlassIcon className="w-4 h-4" />;
    case "ACCESS":             return <ExclamationTriangleIcon className="w-4 h-4" />;
    default:                   return <BellAlertIcon className="w-4 h-4" />;
  }
}

export default function AlertsPage() {
  const { refreshKey } = useRefresh();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<Severity, boolean>>({ Critical: false, High: false, Medium: true, Low: true });

  function fetchAlerts() {
    setLoading(true);
    setError(null);
    api.alerts.list()
      .then((d) => { setAlerts(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }
  useEffect(() => { fetchAlerts(); }, [refreshKey]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    alerts.forEach((a) => { c[classifySeverity(a)]++; });
    return c;
  }, [alerts]);
  const vendorCount = useMemo(() => new Set(alerts.map((a) => a.vendor_id)).size, [alerts]);

  const groups = useMemo(() => {
    const q = search.toLowerCase();
    const g: Record<Severity, AlertItem[]> = { Critical: [], High: [], Medium: [], Low: [] };
    alerts.forEach((a) => {
      if (q && !a.vendor_name.toLowerCase().includes(q) && !a.alert.toLowerCase().includes(q)) return;
      g[classifySeverity(a)].push(a);
    });
    return g;
  }, [alerts, search]);
  const matchTotal = SEV_LIST.reduce((s, sev) => s + groups[sev].length, 0);

  function toggle(sev: Severity) { setCollapsed((c) => ({ ...c, [sev]: !c[sev] })); }

  if (error) return <div className="p-8"><ErrorState message={error} onRetry={fetchAlerts} /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink tracking-tight">Alerts</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loading ? "Loading..." : `${alerts.length} active alert${alerts.length !== 1 ? "s" : ""} across ${vendorCount} vendor${vendorCount !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button onClick={fetchAlerts} className="btn-liquid btn-liquid btn-liquid mt-1 text-xs text-teal-700 hover:underline font-medium">Refresh</button>
      </div>

      {!loading && alerts.length > 0 && (
        <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SEV_LIST.map((sev) => {
            const cfg = SEV_CFG[sev];
            return (
              <motion.button key={sev} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                onClick={() => { document.getElementById(`grp-${sev}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); setCollapsed((c) => ({ ...c, [sev]: false })); }}
                className="relative text-left p-4 rounded-xl border bg-white border-hairline hover:border-slate-300 hover:shadow-card transition-all">
                <span className={`btn-liquid inline-flex w-2.5 h-2.5 rounded-full ${cfg.dot} mb-2`} />
                <p className="text-2xl font-display font-bold text-ink tabular">{counts[sev]}</p>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">{sev}</p>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {!loading && alerts.length > 0 && (
        <div className="relative max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Search by vendor or alert text..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-hairline rounded-lg text-sm text-ink placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal/40 transition" />
          {search && <button onClick={() => setSearch("")} className="btn-liquid absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><XMarkIcon className="w-4 h-4" /></button>}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-rag-green/10 rounded-xl flex items-center justify-center mx-auto mb-4"><CheckBadgeIcon className="w-8 h-8 text-rag-green" /></div>
          <h3 className="text-base font-semibold text-ink">All clear</h3>
          <p className="text-sm text-slate-500 mt-1">No active alerts across the portfolio.</p>
        </div>
      ) : matchTotal === 0 ? (
        <div className="card p-12 text-center">
          <MagnifyingGlassIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-600">No matching alerts</h3>
          <button onClick={() => setSearch("")} className="btn-liquid mt-4 text-xs text-teal-700 hover:underline font-medium">Clear search</button>
        </div>
      ) : (
        <div className="space-y-4">
          {SEV_LIST.map((sev) => {
            const list = groups[sev];
            if (list.length === 0) return null;
            const cfg = SEV_CFG[sev];
            const isOpen = !collapsed[sev];
            return (
              <div key={sev} id={`grp-${sev}`} className="card overflow-hidden">
                <button onClick={() => toggle(sev)} className={`btn-liquid w-full flex items-center justify-between px-5 py-3 ${cfg.head} border-b border-hairline transition-colors`}>
                  <div className="btn-liquid flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    <span className="text-sm font-display font-bold text-ink">{sev}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{list.length}</span>
                  </div>
                  <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className="overflow-hidden">
                      <div className="divide-y divide-hairline/70">
                        {list.map((alert, i) => (
                          <div key={i} className={`flex items-start gap-4 px-5 py-4 border-l-4 ${cfg.border} ${cfg.row} transition-colors group`}>
                            <div className="mt-0.5 flex flex-col items-center gap-2 shrink-0 pt-0.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ring-2 ring-white shadow-sm`} />
                              <span className="text-slate-400"><AlertTypeIcon alertType={alert.alert_type} /></span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <Link href={`/vendors/${alert.vendor_id}`} className="text-sm font-bold text-ink hover:text-teal-700 transition-colors">{alert.vendor_name}</Link>
                                <RagBadge rag={alert.rag} size="sm" />
                                {alert.alert_type && alert.alert_type !== "GENERAL" && (
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ALERT_TYPE_META[alert.alert_type]?.badge ?? "bg-slate-100 text-slate-600"}`}>
                                    {ALERT_TYPE_META[alert.alert_type]?.label ?? alert.alert_type}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 tabular">{alert.vendor_id}</span>
                              </div>
                              <p className="text-sm text-slate-600 leading-relaxed">{alert.alert}</p>
                            </div>
                            <Link href={`/vendors/${alert.vendor_id}`} className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-hairline bg-white text-xs font-semibold text-slate-600 hover:border-teal/40 hover:text-teal-700 hover:bg-teal-50 transition-all opacity-0 group-hover:opacity-100">
                              View <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                            </Link>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
