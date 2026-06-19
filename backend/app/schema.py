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
