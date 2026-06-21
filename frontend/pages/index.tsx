import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Card, DonutChart, Badge } from "@tremor/react";
import { MagnifyingGlassIcon, FunnelIcon, XMarkIcon, PlusIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { ShieldExclamationIcon, UserGroupIcon, BoltIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { api } from "../lib/api";
import { RagBadge } from "../components/RagBadge";
import { TableSkeleton, CardRowSkeleton } from "../components/LoadingSkeleton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { useAuth } from "../contexts/AuthContext";
import type { VendorSummary, RiskLevel, VendorCreateRequest } from "../types/vendor";
import { useRefresh } from "./_app";

const BLANK_VENDOR: VendorCreateRequest = {
  name: "", category: "Cloud", contract_start: "", contract_end: "",
  data_sensitivity: "LOW", access_type: "read", systems: "", soc2_type2: false,
  soc2_expiry: "", iso27001: false, gdpr_dpa: false, breach_notification_sla_hours: 72,
  financial_rating: "BBB", data_residency: "EU", concentration_risk: "LOW",
  sub_processor_count: 0, under_investigation: false, breach_history: "",
  last_assessment_date: "", contact_name: "", contact_email: "",
};

type SortField = "name" | "category" | "risk_score" | "risk_level";
type SortDir = "asc" | "desc";
const RISK_ORDER: Record<RiskLevel, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } };

