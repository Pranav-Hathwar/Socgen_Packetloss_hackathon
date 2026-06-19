import type {
  AlertItem,
  AskRequest,
  AskResponse,
  ReportSummary,
  VendorScore,
  VendorSummary,
} from "../types/vendor";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Module-level token — set by AuthContext after login / logout
let _token: string | null = null;
export function setToken(t: string | null) {
  _token = t;
}

function authHeader(): Record<string, string> {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

function handle401() {
  // Clear token and redirect to login
  _token = null;
  sessionStorage.removeItem("vl_token");
  sessionStorage.removeItem("vl_user");
  if (typeof window !== "undefined") window.location.href = "/login";
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeader() });
  if (res.status === 401) { handle401(); throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { handle401(); throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  vendors: {
    list: () => get<VendorSummary[]>("/vendors"),
    get: (id: string) => get<VendorScore>(`/vendors/${id}`),
  },
  alerts: {
    list: () => get<AlertItem[]>("/alerts"),
  },
  report: {
    get: () => get<ReportSummary>("/report"),
  },
  ask: (body: AskRequest) => post<AskResponse>("/ask", body),
  monitor: {
    injectBreach: (body: object) => post("/monitor/inject-breach", body),
    advanceTime: (days: number) => post("/monitor/advance-time", { days }),
    whatif: (body: object) => post("/whatif", body),
  },
};
