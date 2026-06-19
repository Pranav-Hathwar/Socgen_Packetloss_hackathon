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
  access_last_used_at: string; // ISO datetime
}

export interface Compliance {
  soc2_type2: boolean;
  soc2_expiry: string | null; // ISO date
  iso27001: boolean;
  gdpr_dpa: boolean;
  breach_notification_sla_hours: number;
}

export interface BreachEvent {
  date: string; // ISO date
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
  // Identity
  vendor_id: string;
  name: string;
  category: string;

  // Contract
  contract_start: string; // ISO date
  contract_end: string;   // ISO date

  // Data access
  data_access: DataAccess;

  // Enrichment
  data_residency: DataResidency;
  sub_processor_count: number;
  concentration_risk: ConcentrationRisk;
  last_assessment_date: string; // ISO date

  // Compliance
  compliance: Compliance;

  // Breach history
  breach_history: BreachEvent[];

  // Financial
  financial_rating: string;

  // Engine output
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
  average_risk_score: number;
  top_risks: { vendor_id: string; name: string; risk_score: number }[];
}