export default function Dashboard() {
  const { refreshKey } = useRefresh();
  const { user } = useAuth();
  const canWrite = user?.role === "ADMIN" || user?.role === "ANALYST";
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("risk_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<VendorCreateRequest>(BLANK_VENDOR);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestTab, setIngestTab] = useState<"file" | "email" | "json">("file");
  const [ingestFile, setIngestFile] = useState<File | null>(null);
  const [ingestEmail, setIngestEmail] = useState("");
  const [ingestJson, setIngestJson] = useState("");
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ rows_processed: number; message: string } | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  function fetchVendors() {
    setLoading(true);
    setError(null);
    api.vendors.list()
      .then((data) => { setVendors(data); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }
  useEffect(() => { fetchVendors(); }, [refreshKey]);

  const categories = useMemo(() => vendors.map((v) => v.category).filter((v, i, a) => a.indexOf(v) === i).sort(), [vendors]);
  const riskCounts = useMemo(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    vendors.forEach((v) => c[v.risk_level]++);
    return c;
  }, [vendors]);
  const ragCounts = useMemo(() => {
    const c = { RED: 0, AMBER: 0, GREEN: 0 };
    vendors.forEach((v) => c[v.rag]++);
    return c;
  }, [vendors]);
  const needsAction = useMemo(() => vendors.filter((v) => v.alerts.length > 0).length, [vendors]);
  const totalAlerts = useMemo(() => vendors.reduce((s, v) => s + v.alerts.length, 0), [vendors]);
  const ragDonut = [
    { name: "Red", value: ragCounts.RED },
    { name: "Amber", value: ragCounts.AMBER },
    { name: "Green", value: ragCounts.GREEN },
  ];

  const filtered = useMemo(() => {
    let r = vendors;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((v) => v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q));
    }
    if (catFilter) r = r.filter((v) => v.category === catFilter);
    if (riskFilter) r = r.filter((v) => v.risk_level === riskFilter);
    return r;
  }, [vendors, search, catFilter, riskFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "category": cmp = a.category.localeCompare(b.category); break;
        case "risk_score": cmp = a.risk_score - b.risk_score; break;
        case "risk_level": cmp = RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level]; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  }
  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUpIcon className="w-3 h-3 text-slate-300" />;
    return sortDir === "asc"
      ? <ChevronUpIcon className="w-3 h-3 text-teal-600" />
      : <ChevronDownIcon className="w-3 h-3 text-teal-600" />;
  }
  const hasFilters = search || catFilter || riskFilter;

  async function handleIngest() {
    setIngestLoading(true); setIngestError(null); setIngestResult(null);
    try {
      let res;
      if (ingestTab === "email") {
        if (!ingestEmail.trim()) throw new Error("Paste email text first");
        res = await api.ingest.email(ingestEmail);
      } else if (ingestTab === "json") {
        if (!ingestJson.trim()) throw new Error("Paste JSON first");
        let parsed;
        try { parsed = JSON.parse(ingestJson); } catch { throw new Error("Invalid JSON"); }
        const v = Array.isArray(parsed) ? parsed : [parsed];
        res = await api.ingest.json(v);
      } else {
        if (!ingestFile) throw new Error("Select a file first");
        res = await api.ingest.upload(ingestFile);
      }
      setIngestResult({ rows_processed: res.rows_processed, message: res.message });
      setIngestFile(null);
      fetchVendors();
    } catch (e) { setIngestError(String(e)); } finally { setIngestLoading(false); }
  }

  async function handleAddVendor() {
    if (!addForm.name.trim()) return;
    setAddLoading(true); setAddError(null);
    try {
      await api.vendors.create(addForm);
      setAddOpen(false); setAddForm(BLANK_VENDOR); fetchVendors();
    } catch (e) { setAddError(String(e)); } finally { setAddLoading(false); }
  }

  if (error && !loading && vendors.length === 0) {
    return <div className="p-8"><ErrorState message={error} onRetry={fetchVendors} /></div>;
  }

  const inputCls = "w-full px-3 py-2 bg-paper border border-hairline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal/30 focus:bg-white";

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink tracking-tight">Vendor Register</h1>
          <p className="text-sm text-slate-500 mt-1">Third-party risk portfolio: {vendors.length} vendors under watch</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setIngestOpen(true); setIngestResult(null); setIngestError(null); }} disabled={!canWrite} title={canWrite ? "" : "Read-only role"}
            className="btn-secondary">
            <ArrowUpTrayIcon className="w-4 h-4" /> Import Data
          </button>
          <button onClick={() => { setAddOpen(true); setAddError(null); }} disabled={!canWrite} title={canWrite ? "" : "Read-only role"}
            className="btn-primary">
            <PlusIcon className="w-4 h-4" /> Add Vendor
          </button>
        </div>
      </div>

      {loading ? <CardRowSkeleton /> : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-fr">
          <motion.div variants={fadeUp} className="h-full">
            <Card className="ring-hairline shadow-card h-full flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Vendors</p>
                <UserGroupIcon className="w-5 h-5 text-teal-600" />
              </div>
              <p className="font-display text-3xl font-bold text-ink mt-2 tabular">{vendors.length}</p>
              <p className="text-xs text-slate-400 mt-1">{categories.length} categories</p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} className="h-full">
            <Card className="ring-hairline shadow-card h-full flex flex-col justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">RAG Distribution</p>
              <div className="flex items-center gap-3">
                <DonutChart data={ragDonut} category="value" index="name" colors={["red", "amber", "emerald"]} showLabel={false} showTooltip className="w-16 h-16 shrink-0" />
                <div className="space-y-1 text-xs">
                  <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rag-red" /> Red <span className="tabular font-semibold text-ink ml-1">{ragCounts.RED}</span></p>
                  <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rag-amber" /> Amber <span className="tabular font-semibold text-ink ml-1">{ragCounts.AMBER}</span></p>
                  <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rag-green" /> Green <span className="tabular font-semibold text-ink ml-1">{ragCounts.GREEN}</span></p>
                </div>
              </div>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} className="h-full">
            <Card className="ring-hairline shadow-card h-full flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Critical Vendors</p>
                <ShieldExclamationIcon className="w-5 h-5 text-rag-red" />
              </div>
              <p className="font-display text-3xl font-bold text-rag-red mt-2 tabular">{riskCounts.CRITICAL}</p>
              <p className="text-xs text-slate-400 mt-1">{riskCounts.HIGH} high-risk also</p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} className="h-full">
            <Card className="ring-hairline shadow-card h-full flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Needs Action</p>
                <BoltIcon className="w-5 h-5 text-brass-600" />
              </div>
              <p className="font-display text-3xl font-bold text-ink mt-2 tabular">{needsAction}</p>
              <p className="text-xs text-slate-400 mt-1">{totalAlerts} open alerts</p>
            </Card>
          </motion.div>
        </motion.div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors..."
            className="search-field" />
        </div>
        <div className="flex gap-2 items-center">
          <FunnelIcon className="w-4 h-4 text-slate-400 hidden sm:block" />
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="select-field">
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="select-field">
            <option value="">All Risk Levels</option>
            <option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
          </select>
          {hasFilters && <button onClick={() => { setSearch(""); setCatFilter(""); setRiskFilter(""); }} className="px-3 py-2.5 text-xs font-medium text-slate-600 hover:text-ink hover:bg-slate-100 rounded-lg transition-colors"><XMarkIcon className="w-4 h-4" /></button>}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="card overflow-hidden">
        {loading ? <TableSkeleton /> : sorted.length === 0 ? (
          <EmptyState title="No vendors match" message="Try changing your search or filter criteria." action={hasFilters ? { label: "Clear filters", onClick: () => { setSearch(""); setCatFilter(""); setRiskFilter(""); } } : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-slate-50/60">
                  <SortHeader field="name" label="Vendor" onSort={toggleSort}><SortIcon field="name" /></SortHeader>
                  <SortHeader field="risk_level" label="RAG" onSort={toggleSort}><SortIcon field="risk_level" /></SortHeader>
                  <SortHeader field="risk_score" label="Score" onSort={toggleSort}><SortIcon field="risk_score" /></SortHeader>
                  <th className="px-6 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Top Signal</th>
                  <th className="px-6 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/70">
                {sorted.map((v) => (
                  <tr key={v.vendor_id} className="group hover:bg-teal-50/40 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link href={`/vendors/${v.vendor_id}`} className="font-medium text-ink group-hover:text-teal-700 transition-colors">{v.name}</Link>
                      <p className="text-[11px] text-slate-400">{v.category}</p>
                    </td>
                    <td className="px-6 py-3.5"><RagBadge rag={v.rag} pulse={v.risk_level === "CRITICAL"} /></td>
                    <td className="px-6 py-3.5"><span className="tabular font-semibold text-ink">{v.risk_score.toFixed(1)}</span></td>
                    <td className="px-6 py-3.5 max-w-xs">
                      {v.alerts.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <Badge color={v.rag === "RED" ? "red" : v.rag === "AMBER" ? "amber" : "emerald"} size="xs">{v.alerts.length}</Badge>
                          <span className="text-xs text-slate-600 truncate">{v.alerts[0]}</span>
                        </div>
                      ) : <span className="text-slate-400 text-xs">No active signals</span>}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link href={`/vendors/${v.vendor_id}`} className="text-teal-700 hover:text-teal-800 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {ingestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
              <h2 className="text-base font-display font-bold text-ink">Import Vendor Data</h2>
              <button onClick={() => { setIngestOpen(false); setIngestResult(null); setIngestError(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg"><XMarkIcon className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="flex border-b border-hairline px-6">
              {(["file", "email", "json"] as const).map((tab) => (
                <button key={tab} onClick={() => { setIngestTab(tab); setIngestResult(null); setIngestError(null); }}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${ingestTab === tab ? "border-teal text-teal-700" : "border-transparent text-slate-500 hover:text-ink"}`}>
                  {tab === "file" ? "File" : tab === "email" ? "Email Paste" : "JSON Paste"}
                </button>
              ))}
            </div>
            <div className="px-6 py-5 space-y-4">
              {ingestTab === "file" && (
                <>
                  <p className="text-sm text-slate-500">Upload CSV, JSON, Excel (.xlsx), or YAML. Existing vendors updated; new ones added.</p>
                  <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-hairline rounded-xl cursor-pointer hover:border-teal hover:bg-teal-50 transition-colors">
                    <ArrowUpTrayIcon className="w-7 h-7 text-slate-400 mb-2" />
                    <span className="text-sm text-slate-500">{ingestFile ? ingestFile.name : "Click to select file"}</span>
                    <span className="text-xs text-slate-400 mt-0.5">.csv .json .xlsx .yaml</span>
                    <input type="file" accept=".csv,.json,.xlsx,.yaml,.yml" className="hidden" onChange={(e) => { setIngestFile(e.target.files?.[0] ?? null); setIngestResult(null); setIngestError(null); }} />
                  </label>
                </>
              )}
              {ingestTab === "email" && (
                <>
                  <p className="text-sm text-slate-500">Paste an email body with Field: Value pairs. Blank lines separate vendors.</p>
                  <textarea rows={8} placeholder={"Vendor Name: Acme Corp\nCategory: Cloud\nData Sensitivity: HIGH"} value={ingestEmail} onChange={(e) => { setIngestEmail(e.target.value); setIngestResult(null); setIngestError(null); }} className="w-full text-xs font-mono border border-hairline rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal/30 resize-y" />
                </>
              )}
              {ingestTab === "json" && (
                <>
                  <p className="text-sm text-slate-500">Paste a JSON array of vendor objects.</p>
                  <textarea rows={8} placeholder={'[{ "name": "Acme Corp", "category": "Cloud", "soc2_type2": true }]'} value={ingestJson} onChange={(e) => { setIngestJson(e.target.value); setIngestResult(null); setIngestError(null); }} className="w-full text-xs font-mono border border-hairline rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal/30 resize-y" />
                </>
              )}
              {ingestError && <p className="text-sm text-rag-red bg-rag-red/10 px-3 py-2 rounded-lg">{ingestError}</p>}
              {ingestResult && (
                <div className="bg-rag-green/10 border border-rag-green/20 rounded-lg px-4 py-3">
                  <p className="text-sm font-semibold text-rag-green">{ingestResult.rows_processed} vendor(s) processed</p>
                  <p className="text-xs text-slate-500 mt-0.5">{ingestResult.message}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => { setIngestOpen(false); setIngestResult(null); setIngestError(null); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button onClick={handleIngest} disabled={ingestLoading} className="flex items-center gap-2 px-4 py-2 bg-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                  <ArrowUpTrayIcon className="w-4 h-4" /> {ingestLoading ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-hairline sticky top-0 bg-white z-10">
              <h2 className="text-base font-display font-bold text-ink">Add New Vendor</h2>
              <button onClick={() => setAddOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><XMarkIcon className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Vendor Name *</label><input type="text" placeholder="Acme Corp" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} /></div>
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Category</label><select value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} className={inputCls}>{["Cloud","SaaS","ERP","HR","Payment","Security","Backup","Managed Service","Consulting","Other"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Contract Start</label><input type="date" value={addForm.contract_start ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, contract_start: e.target.value }))} className={inputCls} /></div>
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Contract End</label><input type="date" value={addForm.contract_end ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, contract_end: e.target.value }))} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Financial Rating</label><select value={addForm.financial_rating} onChange={(e) => setAddForm((f) => ({ ...f, financial_rating: e.target.value }))} className={inputCls}>{["AAA","AA","A","BBB","BB","B","CCC","CC","C"].map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Concentration Risk</label><select value={addForm.concentration_risk} onChange={(e) => setAddForm((f) => ({ ...f, concentration_risk: e.target.value as "LOW"|"MEDIUM"|"HIGH" }))} className={inputCls}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Data Sensitivity</label><select value={addForm.data_sensitivity} onChange={(e) => setAddForm((f) => ({ ...f, data_sensitivity: e.target.value as "LOW"|"MEDIUM"|"HIGH" }))} className={inputCls}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option></select></div>
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Access Type</label><select value={addForm.access_type} onChange={(e) => setAddForm((f) => ({ ...f, access_type: e.target.value as "read"|"read_write" }))} className={inputCls}><option value="read">Read only</option><option value="read_write">Read / Write</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Systems (comma-sep)</label><input type="text" placeholder="CRM, Payroll" value={addForm.systems ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, systems: e.target.value }))} className={inputCls} /></div>
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Data Residency</label><select value={addForm.data_residency} onChange={(e) => setAddForm((f) => ({ ...f, data_residency: e.target.value as "EU"|"non-EU" }))} className={inputCls}><option value="EU">EU</option><option value="non-EU">non-EU</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Contact Name</label><input type="text" placeholder="Jane Smith" value={addForm.contact_name ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, contact_name: e.target.value }))} className={inputCls} /></div>
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Contact Email</label><input type="email" placeholder="jane@vendor.com" value={addForm.contact_email ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, contact_email: e.target.value }))} className={inputCls} /></div>
              </div>
              <div className="pt-2 border-t border-hairline">
                <h3 className="text-sm font-semibold text-ink mb-3">Advanced Security Details</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1">SOC 2 Expiry</label><input type="date" value={addForm.soc2_expiry ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, soc2_expiry: e.target.value }))} className={inputCls} /></div>
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1">Last Assessment</label><input type="date" value={addForm.last_assessment_date ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, last_assessment_date: e.target.value }))} className={inputCls} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1">Breach SLA (h)</label><input type="number" value={addForm.breach_notification_sla_hours} onChange={(e) => setAddForm((f) => ({ ...f, breach_notification_sla_hours: parseInt(e.target.value) || 0 }))} className={inputCls} /></div>
                  <div><label className="block text-xs font-semibold text-slate-600 mb-1">Sub-processors</label><input type="number" value={addForm.sub_processor_count} onChange={(e) => setAddForm((f) => ({ ...f, sub_processor_count: parseInt(e.target.value) || 0 }))} className={inputCls} /></div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Breach History</label>
                  <textarea rows={2} placeholder="YYYY-MM-DD|SEVERITY|Description" value={addForm.breach_history ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, breach_history: e.target.value }))} className={inputCls + " resize-y"} />
                  <p className="text-[10px] text-slate-500 mt-1">Format: date|severity|description, pipe-separated</p>
                </div>
                <label className="flex items-center gap-2 p-3 bg-rag-red/5 border border-rag-red/20 rounded-lg cursor-pointer hover:bg-rag-red/10 transition-colors">
                  <input type="checkbox" checked={addForm.under_investigation} onChange={(e) => setAddForm((f) => ({ ...f, under_investigation: e.target.checked }))} className="rounded text-rag-red w-4 h-4" />
                  <span className="text-sm font-semibold text-rag-red">Vendor Currently Under Investigation</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Compliance</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["soc2_type2","iso27001","gdpr_dpa"] as const).map((key) => (
                    <label key={key} className="flex items-center gap-2 px-3 py-2 bg-paper border border-hairline rounded-lg cursor-pointer hover:bg-teal-50 hover:border-teal/40 transition-colors">
                      <input type="checkbox" checked={!!addForm[key]} onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.checked }))} className="rounded text-teal-600" />
                      <span className="text-xs font-medium text-ink">{key === "soc2_type2" ? "SOC 2" : key === "iso27001" ? "ISO 27001" : "GDPR DPA"}</span>
                    </label>
                  ))}
                </div>
              </div>
              {addError && <p className="text-xs text-rag-red bg-rag-red/10 px-3 py-2 rounded-lg">{addError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-hairline sticky bottom-0 bg-white">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleAddVendor} disabled={addLoading || !addForm.name.trim()} className="px-5 py-2 bg-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-40">{addLoading ? "Creating..." : "Create Vendor"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortHeader({ field, label, onSort, children }: { field: SortField; label: string; onSort: (f: SortField) => void; children: React.ReactNode }) {
  return (
    <th onClick={() => onSort(field)} className="px-6 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-ink select-none">
      <span className="inline-flex items-center gap-1">{label}{children}</span>
    </th>
  );
}
