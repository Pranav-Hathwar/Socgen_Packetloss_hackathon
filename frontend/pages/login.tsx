import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

const DEMO_ACCOUNTS = [
  { label: "Admin — full access",    email: "admin@vendorlens.com",   password: "Admin@Demo1",   role: "ADMIN" },
  { label: "Analyst — view + sim",   email: "analyst@vendorlens.com", password: "Analyst@Demo1", role: "ANALYST" },
  { label: "Auditor — read-only",    email: "auditor@vendorlens.com", password: "Auditor@Demo1", role: "AUDITOR" },
];

const ROLE_COLORS: Record<string, string> = {
  ADMIN:   "bg-red-100 text-red-700",
  ANALYST: "bg-blue-100 text-blue-700",
  AUDITOR: "bg-gray-100 text-gray-700",
};

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      await router.replace("/");
    } catch (err) {
      setError(String(err).replace("Error: ", ""));
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(acct: typeof DEMO_ACCOUNTS[number]) {
    setEmail(acct.email);
    setPassword(acct.password);
    setError(null);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">VendorLens</h1>
          <p className="text-gray-500 text-sm">Third-Party Risk Management — Société Générale</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Sign in</h2>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-liquid btn-liquid w-full bg-teal-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Demo switcher */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
              Demo accounts — click to pre-fill
            </p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((acct) => (
                <button
                  key={acct.role}
                  onClick={() => fillDemo(acct)}
                  className="btn-liquid w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 hover:border-teal/40 hover:bg-teal-50 transition-colors text-left"
                >
                  <span className="text-sm text-gray-700">{acct.label}</span>
                  <span className={`btn-liquid text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[acct.role]}`}>
                    {acct.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
