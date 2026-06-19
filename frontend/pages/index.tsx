import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { RagBadge } from "../components/RagBadge";
import type { VendorSummary } from "../types/vendor";

const ROLE_BADGE: Record<string, string> = {
  ADMIN:   "bg-red-100 text-red-700",
  ANALYST: "bg-blue-100 text-blue-700",
  AUDITOR: "bg-gray-100 text-gray-600",
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [error, setError]   = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (user === null && typeof window !== "undefined") {
      const stored = sessionStorage.getItem("vl_token");
      if (!stored) router.replace("/login");
    }
  }, [user, router]);

  useEffect(() => {
    if (user) {
      api.vendors.list().then(setVendors).catch((e) => setError(String(e)));
    }
  }, [user]);

  if (!user) return null;

  const canWrite = user.role === "ADMIN" || user.role === "ANALYST";

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">VendorLens</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>{user.email}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[user.role]}`}>
                {user.role}
              </span>
            </div>
            <Link
              href="/chat"
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Audit Chat
            </Link>
            {canWrite && (
              <span
                title="Ingest available to ADMIN and ANALYST"
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium cursor-default opacity-80"
              >
                Ingest
              </span>
            )}
            {!canWrite && (
              <span
                title="Read-only — AUDITOR role cannot ingest data"
                className="px-3 py-1.5 bg-gray-200 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed"
              >
                Ingest 🔒
              </span>
            )}
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-8">
        {!canWrite && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
            <strong>Auditor view</strong> — read-only access. Simulation and ingest controls are
            disabled per segregation-of-duties policy (SOX control).
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">Vendor</th>
                <th className="px-6 py-3 text-left">Category</th>
                <th className="px-6 py-3 text-left">Risk Score</th>
                <th className="px-6 py-3 text-left">Level</th>
                <th className="px-6 py-3 text-left">RAG</th>
                <th className="px-6 py-3 text-left">Alerts</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vendors.map((v) => (
                <tr key={v.vendor_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{v.name}</td>
                  <td className="px-6 py-4 text-gray-600">{v.category}</td>
                  <td className="px-6 py-4 font-mono font-semibold">
                    {v.risk_score.toFixed(1)}
                  </td>
                  <td className="px-6 py-4 text-gray-700">{v.risk_level}</td>
                  <td className="px-6 py-4">
                    <RagBadge rag={v.rag} />
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {v.alerts.length > 0 ? (
                      <span className="text-red-600 font-medium">
                        {v.alerts.length} alert{v.alerts.length > 1 ? "s" : ""}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/vendors/${v.vendor_id}`}
                      className="text-indigo-600 hover:underline text-xs font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {vendors.length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    Loading vendors…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
