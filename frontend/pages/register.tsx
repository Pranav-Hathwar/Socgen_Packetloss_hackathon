import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { UserPlusIcon } from "@heroicons/react/24/outline";

const ROLES = ["ANALYST", "AUDITOR"] as const;
const ROLE_DESC: Record<string, string> = {
  ANALYST: "Can view, simulate, and log remediations",
  AUDITOR: "Read-only access to all data",
};

export default function RegisterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ANALYST");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading || !user) return null;
  if (user.role !== "ADMIN") return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const created = await api.auth.register({ email, password, role });
      setSuccess(`Created ${created.email} as ${created.role}`);
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(String(err).replace("Error: POST /auth/register → 400", "Email already registered or invalid input"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-lg mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create User</h1>
        <p className="text-sm text-slate-500 mt-1">Admin only — add new analyst or auditor accounts</p>
      </div>

      <div className="card p-6">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-medium">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              required
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars, uppercase + number"
              required
              minLength={8}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
            <div className="space-y-2">
              {ROLES.map((r) => (
                <label
                  key={r}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    role === r ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r}</p>
                    <p className="text-xs text-slate-500">{ROLE_DESC[r]}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <UserPlusIcon className="w-4 h-4" />
            {submitting ? "Creating…" : "Create User"}
          </button>
        </form>
      </div>
    </div>
  );
}
