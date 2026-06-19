import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ShieldExclamationIcon, DocumentTextIcon, CheckBadgeIcon } from "@heroicons/react/24/outline";
import { api } from "../lib/api";
import { RagBadge } from "../components/RagBadge";
import { ErrorState } from "../components/ErrorState";
import type { AlertItem, RAG } from "../types/vendor";
import { useRefresh } from "./_app";

interface AlertGroup {
  severity: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  alerts: AlertItem[];
}

function classifyAlert(alert: AlertItem): string {
  if (alert.rag === "RED") {
    const text = alert.alert.toLowerCase();
    if (text.includes("critical") || text.includes("expired") || text.includes("immediate")) return "Critical";
    return "High";
  }
  if (alert.rag === "AMBER") return "Medium";
  return "Low";
}

function getAlertIcon(alert: string) {
  const lower = alert.toLowerCase();
  if (lower.includes("breach") || lower.includes("unauthori") || lower.includes("leak")) {
    return <span className="text-base">🔓</span>;
  }
  if (lower.includes("expir") || lower.includes("certif") || lower.includes("soc") || lower.includes("iso")) {
    return <span className="text-base">📋</span>;
  }
  if (lower.includes("contract")) {
    return <span className="text-base">📄</span>;
  }
  return <span className="text-base">⚠️</span>;
}

export default function AlertsPage() {
  const { refreshKey } = useRefresh();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function fetchAlerts() {
    setLoading(true);
    setError(null);
    api.alerts
      .list()
      .then((data) => { setAlerts(data); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }

  useEffect(() => {
    fetchAlerts();
  }, [refreshKey]);

  const groups: AlertGroup[] = useMemo(() => {
    const map: Record<string, AlertItem[]> = { Critical: [], High: [], Medium: [], Low: [] };
    alerts.forEach((a) => {
      const sev = classifyAlert(a);
      map[sev].push(a);
    });

    const configs: Record<string, Omit<AlertGroup, "alerts" | "severity">> = {
      Critical: {
        color: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
        icon: <ShieldExclamationIcon className="w-5 h-5 text-red-500" />,
      },
      High: {
        color: "text-orange-700",
        bg: "bg-orange-50",
        border: "border-orange-200",
        icon: <ShieldExclamationIcon className="w-5 h-5 text-orange-500" />,
      },
      Medium: {
        color: "text-amber-700",
        bg: "bg-amber-50",
        border: "border-amber-200",
        icon: <DocumentTextIcon className="w-5 h-5 text-amber-500" />,
      },
      Low: {
        color: "text-emerald-700",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        icon: <CheckBadgeIcon className="w-5 h-5 text-emerald-500" />,
      },
    };

    return ["Critical", "High", "Medium", "Low"]
      .filter((sev) => map[sev].length > 0)
      .map((sev) => ({
        severity: sev,
        ...configs[sev],
        alerts: map[sev],
      }));
  }, [alerts]);

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={fetchAlerts} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Alerts</h1>
        <p className="text-sm text-slate-500 mt-1">
          {loading ? "Loading…" : `${alerts.length} active alert${alerts.length !== 1 ? "s" : ""} across the portfolio`}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-2xl" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckBadgeIcon className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700">All clear</h3>
          <p className="text-sm text-slate-500 mt-1">No active alerts in the portfolio.</p>
        </div>
      ) : (
        <div className="space-y-6 animate-slide-up">
          {groups.map((group) => (
            <div key={group.severity} className="card overflow-hidden">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [group.severity]: !c[group.severity] }))}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {group.icon}
                  <span className="font-semibold text-slate-900">{group.severity}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${group.bg} ${group.color}`}>
                    {group.alerts.length}
                  </span>
                </div>
                <span className="text-slate-400 text-sm">
                  {collapsed[group.severity] ? "Show" : "Hide"}
                </span>
              </button>

              {!collapsed[group.severity] && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {group.alerts.map((alert, i) => (
                    <div key={i} className={`flex items-start gap-4 px-6 py-4 border-l-4 ${group.border}`}>
                      <div className="mt-0.5">{getAlertIcon(alert.alert)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/vendors/${alert.vendor_id}`}
                            className="text-sm font-semibold text-slate-900 hover:text-indigo-600 transition-colors"
                          >
                            {alert.vendor_name}
                          </Link>
                          <RagBadge rag={alert.rag} size="sm" />
                        </div>
                        <p className="text-sm text-slate-600">{alert.alert}</p>
                      </div>
                      <Link
                        href={`/vendors/${alert.vendor_id}`}
                        className="text-xs text-indigo-600 font-medium hover:underline shrink-0"
                      >
                        View →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
