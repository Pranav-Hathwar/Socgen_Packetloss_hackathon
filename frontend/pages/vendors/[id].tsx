import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { api } from "../../lib/api";
import { RagBadge } from "../../components/RagBadge";
import type { VendorScore } from "../../types/vendor";

export default function VendorDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [vendor, setVendor] = useState<VendorScore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof id === "string") {
      api.vendors.get(id).then(setVendor).catch((e) => setError(String(e)));
    }
  }, [id]);

  if (error) {
    return (
      <main className="p-8 text-red-600">
        {error}{" "}
        <Link href="/" className="underline text-indigo-600">
          Back
        </Link>
      </main>
    );
  }

  if (!vendor) {
    return <main className="p-8 text-gray-400">Loading…</main>;
  }

  const radarData = [
    { subject: "Data Exposure", value: vendor.score_breakdown.data_exposure },
    { subject: "Compliance Gaps", value: vendor.score_breakdown.compliance_gaps },
    { subject: "Breach History", value: vendor.score_breakdown.breach_history },
    { subject: "Financial Health", value: vendor.score_breakdown.financial_health },
    { subject: "Concentration", value: vendor.score_breakdown.concentration },
  ];

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/" className="text-indigo-600 text-sm hover:underline">
          ← Dashboard
        </Link>

        <div className="mt-4 flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{vendor.name}</h1>
          <RagBadge rag={vendor.rag} />
          <span className="text-gray-500 text-sm">{vendor.category}</span>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Risk Score" value={vendor.risk_score.toFixed(1)} />
          <StatCard label="Risk Level" value={vendor.risk_level} />
          <StatCard label="Financial Rating" value={vendor.financial_rating} />
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Score breakdown radar */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="font-semibold text-gray-700 mb-4">Score Breakdown</h2>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <Radar
                  dataKey="value"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Compliance */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="font-semibold text-gray-700 mb-4">Compliance</h2>
            <dl className="space-y-2 text-sm">
              <ComplianceRow label="SOC 2 Type II" ok={vendor.compliance.soc2_type2} />
              <ComplianceRow label="ISO 27001" ok={vendor.compliance.iso27001} />
              <ComplianceRow label="GDPR DPA" ok={vendor.compliance.gdpr_dpa} />
              <div className="flex justify-between">
                <dt className="text-gray-600">Breach Notification SLA</dt>
                <dd className="font-medium">
                  {vendor.compliance.breach_notification_sla_hours}h
                </dd>
              </div>
              {vendor.compliance.soc2_expiry && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">SOC 2 Expiry</dt>
                  <dd className="font-medium">{vendor.compliance.soc2_expiry}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Risk factors & anomaly flags */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <InfoList title="Risk Factors" items={vendor.risk_factors} accent="red" />
          <InfoList title="Anomaly Flags" items={vendor.anomaly_flags} accent="amber" />
        </div>

        {/* Recommendation */}
        <div className="mt-6 bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold text-gray-700 mb-2">Recommendation</h2>
          <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-sm font-semibold mb-2">
            {vendor.recommendation.action}
          </span>
          <p className="text-gray-600 text-sm">{vendor.recommendation.detail}</p>
        </div>

        {/* Breach history */}
        {vendor.breach_history.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow p-6">
            <h2 className="font-semibold text-gray-700 mb-4">Breach History</h2>
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left pb-2">Date</th>
                  <th className="text-left pb-2">Severity</th>
                  <th className="text-left pb-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {vendor.breach_history.map((b, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2 pr-4 font-mono text-gray-600">{b.date}</td>
                    <td className="py-2 pr-4 font-semibold text-orange-600">
                      {b.severity}
                    </td>
                    <td className="py-2 text-gray-700">{b.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 text-right">
          <Link
            href={`/chat?vendor_id=${vendor.vendor_id}`}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Ask AI about this vendor →
          </Link>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function ComplianceRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className={ok ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
        {ok ? "✓" : "✗"}
      </dd>
    </div>
  );
}

function InfoList({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: "red" | "amber";
}) {
  const color = accent === "red" ? "text-red-700" : "text-amber-700";
  const bg = accent === "red" ? "bg-red-50" : "bg-amber-50";
  return (
    <div className={`${bg} rounded-xl p-5`}>
      <h2 className="font-semibold text-gray-700 mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-gray-400 text-sm">None</p>
      ) : (
        <ul className="space-y-1">
          {items.map((f, i) => (
            <li key={i} className={`text-sm ${color} flex gap-2`}>
              <span>•</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
