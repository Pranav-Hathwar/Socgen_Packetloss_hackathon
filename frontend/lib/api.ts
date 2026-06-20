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
  VendorSuggestion,
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
  auth: {
    register: (body: { email: string; password: string; role: string }) =>
      post<{ id: number; email: string; role: string }>("/auth/register", body),
  },
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
    downloadCert: async (vendorId: string, certId: number, filename: string): Promise<void> => {
      const res = await fetch(`${BASE}/vendors/${vendorId}/certs/${certId}/download`, {
        headers: authHeader(),
      });
      if (res.status === 401) { handle401(); throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    remediations: (id: string) => get<RemediationRecord[]>(`/vendors/${id}/remediations`),
    remediate: (id: string, body: RemediationRequest) => post<RemediationRecord>(`/vendors/${id}/remediate`, body),
    update: (id: string, body: Record<string, unknown>) => patch<{ status: string; new_risk_score: number; new_risk_level: string }>(`/vendors/${id}`, body),
    suggestions: (id: string) => get<{ vendor_id: string; suggestions: VendorSuggestion[] }>(`/vendors/${id}/suggestions`),
    narrative: (id: string) => get<{ vendor_id: string; narrative: string | null; source: string }>(`/vendors/${id}/narrative`),
  },
  alerts: {
    list: () => get<AlertItem[]>("/alerts"),
  },
  report: {
    get: () => get<ReportSummary>("/report"),
  },
  scheduler: {
    status: () => get<{ running: boolean; interval_seconds: number; next_run: string | null; last_run: string | null }>("/scheduler/status"),
    start: () => post<{ status: string }>("/scheduler/start", {}),
    stop: () => post<{ status: string }>("/scheduler/stop", {}),
    runNow: () => post<{ status: string; vendors_rescored: number }>("/scheduler/run-now", {}),
  },
  notify: {
    summary: (to_email: string) => post<{ status: string; message: string }>("/notify/summary", { to_email, notify_type: "summary" }),
    expiry: (to_email: string) => post<{ status: string; message: string }>("/notify/expiry-alerts", { to_email, notify_type: "expiry" }),
  },
  ingest: {
    upload: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return postForm<{ status: string; rows_processed: number; message: string }>("/ingest", form);
    },
    email: (text: string) =>
      post<{ status: string; rows_processed: number; message: string }>("/ingest/email", { text }),
    json: (vendors: object[]) =>
      post<{ status: string; rows_processed: number; message: string }>("/ingest/json", { vendors }),
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
