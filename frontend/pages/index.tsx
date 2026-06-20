import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { MagnifyingGlassIcon, FunnelIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  UserGroupIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/solid";
import { api } from "../lib/api";
import { RagBadge } from "../components/RagBadge";
import { TableSkeleton, CardRowSkeleton } from "../components/LoadingSkeleton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { IncidentManager } from "../components/IncidentManager";
import type { VendorSummary, RiskLevel } from "../types/vendor";
import { useRefresh } from "./_app";

type SortField = "name" | "category" | "risk_score" | "risk_level";
type SortDir = "asc" | "desc";

const RISK_ORDER: Record<RiskLevel, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const BAR_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#f59e0b",
  LOW: "#10b981",
};

export default function Dashboard() {
  const { refreshKey } = useRefresh();
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");

  // Sort
  const [sortField, setSortField] = useState<SortField>("risk_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function fetchVendors() {
    setLoading(true);
    setError(null);
    api.vendors
      .list()
      .then((data) => {
        setVendors(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchVendors();
  }, [refreshKey]);

  // Derived data
  const categories = useMemo(() => vendors.map((v) => v.category).filter((v, i, a) => a.indexOf(v) === i).sort(), [vendors]);

  const riskCounts = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    vendors.forEach((v) => counts[v.risk_level]++);
    return counts;
  }, [vendors]);

  const chartData = useMemo(
    () =>
      (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as RiskLevel[]).map((level) => ({
        level,
        count: riskCounts[level],
      })),
    [riskCounts]
  );

  const filtered = useMemo(() => {
    let result = vendors;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((v) => v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q));
    }
    if (catFilter) result = result.filter((v) => v.category === catFilter);
    if (riskFilter) result = result.filter((v) => v.risk_level === riskFilter);
    return result;
  }, [vendors, search, catFilter, riskFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "risk_score":
          cmp = a.risk_score - b.risk_score;
          break;
        case "risk_level":
          cmp = RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level];
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUpIcon className="w-3 h-3 text-slate-300" />;
    return sortDir === "asc" ? (
      <ChevronUpIcon className="w-3 h-3 text-indigo-600" />
    ) : (
      <ChevronDownIcon className="w-3 h-3 text-indigo-600" />
    );
  }

  const hasFilters = search || catFilter || riskFilter;

  if (error && !loading && vendors.length === 0) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={fetchVendors} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Portfolio Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Third-party vendor risk overview</p>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <CardRowSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 animate-slide-up">
          <SummaryCard
            label="Total Vendors"
            value={vendors.length}
            icon={<UserGroupIcon className="w-5 h-5 text-indigo-500" />}
            accent="indigo"
          />
          <SummaryCard
            label="Critical"
            value={riskCounts.CRITICAL}
            icon={<ShieldExclamationIcon className="w-5 h-5 text-red-500" />}
            accent="red"
          />
          <SummaryCard
            label="High"
            value={riskCounts.HIGH}
            icon={<ExclamationTriangleIcon className="w-5 h-5 text-orange-500" />}
            accent="orange"
          />
          <SummaryCard
            label="Medium"
            value={riskCounts.MEDIUM}
            icon={<ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />}
            accent="amber"
          />
          <SummaryCard
            label="Low"
            value={riskCounts.LOW}
            icon={<CheckCircleIcon className="w-5 h-5 text-emerald-500" />}
            accent="emerald"
          />
        </div>
      )}

      {/* Chart */}
      {!loading && vendors.length > 0 && (
        <div className="card p-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Vendors by Risk Level</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="level" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  fontSize: "13px",
                }}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.level} fill={BAR_COLORS[entry.level]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Incident Center */}
      <div className="animate-slide-up" style={{ animationDelay: "0.15s" }}>
        <IncidentManager onUpdate={fetchVendors} />
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
          />
        </div>
        <div className="flex gap-2 items-center">
          <FunnelIcon className="w-4 h-4 text-slate-400 hidden sm:block" />
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All Risk Levels</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setCatFilter("");
                setRiskFilter("");
              }}
              className="px-3 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: "0.2s" }}>
        {loading ? (
          <TableSkeleton />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No vendors match"
            message="Try changing your search or filter criteria."
            action={hasFilters ? { label: "Clear filters", onClick: () => { setSearch(""); setCatFilter(""); setRiskFilter(""); } } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <SortHeader field="name" label="Vendor" onSort={toggleSort}>
                    <SortIcon field="name" />
                  </SortHeader>
                  <SortHeader field="category" label="Category" onSort={toggleSort}>
                    <SortIcon field="category" />
                  </SortHeader>
                  <SortHeader field="risk_score" label="Risk Score" onSort={toggleSort}>
                    <SortIcon field="risk_score" />
                  </SortHeader>
                  <SortHeader field="risk_level" label="Risk Level" onSort={toggleSort}>
                    <SortIcon field="risk_level" />
                  </SortHeader>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Alerts
                  </th>
                  <th className="px-6 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((v) => (
                  <tr
                    key={v.vendor_id}
                    className="group hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <Link href={`/vendors/${v.vendor_id}`} className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {v.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{v.category}</td>
                    <td className="px-6 py-4">
                      <span className="font-mono font-semibold text-slate-900">{v.risk_score.toFixed(1)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <RagBadge rag={v.rag} pulse={v.risk_level === "CRITICAL"} />
                    </td>
                    <td className="px-6 py-4">
                      {v.alerts.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          {v.alerts.length} alert{v.alerts.length > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/vendors/${v.vendor_id}`}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold transition-colors"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
}) {
  const bgMap: Record<string, string> = {
    indigo: "bg-indigo-50",
    red: "bg-red-50",
    orange: "bg-orange-50",
    amber: "bg-amber-50",
    emerald: "bg-emerald-50",
  };
  return (
    <div className="card p-5 group hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${bgMap[accent] || "bg-slate-50"} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
    </div>
  );
}

function SortHeader({
  field,
  label,
  onSort,
  children,
}: {
  field: SortField;
  label: string;
  onSort: (f: SortField) => void;
  children: React.ReactNode;
}) {
  return (
    <th
      onClick={() => onSort(field)}
      className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {children}
      </span>
    </th>
  );
}
