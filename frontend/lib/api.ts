import type {
  AlertItem,
  AskRequest,
  AskResponse,
  ReportSummary,
  VendorScore,
  VendorSummary,
} from "../types/vendor";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
};
