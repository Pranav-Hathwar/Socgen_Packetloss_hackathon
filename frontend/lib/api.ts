import type {
  AlertItem,
  AskRequest,
  AskResponse,
  CertDocument,
  ReportSummary,
  SandboxResponse,
  SimulateRequest,
  SimulateResponse,
  VendorCreateRequest,
  VendorScore,
  VendorSummary,
  ScoreHistoryPoint,
  RemediationRecord,
  RemediationRequest,
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

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { handle401(); throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
  if (res.status === 401) { handle401(); throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  vendors: {
    list: () => get<VendorSummary[]>("/vendors"),
    get: (id: string) => get<VendorScore>(`/vendors/${id}`),
    create: (body: VendorCreateRequest) => post<VendorScore>("/vendors", body),
    history: (id: string) => get<ScoreHistoryPoint[]>(`/vendors/${id}/history`),
    certs: (id: string) => get<CertDocument[]>(`/vendors/${id}/certs`),
    uploadCert: (id: string, file: File, certType: string, expiryDate: string) => {
      const form = new FormData();
      form.append("file", file);
      return postForm<{ status: string; id: number; filename: string }>(`/vendors/${id}/certs?cert_type=${certType}&expiry_date=${expiryDate}`, form);
    },
    remediations: (id: string) => get<RemediationRecord[]>(`/vendors/${id}/remediations`),
    remediate: (id: string, body: RemediationRequest) => post<RemediationRecord>(`/vendors/${id}/remediate`, body),
    update: (id: string, body: Record<string, unknown>) => patch<{ status: string; new_risk_score: number; new_risk_level: string }>(`/vendors/${id}`, body),
  },
  alerts: {
    list: () => get<AlertItem[]>("/alerts"),
  },
  report: {
    get: () => get<ReportSummary>("/report"),
  },
  ask: (body: AskRequest) => post<AskResponse>("/ask", body),
  simulate: (body: SimulateRequest) => post<SimulateResponse>("/simulate", body),
  sandbox: {
    injectBreach: () => post<SandboxResponse>("/sandbox/inject-breach", {}),
    advanceTime: () => post<SandboxResponse>("/sandbox/advance-time", {}),
  },
  monitor: {
    injectBreach: (body: object) => post("/monitor/inject-breach", body),
    advanceTime: (days: number) => post("/monitor/advance-time", { days }),
    whatif: (body: object) => post("/whatif", body),
  },
};
