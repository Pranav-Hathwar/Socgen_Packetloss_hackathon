"""Single source of mock vendor used across all stub endpoints."""
from datetime import date, datetime

from .schema import (
    AccessType,
    AlertItem,
    BreachEvent,
    Compliance,
    ConcentrationRisk,
    DataAccess,
    DataResidency,
    DataSensitivity,
    RAG,
    Recommendation,
    RiskLevel,
    ScoreBreakdown,
    VendorScore,
    VendorSummary,
)

MOCK_VENDOR = VendorScore(
    vendor_id="V001",
    name="Acme Cloud Services",
    category="Cloud Infrastructure",
    contract_start=date(2023, 1, 1),
    contract_end=date(2025, 12, 31),
    data_access=DataAccess(
        systems=["CRM", "ERP", "Data Warehouse"],
        data_sensitivity=DataSensitivity.HIGH,
        access_type=AccessType.READ_WRITE,
        access_last_used_at=datetime(2024, 6, 10, 14, 30),
    ),
    data_residency=DataResidency.EU,
    sub_processor_count=12,
    concentration_risk=ConcentrationRisk.HIGH,
    last_assessment_date=date(2024, 3, 15),
    compliance=Compliance(
        soc2_type2=True,
        soc2_expiry=date(2024, 12, 31),
        iso27001=False,
        gdpr_dpa=True,
        breach_notification_sla_hours=72,
    ),
    breach_history=[
        BreachEvent(
            date=date(2023, 8, 22),
            severity="MEDIUM",
            description="Unauthorised access to staging environment; no PII exposed.",
        )
    ],
    financial_rating="BB+",
    risk_score=72.5,
    risk_level=RiskLevel.HIGH,
    rag=RAG.RED,
    score_breakdown=ScoreBreakdown(
        data_exposure=85.0,
        compliance_gaps=60.0,
        breach_history=70.0,
        financial_health=55.0,
        concentration=90.0,
    ),
    risk_factors=[
        "High data sensitivity with read-write access",
        "No ISO 27001 certification",
        "High concentration risk — no alternative vendor identified",
        "SOC 2 expiry within 6 months",
    ],
    anomaly_flags=[
        "Sub-processor count increased 40% since last assessment",
        "Contract renewal overdue",
    ],
    recommendation=Recommendation(
        action="ESCALATE",
        detail="Schedule urgent review with CISO. Obtain updated ISO 27001 roadmap and sub-processor list within 30 days.",
    ),
    alerts=[
        "SOC 2 Type II expires in < 6 months",
        "ISO 27001 not certified",
        "Contract renewal overdue",
    ],
)

MOCK_VENDOR_2 = VendorScore(
    vendor_id="V002",
    name="SafePay Ltd",
    category="Payment Processing",
    contract_start=date(2022, 6, 1),
    contract_end=date(2026, 5, 31),
    data_access=DataAccess(
        systems=["Payment Gateway", "Finance ERP"],
        data_sensitivity=DataSensitivity.MEDIUM,
        access_type=AccessType.READ,
        access_last_used_at=datetime(2024, 6, 18, 9, 0),
    ),
    data_residency=DataResidency.EU,
    sub_processor_count=3,
    concentration_risk=ConcentrationRisk.LOW,
    last_assessment_date=date(2024, 5, 1),
    compliance=Compliance(
        soc2_type2=True,
        soc2_expiry=date(2025, 5, 1),
        iso27001=True,
        gdpr_dpa=True,
        breach_notification_sla_hours=24,
    ),
    breach_history=[],
    financial_rating="A",
    risk_score=28.0,
    risk_level=RiskLevel.LOW,
    rag=RAG.GREEN,
    score_breakdown=ScoreBreakdown(
        data_exposure=30.0,
        compliance_gaps=10.0,
        breach_history=0.0,
        financial_health=20.0,
        concentration=15.0,
    ),
    risk_factors=[],
    anomaly_flags=[],
    recommendation=Recommendation(
        action="MONITOR",
        detail="No immediate action required. Schedule routine review in 12 months.",
    ),
    alerts=[],
)

ALL_VENDORS: dict[str, VendorScore] = {
    v.vendor_id: v for v in [MOCK_VENDOR, MOCK_VENDOR_2]
}

MOCK_SUMMARIES = [
    VendorSummary(
        vendor_id=v.vendor_id,
        name=v.name,
        category=v.category,
        risk_score=v.risk_score,
        risk_level=v.risk_level,
        rag=v.rag,
        alerts=v.alerts,
    )
    for v in ALL_VENDORS.values()
]

MOCK_ALERTS = [
    AlertItem(
        vendor_id=MOCK_VENDOR.vendor_id,
        vendor_name=MOCK_VENDOR.name,
        alert=a,
        rag=MOCK_VENDOR.rag,
    )
    for a in MOCK_VENDOR.alerts
]
