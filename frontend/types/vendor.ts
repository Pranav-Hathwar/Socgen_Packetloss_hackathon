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
  contact_name?: string | null;
  contact_email?: string | null;
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
  annual_spend: number;
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

export interface VendorSuggestion {
  id: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: string;
  action: string;
  detail: string;
  score_impact: number;
  effort: "LOW" | "MEDIUM" | "HIGH";
  timeline: string;
  framework: string;
}

export interface AlertItem {
  vendor_id: string;
  vendor_name: string;
  alert: string;
  rag: RAG;
  alert_type: string;
}

export interface ContractField {
  value: string | number | boolean | string[] | null;
  evidence: string | null;
  unit?: string;
  prior_approval_required?: boolean | null;
}

export interface ContractAnalysis {
  vendor_id: string | null;
  breach_notification_sla_hours: ContractField;
  data_ownership_clause: ContractField;
  sub_processors: ContractField;
  offboarding_terms: ContractField;
  data_residency: ContractField;
  audit_rights: ContractField;
  governing_law: ContractField;
  key_risks: { risk: string; evidence: string }[];
  extraction_method: string;
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
  reason: string;
  old_risk_score: number;
  new_risk_score: number;
  old_risk_level: string;
  new_risk_level: string;
}

export interface ScoreChange {
  vendor_id: string;
  name: string;
  old_score: number;
  new_score: number;
  delta: number;
  old_level: string;
  new_level: string;
  reason: string;
}

export interface VendorCreateRequest {
  name: string;
  category: string;
  contract_start?: string;
  contract_end?: string;
  data_sensitivity: DataSensitivity;
  access_type: AccessType;
  systems?: string;
  soc2_type2: boolean;
  soc2_expiry?: string;
  iso27001: boolean;
  gdpr_dpa: boolean;
  breach_notification_sla_hours: number;
  financial_rating: string;
  annual_spend?: number;
  data_residency: DataResidency;
  concentration_risk: ConcentrationRisk;
  sub_processor_count: number;
  under_investigation: boolean;
  breach_history?: string;
  last_assessment_date?: string;
  contact_name?: string;
  contact_email?: string;
}

export interface CertDocument {
  id: number;
  vendor_id: string;
  cert_type: string;
  filename: string;
  uploaded_at: string;
  expiry_date?: string;
}

export interface ScoreHistoryPoint {
  scored_at: string;
  risk_score: number;
  risk_level: string;
  rag: string;
  trigger: string;
}

export interface RemediationRecord {
  id: number;
  vendor_id: string;
  issue: string;
  resolved_by: string;
  resolved_at: string;
  score_before: number;
  score_after: number;
  note?: string;
}

export interface RemediationRequest {
  issue: string;
  resolved_by: string;
  note?: string;
}
