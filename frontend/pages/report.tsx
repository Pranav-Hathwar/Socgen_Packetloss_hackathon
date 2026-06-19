import { useEffect, useState, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { PrinterIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { api } from "../lib/api";
import { ErrorState } from "../components/ErrorState";
import type { ReportSummary, VendorSummary } from "../types/vendor";

const RAG_COLORS: Record<string, string> = { RED: "#ef4444", AMBER: "#f59e0b", GREEN: "#10b981" };
const RISK_COLORS: Record<string, string> = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#f59e0b", LOW: "#10b981" };

export default function ReportPage() {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchData() {
    setLoading(true);
    setError(null);
    Promise.all([api.report.get(), api.vendors.list()])
      .then(([r, v]) => { setReport(r); setVendors(v); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }

  useEffect(() => { fetchData(); }, []);

  const exportCSV = useCallback(() => {
    if (!vendors.length) return;
    const headers = ["Vendor ID", "Name", "Category", "Risk Score", "Risk Level", "RAG", "Alerts"];
    const rows = vendors.map((v) => [
      v.vendor_id,
      `"${v.name}"`,
      `"${v.category}"`,
      v.risk_score.toFixed(1),
      v.risk_level,
      v.rag,
      `"${v.alerts.join("; ")}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendorlens_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [vendors]);

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    );
  }

  if (loading || !report) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-slate-200 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const ragData = [
    { name: "Red", value: report.rag_summary.RED, color: RAG_COLORS.RED },
    { name: "Amber", value: report.rag_summary.AMBER, color: RAG_COLORS.AMBER },
    { name: "Green", value: report.rag_summary.GREEN, color: RAG_COLORS.GREEN },
  ].filter((d) => d.value > 0);

  const riskData = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((level) => ({
    level,
    count: report.risk_level_summary[level],
  }));

  const complianceData = [
    { name: "SOC 2 Type II", ...report.compliance_coverage.soc2_type2 },
    { name: "ISO 27001", ...report.compliance_coverage.iso27001 },
    { name: "GDPR DPA", ...report.compliance_coverage.gdpr_dpa },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Audit Report</h1>
          <p className="text-sm text-slate-500 mt-1">
            Generated: {new Date(report.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <PrinterIcon className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up">
        <div className="card p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Vendors</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{report.total_vendors}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Avg Risk Score</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{report.average_risk_score.toFixed(1)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Red Flag Vendors</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{report.red_flag_vendors.length}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Green Status</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{report.rag_summary.GREEN}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
        {/* RAG Distribution Pie */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">RAG Distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={ragData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                dataKey="value"
                paddingAngle={4}
                stroke="none"
              >
                {ragData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                formatter={(value: number, name: string) => [`${value} vendors`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2">
            {ragData.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-slate-600 font-medium">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Level Bar */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Risk Level Breakdown</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={riskData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="level" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px" }} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {riskData.map((entry) => (
                  <Cell key={entry.level} fill={RISK_COLORS[entry.level]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Compliance Coverage */}
      <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.15s" }}>
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Compliance Coverage</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {complianceData.map((c) => (
            <div key={c.name}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">{c.name}</span>
                <span className="text-sm font-bold text-slate-900">{c.percentage}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${c.percentage}%`,
                    backgroundColor: c.percentage >= 75 ? "#10b981" : c.percentage >= 50 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">{c.count} of {c.total} vendors</p>
            </div>
          ))}
        </div>
      </div>

      {/* Red Flag Vendors */}
      {report.red_flag_vendors.length > 0 && (
        <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Red-Flag Vendors — Required Actions</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {report.red_flag_vendors.map((v) => (
              <div key={v.vendor_id} className="px-6 py-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-semibold text-slate-900">{v.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700">{v.risk_level}</span>
                  <span className="font-mono text-sm text-slate-500">{v.risk_score.toFixed(1)}</span>
                  <span className="text-xs text-slate-400">{v.category}</span>
                </div>
                <div className="flex items-start gap-3 mb-3">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border shrink-0 ${
                    v.action_type === "ESCALATE"
                      ? "bg-red-100 text-red-700 border-red-200"
                      : "bg-amber-100 text-amber-700 border-amber-200"
                  }`}>
                    {v.action_type}
                  </span>
                  <p className="text-sm text-slate-600">{v.required_actions}</p>
                </div>
                {v.risk_factors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {v.risk_factors.slice(0, 3).map((f, i) => (
                      <span key={i} className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-600">
                        {f}
                      </span>
                    ))}
                    {v.risk_factors.length > 3 && (
                      <span className="px-2 py-1 text-xs text-slate-400">
                        +{v.risk_factors.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
