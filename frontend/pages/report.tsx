import { SearchSelect, SearchSelectItem } from "@tremor/react";
import { useEffect, useState, useCallback } from "react";
import { useSpring, animated } from "@react-spring/web";
import { PieChart as MuiPieChart } from "@mui/x-charts/PieChart";
import {
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from "recharts";
import type { RectangleProps } from "recharts";

// ── Animated bar shape for the Risk Level Breakdown (single-color bars) ──────
function AnimatedBar(props: RectangleProps & { fill?: string }) {
  const { x = 0, y = 0, width = 0, height = 0, fill, radius } = props;
  const spring = useSpring({
    from: { height: 0, y: (y as number) + (height as number) },
    to:   { height: height as number, y: y as number },
    config: { tension: 120, friction: 14 },
    reset: false,
  });
  // Build a rounded-top path to preserve radius={[8,8,0,0]}
  const r = Array.isArray(radius) ? (radius[0] as number) : 0;
  return (
    <animated.rect
      x={x as number}
      width={width as number}
      y={spring.y}
      height={spring.height}
      fill={fill}
      rx={r}
      ry={r}
    />
  );
}

// ── Animated bar shape for the stacked Risk by Category chart ────────────────
function AnimatedStackedBar(props: RectangleProps & { fill?: string }) {
  const { x = 0, y = 0, width = 0, height = 0, fill, radius } = props;
  const spring = useSpring({
    from: { height: 0, y: (y as number) + (height as number) },
    to:   { height: height as number, y: y as number },
    config: { tension: 120, friction: 14 },
    reset: false,
  });
  const r = Array.isArray(radius) ? (radius[0] as number) : 0;
  return (
    <animated.rect
      x={x as number}
      width={width as number}
      y={spring.y}
      height={spring.height}
      fill={fill}
      rx={r}
      ry={r}
    />
  );
}
import { PrinterIcon, ArrowDownTrayIcon, DocumentArrowDownIcon } from "@heroicons/react/24/outline";
import { jsPDF } from "jspdf";
import { api } from "../lib/api";
import { ErrorState } from "../components/ErrorState";
import type { ReportSummary, VendorScore, VendorSummary } from "../types/vendor";

const RAG_COLORS: Record<string, string> = { RED: "#ef4444", AMBER: "#f59e0b", GREEN: "#10b981" };
const RISK_COLORS: Record<string, string> = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#f59e0b", LOW: "#10b981" };
const SCORE_BREAKDOWN_LABELS: Record<keyof VendorScore["score_breakdown"], string> = {
  data_exposure: "Data Exposure",
  compliance_gaps: "Compliance Gaps",
  breach_history: "Breach History",
  financial_health: "Financial Health",
  concentration: "Concentration Risk",
};

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

/** Build and download a paginated PDF report for a single vendor using the jsPDF API. */
function buildVendorReportPDF(v: VendorScore): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;

  let y = margin;
  const lineHeight = 16;

  function ensure(space: number) {
    if (y + space > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function sectionTitle(title: string) {
    ensure(lineHeight * 2);
    y += 10;
    doc.setFillColor(238, 242, 255);
    doc.rect(margin, y - 10, contentW, lineHeight + 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(67, 56, 202);
    doc.text(title.toUpperCase(), margin + 6, y + 2);
    doc.setTextColor(30, 41, 59);
    y += lineHeight + 8;
  }

  function kvRow(label: string, value: string) {
    ensure(lineHeight + 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(label, margin, y);
    doc.setTextColor(30, 41, 59);
    const wrapped = doc.splitTextToSize(value, contentW - 140);
    doc.text(wrapped, margin + 140, y);
    y += lineHeight * Math.max(1, wrapped.length) + 2;
  }

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 41, 59);
  doc.text(v.name, margin, y + 8);
  y += 26;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`VendorLens · Vendor Risk Assessment`, margin, y);
  doc.text(`Generated: ${new Date().toLocaleString("en-GB")}`, pageW - margin, y, { align: "right" });
  y += 6;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  // ── Risk summary band ─────────────────────────────────────────────────────
  const metrics: Array<[string, string, string?]> = [
    ["Risk Score", v.risk_score.toFixed(1)],
    ["Risk Level", v.risk_level, RISK_COLORS[v.risk_level]],
    ["RAG Status", v.rag, RAG_COLORS[v.rag]],
    ["Financial", v.financial_rating],
  ];
  const colW = contentW / 4;
  metrics.forEach(([label, value, color], i) => {
    const x = margin + i * colW;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x + 3, y, colW - 6, 56, 6, 6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), x + 12, y + 16);
    if (color) {
      const [r, g, b] = hexToRgb(color);
      doc.setFillColor(r, g, b);
      doc.roundedRect(x + 12, y + 24, 36, 18, 9, 9, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(value, x + 30, y + 36, { align: "center" });
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text(value, x + 12, y + 42);
    }
  });
  y += 70;

  // ── Score breakdown ───────────────────────────────────────────────────────
  sectionTitle("Score Breakdown");
  (Object.keys(SCORE_BREAKDOWN_LABELS) as (keyof VendorScore["score_breakdown"])[]).forEach((k) => {
    kvRow(SCORE_BREAKDOWN_LABELS[k], v.score_breakdown[k].toFixed(1));
  });

  // ── Compliance ────────────────────────────────────────────────────────────
  sectionTitle("Compliance Status");
  kvRow("SOC 2 Type II", `${v.compliance.soc2_type2 ? "Compliant" : "Missing"}${v.compliance.soc2_type2 && v.compliance.soc2_expiry ? ` (expires ${fmtDate(v.compliance.soc2_expiry)})` : ""}`);
  kvRow("ISO 27001", v.compliance.iso27001 ? "Compliant" : "Missing");
  kvRow("GDPR DPA", v.compliance.gdpr_dpa ? "Signed" : "Missing");
  kvRow("Breach Notification SLA", `${v.compliance.breach_notification_sla_hours} hours`);

  // ── Breach history ────────────────────────────────────────────────────────
  sectionTitle("Breach History");
  if (v.breach_history.length) {
    v.breach_history.forEach((b) => {
      kvRow(`${fmtDate(b.date)} · ${b.severity}`, b.description);
    });
  } else {
    kvRow("—", "No breaches on record.");
  }

  // ── Data access ───────────────────────────────────────────────────────────
  sectionTitle("Data Access & Residency");
  kvRow("Systems Accessed", v.data_access.systems.length ? v.data_access.systems.join(", ") : "—");
  kvRow("Data Sensitivity", v.data_access.data_sensitivity);
  kvRow("Access Type", v.data_access.access_type);
  kvRow("Data Residency", v.data_residency);
  kvRow("Sub-processors", String(v.sub_processor_count));
  kvRow("Concentration Risk", v.concentration_risk);
  kvRow("Access Last Used", fmtDate(v.data_access.access_last_used_at));

  // ── Contract ──────────────────────────────────────────────────────────────
  sectionTitle("Contract");
  kvRow("Contract Period", `${fmtDate(v.contract_start)} → ${fmtDate(v.contract_end)}`);
  kvRow("Last Assessment", fmtDate(v.last_assessment_date));
  kvRow("Contact", [v.contact_name, v.contact_email].filter(Boolean).join("  ") || "—");

  // ── Risk factors ──────────────────────────────────────────────────────────
  sectionTitle("Risk Factors");
  if (v.risk_factors.length) {
    v.risk_factors.forEach((f) => kvRow("•", f));
  } else {
    kvRow("—", "No risk factors flagged.");
  }

  // ── Anomaly flags ─────────────────────────────────────────────────────────
  sectionTitle("Anomaly Flags");
  if (v.anomaly_flags.length) {
    v.anomaly_flags.forEach((f) => kvRow("•", f));
  } else {
    kvRow("—", "None.");
  }

  // ── Recommendation ────────────────────────────────────────────────────────
  sectionTitle("Recommendation");
  kvRow(v.recommendation.action, v.recommendation.detail);

  // ── Active alerts ─────────────────────────────────────────────────────────
  sectionTitle("Active Alerts");
  if (v.alerts.length) {
    v.alerts.forEach((a) => kvRow("•", a));
  } else {
    kvRow("—", "No active alerts.");
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageH - 24, pageW - margin, pageH - 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Confidential — VendorLens Risk Management", margin, pageH - 12);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 12, { align: "right" });
  }

  return doc;
}

export default function ReportPage() {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [vendorReportLoading, setVendorReportLoading] = useState(false);

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

  /** Fetch full vendor detail and download a paginated PDF report. */
  const downloadVendorReport = useCallback(async () => {
    if (!selectedVendorId) return;
    setVendorReportLoading(true);
    try {
      const detail = await api.vendors.get(selectedVendorId);
      const doc = buildVendorReportPDF(detail);
      const safeName = detail.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || detail.vendor_id;
      doc.save(`vendor_report_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      setError(String(e));
    } finally {
      setVendorReportLoading(false);
    }
  }, [selectedVendorId]);

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

  const complianceData = report.compliance_coverage ? [
    { name: "SOC 2 Type II", ...report.compliance_coverage.soc2_type2 },
    { name: "ISO 27001", ...report.compliance_coverage.iso27001 },
    { name: "GDPR DPA", ...report.compliance_coverage.gdpr_dpa },
  ] : [];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink tracking-tight">Audit Report</h1>
          <p className="text-sm text-slate-500 mt-1">
            Generated: {new Date(report.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="flex items-center gap-2">
            <div className="w-[260px]">
              <SearchSelect
                value={selectedVendorId}
                onValueChange={setSelectedVendorId}
                placeholder="Search vendor or portfolio..."
                enableClear
              >
                <SearchSelectItem value="">All vendors (portfolio)</SearchSelectItem>
                {vendors.map((v) => (
                  <SearchSelectItem key={v.vendor_id} value={v.vendor_id}>
                    {v.name} ({v.vendor_id})
                  </SearchSelectItem>
                ))}
              </SearchSelect>
            </div>
            <button
              onClick={downloadVendorReport}
              disabled={!selectedVendorId || vendorReportLoading}
              title={!selectedVendorId ? "Select a vendor first" : "Download a PDF report for this vendor"}
              className="btn-secondary"
            >
              <DocumentArrowDownIcon className="w-4 h-4" />
              {vendorReportLoading ? "Building…" : "Vendor PDF"}
            </button>
          </div>
          <button
            onClick={exportCSV}
            className="btn-secondary"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="btn-primary"
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
          <p className="text-3xl font-bold text-ink mt-1">{report.total_vendors}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Avg Risk Score</p>
          <p className="text-3xl font-bold text-ink mt-1">{report.average_risk_score.toFixed(1)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Red Flag Vendors</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{(report.red_flag_vendors ?? []).length}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Green Status</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{report.rag_summary.GREEN}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
        {/* RAG Distribution Pie */}
        <div className="card p-6 flex flex-col items-center">
          <h2 className="text-sm font-semibold text-slate-700 mb-2 self-start">RAG Distribution</h2>
          <MuiPieChart
            series={[
              {
                data: ragData.map((d) => ({ id: d.name, value: d.value, label: d.name, color: d.color })),
                highlightScope: { fade: "global", highlight: "item" },
                faded: { innerRadius: 30, additionalRadius: -30, color: "#cbd5e1" },
                innerRadius: 55,
                outerRadius: 95,
                paddingAngle: 4,
                valueFormatter: (item) => `${item.value} vendors`,
              },
            ]}
            width={260}
            height={220}
            slotProps={{ legend: { hidden: true } }}
          />
          <div className="flex justify-center gap-6 mt-1">
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
              <Bar dataKey="count" radius={[8, 8, 0, 0]} shape={<AnimatedBar />}>
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
                <span className="text-sm font-bold text-ink">{c.percentage}%</span>
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

      {/* Category Breakdown */}
      {(report.category_breakdown ?? []).length > 0 && (
        <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Risk by Category</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={report.category_breakdown} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px" }} />
              <Bar dataKey="red" name="Red" stackId="a" fill="#ef4444" radius={[0,0,0,0]} shape={<AnimatedStackedBar />} />
              <Bar dataKey="amber" name="Amber" stackId="a" fill="#f59e0b" shape={<AnimatedStackedBar />} />
              <Bar dataKey="green" name="Green" stackId="a" fill="#10b981" radius={[4,4,0,0]} shape={<AnimatedStackedBar />} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Score Trend */}
      {(report.score_trend ?? []).length > 1 && (
        <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.25s" }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Portfolio Risk Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={report.score_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px" }} />
              <Line type="monotone" dataKey="avg_score" stroke="#0F766E" strokeWidth={2} dot={false} name="Avg Score" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Red Flag Vendors */}
      {(report.red_flag_vendors ?? []).length > 0 && (
        <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Red-Flag Vendors — Required Actions</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {(report.red_flag_vendors ?? []).map((v) => (
              <div key={v.vendor_id} className="px-6 py-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-semibold text-ink">{v.name}</span>
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
