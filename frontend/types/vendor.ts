export type DataSensitivity = "LOW" | "MEDIUM" | "HIGH";
export type AccessType = "read" | "read_write";
export type DataResidency = "EU" | "non-EU";
export type ConcentrationRisk = "LOW" | "MEDIUM" | "HIGH";
export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RAG = "RED" | "AMBER" | "GREEN";

export interface DataAccess {
  systems: string[];
  data_sensitivity: DataSensitivity;
  access_type: AccessType;
  access_last_used_at: string;
}

export interface Compliance {
  soc2_type2: boolean;
  soc2_expiry: string | null;
  iso27001: boolean;
  gdpr_dpa: boolean;
  breach_notification_sla_hours: number;
}

export interface BreachEvent {
  date: string;
  severity: string;
  description: string;
}

export interface ScoreBreakdown {
  data_exposure: number;
  compliance_gaps: number;
  breach_history: number;
  financial_health: number;
  concentration: number;
}

export interface Recommendation {
  action: string;
  detail: string;
}

export interface VendorScore {
  vendor_id: string;
  name: string;
  category: string;
  contract_start: string;
  contract_end: string;
  data_access: DataAccess;
  data_residency: DataResidency;
  sub_processor_count: number;
  concentration_risk: ConcentrationRisk;
  last_assessment_date: string;
  compliance: Compliance;
  breach_history: BreachEvent[];
  financial_rating: string;
  risk_score: number;
  risk_level: RiskLevel;
  rag: RAG;
  score_breakdown: ScoreBreakdown;
  risk_factors: string[];
  anomaly_flags: string[];
  recommendation: Recommendation;
  alerts: string[];
}

export interface VendorSummary {
  vendor_id: string;
  name: string;
  category: string;
  risk_score: number;
  risk_level: RiskLevel;
  rag: RAG;
  alerts: string[];
}

export interface AlertItem {
  vendor_id: string;
  vendor_name: string;
  alert: string;
  rag: RAG;
}

export interface IngestResponse {
  status: string;
  rows_processed: number;
  message: string;
}

export interface AskRequest {
  question: string;
  vendor_id?: string;
}

export interface AskResponse {
  answer: string;
  sources: string[];
}

export interface ReportSummary {
  generated_at: string;
  total_vendors: number;
  rag_summary: { RED: number; AMBER: number; GREEN: number };
  risk_level_summary: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  average_risk_score: number;
  compliance_coverage?: {
    soc2_type2: { count: number; total: number; percentage: number };
    iso27001: { count: number; total: number; percentage: number };
    gdpr_dpa: { count: number; total: number; percentage: number };
  };
  category_breakdown?: {
    category: string;
    count: number;
    avg_score: number;
    red: number;
    amber: number;
    green: number;
  }[];
  score_trend?: { date: string; avg_score: number; red_count: number }[];
  top_risks: { vendor_id: string; name: string; risk_score: number }[];
  red_flag_vendors?: {
    vendor_id: string;
    name: string;
    category: string;
    risk_score: number;
    risk_level: string;
    rag: string;
    required_actions: string;
    action_type: string;
    risk_factors: string[];
  }[];
}

export interface SimulateRequest {
  vendor_id: string;
  renew_soc2: boolean;
  sign_dpa: boolean;
  revoke_access: boolean;
}

export interface SimulateResponse {
  vendor_id: string;
  original_score: number;
  simulated_score: number;
  delta: number;
  original_breakdown: ScoreBreakdown;
  simulated_breakdown: ScoreBreakdown;
  simulated_risk_level: RiskLevel;
  simulated_rag: RAG;
  actions_applied: string[];
}

export interface SandboxResponse {
  action: string;
  vendor_id: string;
  vendor_name: string;
  detail: string;
  new_risk_score: number;
}
