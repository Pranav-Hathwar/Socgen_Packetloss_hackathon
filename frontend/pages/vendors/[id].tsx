import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  ChevronRightIcon,
  BeakerIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  DocumentMagnifyingGlassIcon,
  ShieldExclamationIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
} from "@heroicons/react/24/outline";
import { api } from "../../lib/api";
import { RagBadge } from "../../components/RagBadge";
import { ErrorState } from "../../components/ErrorState";
import type { VendorScore, SimulateResponse, ScoreHistoryPoint, RemediationRecord } from "../../types/vendor";

export default function VendorDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [vendor, setVendor] = useState<VendorScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // What-If Simulator
  const [simOpen, setSimOpen] = useState(false);
  const [simToggles, setSimToggles] = useState({ renew_soc2: false, sign_dpa: false, revoke_access: false });
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Score history
  const [history, setHistory] = useState<ScoreHistoryPoint[]>([]);

  // Remediation
  const [remediations, setRemediations] = useState<RemediationRecord[]>([]);
  const [remOpen, setRemOpen] = useState(false);
  const [remForm, setRemForm] = useState({ issue: "", resolved_by: "", note: "" });
  const [remLoading, setRemLoading] = useState(false);

  // Contract Analysis
  const [contractAnalysis, setContractAnalysis] = useState<ContractAnalysisResult | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);

  function fetchVendor() {
    if (typeof id !== "string") return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.vendors.get(id),
      api.vendors.history(id).catch(() => [] as ScoreHistoryPoint[]),
      api.vendors.remediations(id).catch(() => [] as RemediationRecord[]),
    ]).then(([v, h, r]) => {
      setVendor(v);
      setHistory(h);
      setRemediations(r);
      setLoading(false);
    }).catch((e) => { setError(String(e)); setLoading(false); });
  }

  useEffect(() => {
    fetchVendor();
  }, [id]);

  async function submitRemediation() {
    if (!vendor || !remForm.issue || !remForm.resolved_by) return;
    setRemLoading(true);
    try {
      const rec = await api.vendors.remediate(vendor.vendor_id, remForm);
      setRemediations((prev) => [rec, ...prev]);
      setRemForm({ issue: "", resolved_by: "", note: "" });
      setRemOpen(false);
      fetchVendor();
    } catch (e) {
      console.error(e);
    } finally {
      setRemLoading(false);
    }
  }

  async function runSimulation() {
    if (!vendor) return;
    setSimLoading(true);
    try {
      const res = await api.simulate({ vendor_id: vendor.vendor_id, ...simToggles });
      setSimResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setSimLoading(false);
    }
  }

  async function handleContractUpload(file: File) {
    if (!vendor) return;
    setContractLoading(true);
    setContractAnalysis(null);
    try {
      const res = await api.contracts.analyze(file, vendor.vendor_id);
      setContractAnalysis(res);
    } catch (e) {
      console.error(e);
      alert("Failed to analyze contract. Ensure it is a valid PDF.");
    } finally {
      setContractLoading(false);
    }
  }

  async function applyContractFindings() {
    if (!vendor || !contractAnalysis) return;
    setContractLoading(true);
    try {
      const updates: any = {};
      if (contractAnalysis.breach_notification_sla_hours.value) {
        updates.breach_notification_sla_hours = contractAnalysis.breach_notification_sla_hours.value;
      }
      if (contractAnalysis.data_residency.value) {
        updates.data_residency = (contractAnalysis.data_residency.value as string).toUpperCase().includes("EU") ? "EU" : "non-EU";
      }
      if (contractAnalysis.sub_processors.value) {
        updates.sub_processor_count = contractAnalysis.sub_processors.value.length;
      }

      await api.vendors.update(vendor.vendor_id, updates);
      fetchVendor(); // Refresh data
      alert("Vendor profile updated with contract findings!");
    } catch (e) {
      console.error(e);
      alert("Failed to update vendor profile.");
    } finally {
      setContractLoading(false);
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={fetchVendor} />
      </div>
    );
  }

  if (loading || !vendor) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-6 w-24 bg-slate-200 rounded" />
        <div className="h-10 w-64 bg-slate-200 rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-200 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const radarData = [
    { subject: "Data Exposure", value: vendor.score_breakdown.data_exposure, fullMark: 100 },
    { subject: "Compliance", value: vendor.score_breakdown.compliance_gaps, fullMark: 100 },
    { subject: "Breach History", value: vendor.score_breakdown.breach_history, fullMark: 100 },
    { subject: "Financial", value: vendor.score_breakdown.financial_health, fullMark: 100 },
    { subject: "Concentration", value: vendor.score_breakdown.concentration, fullMark: 100 },
  ];

  const actionColors: Record<string, string> = {
    ESCALATE: "bg-red-100 text-red-700 border-red-200",
    REVIEW: "bg-amber-100 text-amber-700 border-amber-200",
    MONITOR: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors mb-6">
        <ArrowLeftIcon className="w-4 h-4" />
        Dashboard
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8 animate-fade-in">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-200">
            <span className="text-white font-bold text-lg">{vendor.name.charAt(0)}</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{vendor.name}</h1>
              <RagBadge rag={vendor.rag} size="md" pulse={vendor.risk_level === "CRITICAL"} />
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              <span>{vendor.category}</span>
              <span>·</span>
              <span>{vendor.data_residency} data residency</span>
              <span>·</span>
              <span>{vendor.vendor_id}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSimOpen(!simOpen)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              simOpen
                ? "bg-indigo-600 text-white"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <BeakerIcon className="w-4 h-4" />
            What-If Simulator
          </button>
          <Link
            href={`/chat?vendor_id=${vendor.vendor_id}`}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4" />
            Ask AI
          </Link>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 space-y-6 min-w-0">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up">
            <StatCard label="Risk Score" value={vendor.risk_score.toFixed(1)} color={vendor.rag === "RED" ? "text-red-600" : vendor.rag === "AMBER" ? "text-amber-600" : "text-emerald-600"} />
            <StatCard label="Risk Level" value={vendor.risk_level} />
            <StatCard label="Financial Rating" value={vendor.financial_rating} />
            <StatCard label="Contract End" value={vendor.contract_end} />
          </div>

          {/* Radar + Compliance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Score Breakdown</h2>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                    formatter={(value: number) => [`${value.toFixed(0)} / 100`, "Score"]}
                  />
                  <Radar
                    dataKey="value"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Compliance Status</h2>
              <dl className="space-y-3">
                <ComplianceRow label="SOC 2 Type II" ok={vendor.compliance.soc2_type2} detail={vendor.compliance.soc2_expiry ? `Expires: ${vendor.compliance.soc2_expiry}` : undefined} />
                <ComplianceRow label="ISO 27001" ok={vendor.compliance.iso27001} />
                <ComplianceRow label="GDPR DPA" ok={vendor.compliance.gdpr_dpa} />
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex justify-between text-sm">
                    <dt className="text-slate-600">Breach Notification SLA</dt>
                    <dd className="font-semibold text-slate-900">{vendor.compliance.breach_notification_sla_hours}h</dd>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-600">Sub-processors</dt>
                  <dd className="font-semibold text-slate-900">{vendor.sub_processor_count}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-600">Last Assessment</dt>
                  <dd className="font-semibold text-slate-900">{vendor.last_assessment_date}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Risk Factors + Anomaly Flags */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: "0.15s" }}>
            <div className="card p-6 border-l-4 border-red-400">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Risk Factors</h2>
              {vendor.risk_factors.length === 0 ? (
                <p className="text-sm text-slate-400">No risk factors identified</p>
              ) : (
                <ul className="space-y-2">
                  {vendor.risk_factors.map((f, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-red-700">
                      <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center shrink-0 mt-0.5 font-semibold">{i + 1}</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-6 border-l-4 border-amber-400">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Anomaly Flags</h2>
              {vendor.anomaly_flags.length === 0 ? (
                <p className="text-sm text-slate-400">No anomalies detected</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {vendor.anomaly_flags.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-medium">
                      ⚠ {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recommendation */}
          <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Recommendation</h2>
            <div className="flex items-start gap-4">
              <span className={`inline-flex px-3 py-1.5 rounded-lg text-xs font-bold border shrink-0 ${actionColors[vendor.recommendation.action] || "bg-slate-100 text-slate-700"}`}>
                {vendor.recommendation.action}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{vendor.recommendation.detail}</p>
            </div>
          </div>

          {/* Alerts */}
          {vendor.alerts.length > 0 && (
            <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.25s" }}>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Active Alerts</h2>
              <div className="space-y-2">
                {vendor.alerts.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    {a}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Breach History */}
          {vendor.breach_history.length > 0 && (
            <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.3s" }}>
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Breach History</h2>
              <div className="space-y-4">
                {vendor.breach_history.map((b, i) => (
                  <div key={i} className="relative pl-8 pb-4 last:pb-0">
                    {i < vendor.breach_history.length - 1 && (
                      <div className="absolute left-3 top-6 bottom-0 w-px bg-slate-200" />
                    )}
                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-slate-500">{b.date}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          b.severity === "CRITICAL" ? "bg-red-100 text-red-700" :
                          b.severity === "HIGH" ? "bg-orange-100 text-orange-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {b.severity}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{b.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data Access */}
          <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.35s" }}>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Data Access</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500 mb-1">Systems</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {vendor.data_access.systems.map((s) => (
                    <span key={s} className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-700">{s}</span>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 mb-1">Sensitivity</dt>
                <dd className="font-semibold text-slate-900">{vendor.data_access.data_sensitivity}</dd>
              </div>
              <div>
                <dt className="text-slate-500 mb-1">Access Type</dt>
                <dd className="font-semibold text-slate-900">{vendor.data_access.access_type.replace("_", " ")}</dd>
              </div>
              <div>
                <dt className="text-slate-500 mb-1">Last Used</dt>
                <dd className="font-semibold text-slate-900">{vendor.data_access.access_last_used_at}</dd>
              </div>
            </dl>
          </div>

          {/* Score History */}
          {history.length > 1 && (
            <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.4s" }}>
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Score History</h2>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={history.slice().reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="scored_at"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickFormatter={(v: string) => v.slice(0, 10)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                    labelFormatter={(v: string) => v.slice(0, 10)}
                    formatter={(value: number, _: string, props: { payload?: ScoreHistoryPoint }) => [
                      `${value.toFixed(1)} (${props.payload?.risk_level ?? ""})`,
                      "Risk Score",
                    ]}
                  />
                  <Line type="monotone" dataKey="risk_score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Contract Intelligence */}
          <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.45s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <DocumentMagnifyingGlassIcon className="w-5 h-5 text-indigo-500" />
                Contract Intelligence
              </h2>
              <div className="flex gap-2">
                <label className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 cursor-pointer transition-colors flex items-center gap-2">
                  <CloudArrowUpIcon className="w-4 h-4" />
                  Upload Contract
                  <input
                    type="file"
                    className="hidden"
                    accept="application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleContractUpload(file);
                    }}
                  />
                </label>
                {contractAnalysis && (
                  <button
                    onClick={applyContractFindings}
                    disabled={contractLoading}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
                  >
                    Apply Findings
                  </button>
                )}
              </div>
            </div>

            {contractLoading && (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-slate-500">Analyzing document structure...</p>
              </div>
            )}

            {!contractLoading && !contractAnalysis && (
              <div className="py-10 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-center px-4">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                  <DocumentMagnifyingGlassIcon className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-600">No contract analyzed for this vendor.</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[240px]">Upload a Master Service Agreement (MSA) or DPA to extract legal risk data.</p>
              </div>
            )}

            {contractAnalysis && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ExtractionField
                    label="Breach Notification SLA"
                    value={contractAnalysis.breach_notification_sla_hours.value ? `${contractAnalysis.breach_notification_sla_hours.value} hours` : "Not Found"}
                    evidence={contractAnalysis.breach_notification_sla_hours.evidence}
                    isMatch={contractAnalysis.breach_notification_sla_hours.value !== null}
                  />
                  <ExtractionField
                    label="Data Residency"
                    value={contractAnalysis.data_residency.value || "Not Found"}
                    evidence={contractAnalysis.data_residency.evidence}
                    isMatch={contractAnalysis.data_residency.value !== null}
                  />
                  <ExtractionField
                    label="Sub-Processors"
                    value={Array.isArray(contractAnalysis.sub_processors.value) ? `${contractAnalysis.sub_processors.value.length} listed` : "Not Found"}
                    evidence={contractAnalysis.sub_processors.evidence}
                    isMatch={contractAnalysis.sub_processors.value.length > 0}
                  />
                  <ExtractionField
                    label="Governing Law"
                    value={contractAnalysis.governing_law.value || "Not Found"}
                    evidence={contractAnalysis.governing_law.evidence}
                    isMatch={contractAnalysis.governing_law.value !== null}
                  />
                </div>

                {contractAnalysis.key_risks.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-50">
                    <h3 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                       <ShieldExclamationIcon className="w-4 h-4" />
                       Unfavorable Clauses Detected
                    </h3>
                    <div className="space-y-2">
                       {contractAnalysis.key_risks.map((r, i) => (
                         <div key={i} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                            <p className="text-xs font-bold text-red-800">{r.risk}</p>
                            <p className="text-[10px] text-red-600 mt-1 italic leading-relaxed">&quot;{r.evidence}&quot;</p>
                         </div>
                       ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Remediation Tracking */}
          <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.5s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Remediation Log</h2>
              <button
                onClick={() => setRemOpen(!remOpen)}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
              >
                + Log Action
              </button>
            </div>

            {remOpen && (
              <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <input
                  type="text"
                  placeholder="Issue resolved (e.g. SOC 2 renewed)"
                  value={remForm.issue}
                  onChange={(e) => setRemForm((f) => ({ ...f, issue: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <input
                  type="text"
                  placeholder="Resolved by (name / team)"
                  value={remForm.resolved_by}
                  onChange={(e) => setRemForm((f) => ({ ...f, resolved_by: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={remForm.note}
                  onChange={(e) => setRemForm((f) => ({ ...f, note: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <div className="flex gap-2">
                  <button
                    onClick={submitRemediation}
                    disabled={remLoading || !remForm.issue || !remForm.resolved_by}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    {remLoading ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setRemOpen(false)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {remediations.length === 0 ? (
              <p className="text-sm text-slate-400">No remediation actions logged yet.</p>
            ) : (
              <div className="space-y-3">
                {remediations.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <span className="text-emerald-600 text-sm">✓</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{r.issue}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>{r.resolved_by}</span>
                        <span>·</span>
                        <span>{r.resolved_at.slice(0, 10)}</span>
                        {r.score_before !== r.score_after && (
                          <>
                            <span>·</span>
                            <span className={r.score_after < r.score_before ? "text-emerald-600" : "text-red-600"}>
                              {r.score_before.toFixed(1)} → {r.score_after.toFixed(1)}
                            </span>
                          </>
                        )}
                      </div>
                      {r.note && <p className="text-xs text-slate-400 mt-1">{r.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* What-If Simulator Sidebar */}
        {simOpen && (
          <div className="hidden lg:block w-80 shrink-0 animate-scale-in">
            <div className="card p-6 sticky top-8">
              <div className="flex items-center gap-2 mb-5">
                <BeakerIcon className="w-5 h-5 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-900">What-If Simulator</h2>
              </div>
              <p className="text-xs text-slate-500 mb-5">Toggle risk-mitigation actions to see their impact on the vendor&apos;s risk score.</p>

              <div className="space-y-3 mb-6">
                <Toggle
                  label="Renew SOC 2 Type II"
                  description="Obtain renewed certification"
                  checked={simToggles.renew_soc2}
                  onChange={(v) => { setSimToggles((t) => ({ ...t, renew_soc2: v })); setSimResult(null); }}
                />
                <Toggle
                  label="Sign GDPR DPA"
                  description="Execute data processing agreement"
                  checked={simToggles.sign_dpa}
                  onChange={(v) => { setSimToggles((t) => ({ ...t, sign_dpa: v })); setSimResult(null); }}
                />
                <Toggle
                  label="Revoke Access"
                  description="Remove system access privileges"
                  checked={simToggles.revoke_access}
                  onChange={(v) => { setSimToggles((t) => ({ ...t, revoke_access: v })); setSimResult(null); }}
                />
              </div>

              <button
                onClick={runSimulation}
                disabled={simLoading || (!simToggles.renew_soc2 && !simToggles.sign_dpa && !simToggles.revoke_access)}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40"
              >
                {simLoading ? "Simulating…" : "Run Simulation"}
              </button>

              {simResult && (
                <div className="mt-5 pt-5 border-t border-slate-100 animate-fade-in">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Impact</h3>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{simResult.original_score.toFixed(1)}</p>
                      <p className="text-xs text-slate-500">Before</p>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-slate-400" />
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{simResult.simulated_score.toFixed(1)}</p>
                      <p className="text-xs text-slate-500">After</p>
                    </div>
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold ${
                      simResult.delta < 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {simResult.delta < 0 ? (
                        <ArrowTrendingDownIcon className="w-4 h-4" />
                      ) : (
                        <ArrowTrendingUpIcon className="w-4 h-4" />
                      )}
                      {Math.abs(simResult.delta).toFixed(1)}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {simResult.actions_applied.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
                        <span>✓</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <RagBadge rag={simResult.simulated_rag} size="md" />
                    <span className="ml-2 text-xs text-slate-500">{simResult.simulated_risk_level}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-2xl font-bold mt-1 tracking-tight ${color || "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function ComplianceRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <dt className="text-sm text-slate-700">{label}</dt>
        {detail && <p className="text-xs text-slate-400">{detail}</p>}
      </div>
      <dd className={`flex items-center gap-1.5 text-sm font-semibold ${ok ? "text-emerald-600" : "text-red-600"}`}>
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
          ok ? "bg-emerald-100" : "bg-red-100"
        }`}>
          {ok ? "✓" : "✗"}
        </span>
        {ok ? "Certified" : "Missing"}
      </dd>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
          checked ? "bg-indigo-600" : "bg-slate-300"
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`} />
      </button>
    </label>
  );
}

function ExtractionField({ label, value, evidence, isMatch }: { label: string; value: string; evidence: string | null; isMatch: boolean }) {
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <div className="p-3 bg-white border border-slate-100 rounded-xl">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{label}</p>
        {isMatch && (
           <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
              <CheckCircleIcon className="w-3 h-3" />
              Verified
           </span>
        )}
      </div>
      <p className={`text-sm font-bold ${isMatch ? "text-slate-900" : "text-slate-400"}`}>{value}</p>
      {evidence && (
        <div className="mt-2">
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 underline flex items-center gap-1"
          >
            {showEvidence ? "Hide Evidence" : "View Legal Snippet"}
          </button>
          {showEvidence && (
            <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-100 animate-slide-up">
              <p className="text-[10px] text-slate-500 italic leading-relaxed leading-relaxed line-clamp-3">
                &quot;{evidence}&quot;
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
