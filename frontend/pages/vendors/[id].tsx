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
  PencilSquareIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  DocumentCheckIcon,
  LightBulbIcon,
  XMarkIcon as XIcon,
} from "@heroicons/react/24/outline";
import { api } from "../../lib/api";
import { RagBadge } from "../../components/RagBadge";
import { ErrorState } from "../../components/ErrorState";
import type { VendorScore, SimulateResponse, ScoreHistoryPoint, RemediationRecord, CertDocument, VendorSuggestion, ContractAnalysis } from "../../types/vendor";

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

  // Edit vendor panel
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  // AI narrative
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  // AI Suggestions
  const [suggestions, setSuggestions] = useState<VendorSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Cert upload
  const [certs, setCerts] = useState<CertDocument[]>([]);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certType, setCertType] = useState("soc2_type2");
  const [certExpiry, setCertExpiry] = useState("");
  const [certLoading, setCertLoading] = useState(false);

  // Contract analysis
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractResult, setContractResult] = useState<ContractAnalysis | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);

  function fetchVendor() {
    if (typeof id !== "string") return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.vendors.get(id),
      api.vendors.history(id).catch(() => [] as ScoreHistoryPoint[]),
      api.vendors.remediations(id).catch(() => [] as RemediationRecord[]),
      api.vendors.certs(id).catch(() => [] as CertDocument[]),
    ]).then(([v, h, r, c]) => {
      setVendor(v);
      setHistory(h);
      setRemediations(r);
      setCerts(c);
      // Load narrative in background — non-blocking
      setNarrativeLoading(true);
      api.vendors.narrative(id)
        .then((res) => setNarrative(res.narrative))
        .catch(() => setNarrative(null))
        .finally(() => setNarrativeLoading(false));
      setEditForm({
        contact_name: v.contact_name ?? "",
        contact_email: v.contact_email ?? "",
        category: v.category,
        contract_end: v.contract_end ?? "",
        soc2_type2: v.compliance.soc2_type2,
        soc2_expiry: v.compliance.soc2_expiry ?? "",
        iso27001: v.compliance.iso27001,
        gdpr_dpa: v.compliance.gdpr_dpa,
        breach_notification_sla_hours: v.compliance.breach_notification_sla_hours,
        financial_rating: v.financial_rating,
        data_sensitivity: v.data_access.data_sensitivity,
        access_type: v.data_access.access_type,
        concentration_risk: v.concentration_risk,
      });
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

  async function submitEdit() {
    if (!vendor) return;
    setEditLoading(true);
    setEditMsg(null);
    try {
      const res = await api.vendors.update(vendor.vendor_id, editForm);
      setEditMsg(`Saved — new score: ${res.new_risk_score.toFixed(1)} (${res.new_risk_level})`);
      fetchVendor();
    } catch (e) {
      setEditMsg(`Error: ${String(e)}`);
    } finally {
      setEditLoading(false);
    }
  }

  async function uploadCert() {
    if (!vendor || !certFile) return;
    setCertLoading(true);
    try {
      await api.vendors.uploadCert(vendor.vendor_id, certFile, certType, certExpiry);
      setCertFile(null);
      setCertExpiry("");
      const updated = await api.vendors.certs(vendor.vendor_id);
      setCerts(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setCertLoading(false);
    }
  }

  async function parseContract() {
    if (!vendor || !contractFile) return;
    setContractLoading(true);
    setContractError(null);
    setContractResult(null);
    try {
      const result = await api.contract.parsePdf(contractFile, vendor.vendor_id);
      setContractResult(result);
    } catch (e) {
      setContractError(String(e));
    } finally {
      setContractLoading(false);
    }
  }

  async function loadSuggestions() {
    if (!vendor) return;
    setSuggestionsLoading(true);
    try {
      const res = await api.vendors.suggestions(vendor.vendor_id);
      setSuggestions(res.suggestions);
      setSuggestionsOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSuggestionsLoading(false);
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setEditOpen(!editOpen); setEditMsg(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              editOpen
                ? "bg-slate-700 text-white"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <PencilSquareIcon className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => setSimOpen(!simOpen)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              simOpen
                ? "bg-indigo-600 text-white"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <BeakerIcon className="w-4 h-4" />
            What-If
          </button>
          <Link
            href={`/chat?vendor_id=${vendor.vendor_id}`}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4" />
            Ask AI
          </Link>
          <button
            onClick={loadSuggestions}
            disabled={suggestionsLoading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              suggestionsOpen
                ? "bg-amber-500 text-white"
                : "bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100"
            }`}
          >
            <LightBulbIcon className="w-4 h-4" />
            {suggestionsLoading ? "Loading…" : "AI Suggestions"}
            {suggestions.length > 0 && !suggestionsLoading && (
              <span className="bg-amber-200 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full">{suggestions.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Edit Panel */}
      {editOpen && (
        <div className="card border-l-4 border-slate-400 animate-slide-up mb-6 overflow-hidden">
          {/* ── Current details (read-only snapshot) ── */}
          <div className="px-6 py-5 bg-slate-50 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Current Vendor Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4 text-sm">
              <Detail label="Vendor ID"        desc="Unique system identifier for this vendor" value={vendor.vendor_id} />
              <Detail label="Name"             desc="Legal registered name of the vendor organisation" value={vendor.name} />
              <Detail label="Contact Name"     desc="Primary liaison at the vendor organisation" value={vendor.contact_name || "—"} />
              <Detail label="Contact Email"    desc="Email address of the vendor liaison" value={vendor.contact_email || "—"} />
              <Detail label="Category"         desc="Type of service this vendor provides" value={vendor.category} />
              <Detail label="Risk Score"       desc="Calculated 0–100 score across 5 risk factors" value={`${vendor.risk_score.toFixed(1)} (${vendor.risk_level})`} />
              <Detail label="Financial Rating" desc="Credit rating indicating vendor financial health" value={vendor.financial_rating} />
              <Detail label="Data Sensitivity" desc="Classification of data shared with this vendor" value={vendor.data_access.data_sensitivity} />
              <Detail label="Access Type"      desc="Level of system access granted to this vendor" value={vendor.data_access.access_type.replace("_", " ")} />
              <Detail label="Data Residency"   desc="Geographic region where vendor stores your data" value={vendor.data_residency} />
              <Detail label="Concentration Risk" desc="Risk from over-reliance on this single vendor" value={vendor.concentration_risk} />
              <Detail label="Sub-processors"   desc="Number of third parties the vendor sub-contracts to" value={String(vendor.sub_processor_count)} />
              <Detail label="Contract Start"   desc="Date the vendor contract became effective" value={vendor.contract_start} />
              <Detail label="Contract End"     desc="Date the current vendor contract expires" value={vendor.contract_end} />
              <Detail label="Last Assessment"  desc="Date of the most recent vendor risk assessment" value={vendor.last_assessment_date} />
              <Detail label="Breach SLA"       desc="Max hours vendor must notify you after a breach" value={`${vendor.compliance.breach_notification_sla_hours}h`} />
              <Detail label="SOC 2 Type II"    desc="Independent audit of vendor security controls" value={vendor.compliance.soc2_type2 ? "✓ Certified" : "✗ Missing"} highlight={vendor.compliance.soc2_type2} />
              <Detail label="ISO 27001"        desc="International information security management standard" value={vendor.compliance.iso27001 ? "✓ Certified" : "✗ Missing"} highlight={vendor.compliance.iso27001} />
              <Detail label="GDPR DPA"         desc="Data Processing Agreement for EU data protection" value={vendor.compliance.gdpr_dpa ? "✓ Signed" : "✗ Missing"} highlight={vendor.compliance.gdpr_dpa} />
              <Detail label="SOC 2 Expiry"     desc="Date the current SOC 2 certification expires" value={vendor.compliance.soc2_expiry || "—"} />
              <Detail label="Systems"          desc="Internal systems this vendor has access to" value={vendor.data_access.systems.length > 0 ? vendor.data_access.systems.join(", ") : "—"} />
            </div>
            {vendor.breach_history.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-500 mb-2">Breach History <span className="text-slate-400 font-normal">— recorded security incidents for this vendor</span></p>
                <div className="flex flex-wrap gap-2">
                  {vendor.breach_history.map((b, i) => (
                    <span key={i} className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                      {b.date} · {b.severity} · {b.description}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Edit form ── */}
          <div className="px-6 py-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Update Fields</p>

            {/* Contact */}
            <p className="text-xs font-medium text-slate-500 mb-3">Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">Contact Name</label>
                <p className="text-[10px] text-slate-400 mb-1">Primary liaison at the vendor organisation</p>
                <input type="text" value={String(editForm.contact_name ?? "")}
                  onChange={(e) => setEditForm((f) => ({ ...f, contact_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Jane Smith" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">Contact Email</label>
                <p className="text-[10px] text-slate-400 mb-1">Email address of the vendor liaison</p>
                <input type="email" value={String(editForm.contact_email ?? "")}
                  onChange={(e) => setEditForm((f) => ({ ...f, contact_email: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="jane@vendor.com" />
              </div>
            </div>

            {/* Vendor Profile */}
            <p className="text-xs font-medium text-slate-500 mb-3">Vendor Profile</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">Category</label>
                <p className="text-[10px] text-slate-400 mb-1">Type of service this vendor provides</p>
                <select value={String(editForm.category ?? "Other")}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200">
                  {["Cloud","SaaS","ERP","HR","Payment","Security","Backup","Managed Service","Consulting","Other"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">Contract End Date</label>
                <p className="text-[10px] text-slate-400 mb-1">Date the current vendor contract expires</p>
                <input type="date" value={String(editForm.contract_end ?? "")}
                  onChange={(e) => setEditForm((f) => ({ ...f, contract_end: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">Financial Rating</label>
                <p className="text-[10px] text-slate-400 mb-1">Credit rating indicating vendor financial health</p>
                <select value={String(editForm.financial_rating ?? "BBB")}
                  onChange={(e) => setEditForm((f) => ({ ...f, financial_rating: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200">
                  {["AAA","AA","A","BBB","BB","B","CCC","CC","C"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">Data Sensitivity</label>
                <p className="text-[10px] text-slate-400 mb-1">Classification of data shared with this vendor</p>
                <select value={String(editForm.data_sensitivity ?? "LOW")}
                  onChange={(e) => setEditForm((f) => ({ ...f, data_sensitivity: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200">
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">Access Type</label>
                <p className="text-[10px] text-slate-400 mb-1">Level of system access granted to this vendor</p>
                <select value={String(editForm.access_type ?? "read")}
                  onChange={(e) => setEditForm((f) => ({ ...f, access_type: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200">
                  <option value="read">Read only</option>
                  <option value="read_write">Read / Write</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">Concentration Risk</label>
                <p className="text-[10px] text-slate-400 mb-1">Risk from over-reliance on this single vendor</p>
                <select value={String(editForm.concentration_risk ?? "LOW")}
                  onChange={(e) => setEditForm((f) => ({ ...f, concentration_risk: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200">
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </div>
            </div>

            {/* Compliance */}
            <p className="text-xs font-medium text-slate-500 mb-3">Compliance</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">SOC 2 Expiry Date</label>
                <p className="text-[10px] text-slate-400 mb-1">Date the current SOC 2 certification expires</p>
                <input type="date" value={String(editForm.soc2_expiry ?? "")}
                  onChange={(e) => setEditForm((f) => ({ ...f, soc2_expiry: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-0.5">Breach Notification SLA (hours)</label>
                <p className="text-[10px] text-slate-400 mb-1">Max hours vendor must notify you after a security breach</p>
                <input type="number" value={Number(editForm.breach_notification_sla_hours ?? 72)}
                  onChange={(e) => setEditForm((f) => ({ ...f, breach_notification_sla_hours: parseInt(e.target.value) || 72 }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  min={1} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mb-5">
              {([
                { key: "soc2_type2", label: "SOC 2 Type II", desc: "Independent audit of vendor security controls" },
                { key: "iso27001",   label: "ISO 27001",     desc: "International information security standard" },
                { key: "gdpr_dpa",   label: "GDPR DPA",      desc: "Data Processing Agreement for EU compliance" },
              ] as const).map(({ key, label, desc }) => (
                <label key={key} className="flex items-start gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-colors min-w-[180px]">
                  <input type="checkbox" checked={!!editForm[key]}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.checked }))}
                    className="rounded text-indigo-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-slate-700">{label}</p>
                    <p className="text-[10px] text-slate-400">{desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              {editMsg && (
                <span className={`text-xs font-medium ${editMsg.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
                  {editMsg}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={() => { setEditOpen(false); setEditMsg(null); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                  Cancel
                </button>
                <button onClick={submitEdit} disabled={editLoading}
                  className="px-5 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-900 disabled:opacity-40 transition-colors">
                  {editLoading ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Suggestions Panel */}
      {suggestionsOpen && suggestions.length > 0 && (
        <div className="card p-6 border-l-4 border-amber-400 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <LightBulbIcon className="w-5 h-5 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-900">AI Remediation Suggestions</h2>
              <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">{suggestions.length}</span>
            </div>
            <button onClick={() => setSuggestionsOpen(false)} className="text-slate-400 hover:text-slate-600">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {suggestions.map((s) => (
              <div key={s.id} className={`rounded-xl border p-4 ${
                s.priority === "CRITICAL" ? "border-red-200 bg-red-50" :
                s.priority === "HIGH" ? "border-orange-200 bg-orange-50" :
                s.priority === "MEDIUM" ? "border-amber-200 bg-amber-50" :
                "border-slate-200 bg-slate-50"
              }`}>
                <div className="flex flex-wrap items-start gap-2 mb-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    s.priority === "CRITICAL" ? "bg-red-100 text-red-700" :
                    s.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                    s.priority === "MEDIUM" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>{s.priority}</span>
                  <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">{s.category}</span>
                  <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">{s.framework}</span>
                  <span className="ml-auto text-xs font-semibold text-emerald-700">−{s.score_impact.toFixed(0)} pts</span>
                </div>
                <p className="text-sm font-semibold text-slate-800 mb-1">{s.action}</p>
                <p className="text-xs text-slate-600 mb-2">{s.detail}</p>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>Effort: <strong>{s.effort}</strong></span>
                  <span>Timeline: <strong>{s.timeline}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

          {/* AI narrative */}
          {(narrativeLoading || narrative) && (
            <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border animate-fade-in ${
              narrativeLoading ? "bg-slate-50 border-slate-200" : "bg-indigo-50 border-indigo-200"
            }`}>
              <span className="text-base mt-0.5">{narrativeLoading ? "⏳" : "🤖"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-700 mb-0.5">AI Risk Analysis</p>
                {narrativeLoading ? (
                  <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
                ) : (
                  <p className="text-sm text-slate-700 leading-relaxed">{narrative}</p>
                )}
              </div>
              <span className="text-xs text-slate-400 shrink-0 mt-0.5">gemini flash</span>
            </div>
          )}

          {/* Contact info (shown when set) */}
          {(vendor.contact_name || vendor.contact_email) && (
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm animate-fade-in">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Liaison</span>
              {vendor.contact_name && <span className="font-medium text-slate-800">{vendor.contact_name}</span>}
              {vendor.contact_email && (
                <a href={`mailto:${vendor.contact_email}`} className="text-indigo-600 hover:underline">{vendor.contact_email}</a>
              )}
            </div>
          )}

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

          {/* Remediation Tracking */}
          <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.45s" }}>
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
          {/* Certification Documents */}
          <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.5s" }}>
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <DocumentCheckIcon className="w-4 h-4 text-indigo-500" />
              Certification Documents
            </h2>

            {/* Upload form */}
            <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 mb-3">Upload Certificate</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <select
                  value={certType}
                  onChange={(e) => setCertType(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="soc2_type2">SOC 2 Type II</option>
                  <option value="iso27001">ISO 27001</option>
                  <option value="gdpr_dpa">GDPR DPA</option>
                  <option value="pen_test">Pen Test Report</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="date"
                  value={certExpiry}
                  onChange={(e) => setCertExpiry(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Expiry date"
                />
                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 cursor-pointer hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                  <ArrowUpTrayIcon className="w-4 h-4" />
                  {certFile ? certFile.name : "Choose file…"}
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <button
                onClick={uploadCert}
                disabled={certLoading || !certFile}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {certLoading ? "Uploading…" : "Upload"}
              </button>
            </div>

            {/* Uploaded certs list */}
            {certs.length === 0 ? (
              <p className="text-sm text-slate-400">No certificate documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {certs.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <DocumentCheckIcon className="w-5 h-5 text-indigo-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.filename}</p>
                      <p className="text-xs text-slate-500">
                        {c.cert_type.replace(/_/g, " ").toUpperCase()}
                        {c.expiry_date ? ` · Expires ${c.expiry_date}` : ""}
                        {" · "}Uploaded {c.uploaded_at.slice(0, 10)}
                      </p>
                    </div>
                    <button
                      onClick={() => api.vendors.downloadCert(c.vendor_id, c.id, c.filename)}
                      title="Download certificate"
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-white text-xs font-semibold text-indigo-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                    >
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Contract Analysis */}
          <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.55s" }}>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Contract Analysis</h3>
            <p className="text-xs text-slate-400 mb-4">Upload a PDF contract to extract key clauses — breach SLA, data residency, sub-processors, audit rights, and risk flags.</p>

            {/* Upload row */}
            <div className="flex items-center gap-3 mb-4">
              <label className="flex-1 flex items-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-sm text-slate-500">
                <ArrowUpTrayIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">{contractFile ? contractFile.name : "Choose PDF contract…"}</span>
                <input type="file" accept=".pdf" className="hidden" onChange={(e) => { setContractFile(e.target.files?.[0] ?? null); setContractResult(null); setContractError(null); }} />
              </label>
              <button
                onClick={parseContract}
                disabled={!contractFile || contractLoading}
                className="shrink-0 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {contractLoading ? "Analysing…" : "Analyse"}
              </button>
            </div>

            {contractError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{contractError}</p>
            )}

            {contractResult && (
              <div className="space-y-4">
                {/* Key fields grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Breach SLA", value: contractResult.breach_notification_sla_hours.value != null ? `${contractResult.breach_notification_sla_hours.value}h` : "Not found" },
                    { label: "Data Residency", value: String(contractResult.data_residency.value ?? "Not found") },
                    { label: "Data Ownership", value: String(contractResult.data_ownership_clause.value ?? "Not found") },
                    { label: "Governing Law", value: String(contractResult.governing_law.value ?? "Not found") },
                    { label: "Audit Rights", value: contractResult.audit_rights.value === true ? "Granted" : contractResult.audit_rights.value === false ? "Denied" : "Not specified" },
                    { label: "Sub-processors", value: Array.isArray(contractResult.sub_processors.value) ? contractResult.sub_processors.value.join(", ") : String(contractResult.sub_processors.value ?? "Not found") },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-1">{label}</p>
                      <p className="text-sm font-bold text-slate-800 truncate" title={value}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Key risks */}
                {contractResult.key_risks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Risk Flags ({contractResult.key_risks.length})</p>
                    <div className="space-y-2">
                      {contractResult.key_risks.map((r, i) => (
                        <div key={i} className="flex gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                          <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                          <p className="text-xs text-slate-700">{r.risk}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Offboarding */}
                {contractResult.offboarding_terms.value && (
                  <div className="px-3 py-2 bg-slate-50 rounded-lg">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Offboarding / Data Deletion</p>
                    <p className="text-xs text-slate-600">{String(contractResult.offboarding_terms.value).slice(0, 200)}</p>
                  </div>
                )}
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

function Detail({ label, desc, value, highlight }: { label: string; desc: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      <p className="text-[10px] text-slate-400 mb-0.5">{desc}</p>
      <p className={`text-sm font-bold truncate ${
        highlight === true ? "text-emerald-600" : highlight === false ? "text-red-500" : "text-slate-800"
      }`}>{value || "—"}</p>
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
