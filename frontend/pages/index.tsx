import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { RagBadge } from "../components/RagBadge";
import type { VendorSummary } from "../types/vendor";

export default function Dashboard() {
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.vendors.list().then(setVendors).catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">VendorLens</h1>
          <Link
            href="/chat"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Audit Chat
          </Link>
        </div>

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
                    ) : (
                      "—"
                    )}
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
