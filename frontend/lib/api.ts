import type {
  AlertItem,
  AskRequest,
  AskResponse,
  ReportSummary,
  SandboxResponse,
  SimulateRequest,
  SimulateResponse,
  VendorScore,
  VendorSummary,
  ScoreHistoryPoint,
  RemediationRecord,
  RemediationRequest,
  GlobalIncident,
  IncidentCreate,
  ContractAnalysisResult,
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
  return res.json() as Promise<T>;
}

async function postFile<T>(path: string, file: File, vendorId?: string): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  if (vendorId) formData.append("vendor_id", vendorId);

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...authHeader() },
    body: formData,
  });
  if (res.status === 401) { handle401(); throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error(`POST ${path} (File) → ${res.status}`);
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

export const api = {
  vendors: {
    list: () => get<VendorSummary[]>("/vendors"),
    get: (id: string) => get<VendorScore>(`/vendors/${id}`),
    history: (id: string) => get<ScoreHistoryPoint[]>(`/vendors/${id}/history`),
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
  incidents: {
    report: (body: IncidentCreate) => post<{ status: string; incident_id: number; impacted_vendors: number; impacted_vendor_names: string[] }>("/incidents/report", body),
    list: () => get<GlobalIncident[]>("/incidents/active"),
    resolve: (id: number) => post<{ status: string }>("/incidents/resolve", { id }),
    systems: () => get<string[]>("/incidents/systems"),
  },
  contracts: {
    analyze: (file: File, vendor_id?: string) => postFile<ContractAnalysisResult>("/contracts/analyze", file, vendor_id),
  }
};
