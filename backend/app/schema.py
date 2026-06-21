from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DataSensitivity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class AccessType(str, Enum):
    READ = "read"
    READ_WRITE = "read_write"


class DataResidency(str, Enum):
    EU = "EU"
    NON_EU = "non-EU"


class ConcentrationRisk(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class RiskLevel(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class RAG(str, Enum):
    RED = "RED"
    AMBER = "AMBER"
    GREEN = "GREEN"


class DataAccess(BaseModel):
    systems: list[str]
    data_sensitivity: DataSensitivity
    access_type: AccessType
    access_last_used_at: datetime


class Compliance(BaseModel):
    soc2_type2: bool
    soc2_expiry: Optional[date] = None
    iso27001: bool
    gdpr_dpa: bool
    breach_notification_sla_hours: int


class BreachEvent(BaseModel):
    date: date
    severity: str
    description: str


class ScoreBreakdown(BaseModel):
    data_exposure: float = Field(ge=0, le=100)
    compliance_gaps: float = Field(ge=0, le=100)
    breach_history: float = Field(ge=0, le=100)
    financial_health: float = Field(ge=0, le=100)
    concentration: float = Field(ge=0, le=100)


class Recommendation(BaseModel):
    action: str
    detail: str


class VendorScore(BaseModel):
    # Identity
    vendor_id: str
    name: str
    category: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None

    # Contract
    contract_start: date
    contract_end: date

    # Data access
    data_access: DataAccess

    # Enrichment
    data_residency: DataResidency
    sub_processor_count: int
    concentration_risk: ConcentrationRisk
    last_assessment_date: date

    # Compliance
    compliance: Compliance

    # Breach history
    breach_history: list[BreachEvent]

    # Financial
    financial_rating: str
    annual_spend: float = 0

    # Engine output
    risk_score: float = Field(ge=0, le=100)
    risk_level: RiskLevel
    rag: RAG
    score_breakdown: ScoreBreakdown
    risk_factors: list[str]
    anomaly_flags: list[str]
    recommendation: Recommendation
    alerts: list[str]


class VendorSummary(BaseModel):
    """Lightweight list-view shape."""
    vendor_id: str
    name: str
    category: str
    risk_score: float
    risk_level: RiskLevel
    rag: RAG
    alerts: list[str]


class AlertItem(BaseModel):
    vendor_id: str
    vendor_name: str
    alert: str
    rag: RAG
    alert_type: str = "GENERAL"


class IngestResponse(BaseModel):
    status: str
    rows_processed: int
    message: str


class AskRequest(BaseModel):
    question: str
    vendor_id: Optional[str] = None


class AskResponse(BaseModel):
    answer: str
    sources: list[str]


class VendorCreateRequest(BaseModel):
    name: str
    category: str = "Other"
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    data_sensitivity: str = "LOW"
    access_type: str = "read"
    systems: Optional[str] = None
    soc2_type2: bool = False
    soc2_expiry: Optional[str] = None
    iso27001: bool = False
    gdpr_dpa: bool = False
    breach_notification_sla_hours: int = 72
    financial_rating: str = "BBB"
    annual_spend: float = 0
    data_residency: str = "EU"
    concentration_risk: str = "LOW"
    sub_processor_count: int = 0
    under_investigation: bool = False
    breach_history: Optional[str] = ""
    last_assessment_date: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None


class VendorUpdateRequest(BaseModel):
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    category: Optional[str] = None
    contract_end: Optional[str] = None
    data_sensitivity: Optional[str] = None
    access_type: Optional[str] = None
    soc2_type2: Optional[bool] = None
    soc2_expiry: Optional[str] = None
    iso27001: Optional[bool] = None
    gdpr_dpa: Optional[bool] = None
    financial_rating: Optional[str] = None
    annual_spend: Optional[float] = None
    concentration_risk: Optional[str] = None
    under_investigation: Optional[bool] = None
    breach_notification_sla_hours: Optional[int] = None


class RemediationRequest(BaseModel):
    issue: str
    resolved_by: str
    note: Optional[str] = ""


class RemediationRecord(BaseModel):
    id: int
    vendor_id: str
    issue: str
    resolved_by: str
    resolved_at: str
    score_before: float
    score_after: float
    note: Optional[str] = ""


class ScoreHistoryPoint(BaseModel):
    scored_at: str
    risk_score: float
    risk_level: str
    rag: str
    trigger: str


class AssessmentParseRequest(BaseModel):
    text: str
    vendor_id: Optional[str] = None


class EmailNotifyRequest(BaseModel):
    to_email: str
    vendor_id: Optional[str] = None
    notify_type: str = "summary"
