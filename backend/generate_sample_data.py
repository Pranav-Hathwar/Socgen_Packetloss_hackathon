"""
Generates sample_data/vendor_registry.csv and sample_data/vendor_labels.csv.
Run once: python backend/generate_sample_data.py
"""
import csv, os, random
from datetime import date, datetime, timedelta

random.seed(42)
OUT = os.path.join(os.path.dirname(__file__), "..", "sample_data")
os.makedirs(OUT, exist_ok=True)

TODAY = date(2024, 6, 19)

CATEGORIES = [
    "Cloud Infrastructure", "Payment Processing", "HR Software",
    "Data Analytics", "Security", "Legal & Compliance", "Marketing Tech",
    "ERP", "Communication", "Storage & Backup",
]
SYSTEMS_POOL = [
    "CRM", "ERP", "Data Warehouse", "Finance ERP", "HR System",
    "Payment Gateway", "Analytics Platform", "Email", "Document Store",
    "Identity Provider", "Audit Logs", "Customer DB",
]
FINANCIAL_RATINGS = ["AAA", "AA", "A", "BBB", "BB", "BB+", "B", "CCC"]

def rand_date(start_year=2020, end_year=2024):
    start = date(start_year, 1, 1)
    end = date(end_year, 12, 31)
    return start + timedelta(days=random.randint(0, (end - start).days))

def fmt(d): return d.isoformat() if d else ""

# ── vendor definitions ─────────────────────────────────────────────────────
vendors = [
    # Normal GREEN vendors
    {"vendor_id":"V001","name":"SafePay Ltd","category":"Payment Processing","sensitivity":"MEDIUM","systems":"Payment Gateway,Finance ERP","access_type":"read","soc2":True,"soc2_exp":"2025-05-01","iso":True,"gdpr":True,"sla":24,"fin":"A","breaches":"","contract_end_offset":730},
    {"vendor_id":"V002","name":"HRCloud Pro","category":"HR Software","sensitivity":"LOW","systems":"HR System","access_type":"read","soc2":True,"soc2_exp":"2025-08-01","iso":True,"gdpr":True,"sla":48,"fin":"AA","breaches":"","contract_end_offset":540},
    {"vendor_id":"V003","name":"LegalDocs Inc","category":"Legal & Compliance","sensitivity":"MEDIUM","systems":"Document Store","access_type":"read","soc2":True,"soc2_exp":"2025-03-01","iso":True,"gdpr":True,"sla":48,"fin":"BBB","breaches":"","contract_end_offset":400},
    {"vendor_id":"V004","name":"MarketHub","category":"Marketing Tech","sensitivity":"LOW","systems":"CRM,Email","access_type":"read_write","soc2":True,"soc2_exp":"2025-06-01","iso":False,"gdpr":True,"sla":72,"fin":"BB","breaches":"","contract_end_offset":365},
    {"vendor_id":"V005","name":"SecureVault","category":"Security","sensitivity":"HIGH","systems":"Identity Provider,Audit Logs","access_type":"read","soc2":True,"soc2_exp":"2025-09-01","iso":True,"gdpr":True,"sla":24,"fin":"A","breaches":"","contract_end_offset":600},

    # AMBER vendors
    {"vendor_id":"V006","name":"DataStream Analytics","category":"Data Analytics","sensitivity":"HIGH","systems":"Data Warehouse,Analytics Platform,Customer DB","access_type":"read_write","soc2":True,"soc2_exp":"2025-01-15","iso":False,"gdpr":True,"sla":72,"fin":"BB","breaches":"","contract_end_offset":200},
    {"vendor_id":"V007","name":"TechBridge ERP","category":"ERP","sensitivity":"MEDIUM","systems":"ERP,Finance ERP","access_type":"read_write","soc2":False,"soc2_exp":"","iso":False,"gdpr":True,"sla":96,"fin":"BB+","breaches":"","contract_end_offset":180},
    {"vendor_id":"V008","name":"CloudStore Co","category":"Storage & Backup","sensitivity":"HIGH","systems":"Document Store,Data Warehouse","access_type":"read_write","soc2":True,"soc2_exp":"2024-09-01","iso":False,"gdpr":False,"sla":72,"fin":"BBB","breaches":"","contract_end_offset":300},
    {"vendor_id":"V009","name":"CommConnect","category":"Communication","sensitivity":"MEDIUM","systems":"Email,CRM","access_type":"read_write","soc2":True,"soc2_exp":"2024-10-15","iso":False,"gdpr":True,"sla":48,"fin":"B","breaches":"","contract_end_offset":250},

    # HIGH risk
    {"vendor_id":"V010","name":"Acme Cloud Services","category":"Cloud Infrastructure","sensitivity":"HIGH","systems":"CRM,ERP,Data Warehouse","access_type":"read_write","soc2":True,"soc2_exp":"2024-12-31","iso":False,"gdpr":True,"sla":72,"fin":"BB+","breaches":"2023-08-22|MEDIUM|Unauthorised access to staging; no PII","contract_end_offset":180},
    {"vendor_id":"V011","name":"FinCore Systems","category":"Payment Processing","sensitivity":"HIGH","systems":"Payment Gateway,Finance ERP,Customer DB","access_type":"read_write","soc2":True,"soc2_exp":"2024-08-01","iso":False,"gdpr":True,"sla":48,"fin":"B","breaches":"2023-11-05|HIGH|SQL injection; 5000 records exposed","contract_end_offset":90},
    {"vendor_id":"V012","name":"MegaAnalytics","category":"Data Analytics","sensitivity":"HIGH","systems":"Data Warehouse,Customer DB,Analytics Platform","access_type":"read_write","soc2":False,"soc2_exp":"","iso":False,"gdpr":False,"sla":120,"fin":"BB","breaches":"","contract_end_offset":150},

    # CRITICAL: under_investigation
    {"vendor_id":"V013","name":"NovaByte Corp","category":"Cloud Infrastructure","sensitivity":"HIGH","systems":"CRM,ERP,Data Warehouse,Customer DB","access_type":"read_write","soc2":False,"soc2_exp":"","iso":False,"gdpr":False,"sla":168,"fin":"CCC","breaches":"2024-01-10|CRITICAL|Ransomware attack; potential exfiltration of PII","contract_end_offset":60, "under_investigation":True},

    # CRITICAL: recent breach + PII/financial access
    {"vendor_id":"V014","name":"PaySafe Global","category":"Payment Processing","sensitivity":"HIGH","systems":"Payment Gateway,Finance ERP,Customer DB","access_type":"read_write","soc2":True,"soc2_exp":"2024-11-01","iso":False,"gdpr":True,"sla":48,"fin":"B","breaches":"2024-04-15|CRITICAL|Credential stuffing; 50k payment records accessed","contract_end_offset":200},

    # CRITICAL: orphaned access (contract ended, access still used)
    {"vendor_id":"V015","name":"OldSystem Ltd","category":"ERP","sensitivity":"HIGH","systems":"ERP,Finance ERP,Customer DB","access_type":"read_write","soc2":False,"soc2_exp":"","iso":False,"gdpr":False,"sla":168,"fin":"CCC","breaches":"","contract_end_offset":-180, "access_last_used_offset":-30},

    # HIGH: expired cert + sensitive data
    {"vendor_id":"V016","name":"ExpiredCert Solutions","category":"Cloud Infrastructure","sensitivity":"HIGH","systems":"Data Warehouse,Customer DB","access_type":"read_write","soc2":True,"soc2_exp":"2023-12-31","iso":False,"gdpr":True,"sla":72,"fin":"BBB","breaches":"","contract_end_offset":300},

    # HIGH: concentration risk (only vendor for a critical service)
    {"vendor_id":"V017","name":"MonoCloud Inc","category":"Cloud Infrastructure","sensitivity":"HIGH","systems":"CRM,ERP,Data Warehouse,Customer DB,Identity Provider","access_type":"read_write","soc2":True,"soc2_exp":"2025-03-01","iso":True,"gdpr":True,"sla":24,"fin":"A","breaches":"","contract_end_offset":400,"concentration":"HIGH"},

    # More anomalies
    {"vendor_id":"V018","name":"SlowComply Corp","category":"Legal & Compliance","sensitivity":"MEDIUM","systems":"Document Store,Audit Logs","access_type":"read","soc2":False,"soc2_exp":"","iso":False,"gdpr":False,"sla":120,"fin":"B","breaches":"","contract_end_offset":100},
    {"vendor_id":"V019","name":"DataBreach Analytics","category":"Data Analytics","sensitivity":"HIGH","systems":"Data Warehouse,Customer DB","access_type":"read_write","soc2":False,"soc2_exp":"","iso":False,"gdpr":False,"sla":168,"fin":"CCC","breaches":"2024-02-20|HIGH|Insider threat; employee copied 20k records|2023-06-01|MEDIUM|Misconfigured S3 bucket; records exposed","contract_end_offset":120},
    {"vendor_id":"V020","name":"GDPRFail Ltd","category":"Marketing Tech","sensitivity":"HIGH","systems":"CRM,Customer DB","access_type":"read_write","soc2":True,"soc2_exp":"2025-01-01","iso":False,"gdpr":False,"sla":168,"fin":"BB","breaches":"","contract_end_offset":240},

    # Contract expiring soon
    {"vendor_id":"V021","name":"ExpiringSoon Services","category":"Storage & Backup","sensitivity":"MEDIUM","systems":"Document Store,Data Warehouse","access_type":"read","soc2":True,"soc2_exp":"2025-02-01","iso":False,"gdpr":True,"sla":72,"fin":"BBB","breaches":"","contract_end_offset":25},

    # SOC2 expiring within 90 days
    {"vendor_id":"V022","name":"CertWarn Systems","category":"Security","sensitivity":"HIGH","systems":"Identity Provider","access_type":"read_write","soc2":True,"soc2_exp":"2024-08-15","iso":True,"gdpr":True,"sla":24,"fin":"A","breaches":"","contract_end_offset":500},

    # Non-EU residency + PII
    {"vendor_id":"V023","name":"OffshoreData Co","category":"Data Analytics","sensitivity":"HIGH","systems":"Customer DB,Analytics Platform","access_type":"read_write","soc2":True,"soc2_exp":"2025-04-01","iso":False,"gdpr":False,"sla":96,"fin":"BB","breaches":"","contract_end_offset":300,"residency":"non-EU"},

    # High sub-processor count
    {"vendor_id":"V024","name":"SubChain Systems","category":"Cloud Infrastructure","sensitivity":"HIGH","systems":"CRM,ERP,Data Warehouse","access_type":"read_write","soc2":True,"soc2_exp":"2025-06-01","iso":True,"gdpr":True,"sla":48,"fin":"BBB","breaches":"","contract_end_offset":350,"sub_processors":25},

    # Good vendor — recent assessment, all certs
    {"vendor_id":"V025","name":"TrustCore Ltd","category":"Security","sensitivity":"HIGH","systems":"Identity Provider,Audit Logs","access_type":"read","soc2":True,"soc2_exp":"2025-10-01","iso":True,"gdpr":True,"sla":24,"fin":"AAA","breaches":"","contract_end_offset":730},

    # CRITICAL: breached + no GDPR DPA + non-EU residency
    {"vendor_id":"V026","name":"RiskyHost GmbH","category":"Cloud Infrastructure","sensitivity":"HIGH","systems":"CRM,Customer DB,Data Warehouse","access_type":"read_write","soc2":False,"soc2_exp":"","iso":False,"gdpr":False,"sla":168,"fin":"CCC","breaches":"2024-03-10|CRITICAL|Full database dump exfiltrated via unpatched API","contract_end_offset":200,"residency":"non-EU","under_investigation":True},

    # Stale assessment (over 12 months ago)
    {"vendor_id":"V027","name":"OldAssess Corp","category":"HR Software","sensitivity":"MEDIUM","systems":"HR System","access_type":"read","soc2":True,"soc2_exp":"2025-01-01","iso":False,"gdpr":True,"sla":72,"fin":"BBB","breaches":"","contract_end_offset":300},

    # Good LOW risk
    {"vendor_id":"V028","name":"MiniTool Ltd","category":"Marketing Tech","sensitivity":"LOW","systems":"Email","access_type":"read","soc2":True,"soc2_exp":"2025-07-01","iso":False,"gdpr":True,"sla":72,"fin":"A","breaches":"","contract_end_offset":600},
    {"vendor_id":"V029","name":"BasicSaaS Co","category":"Communication","sensitivity":"LOW","systems":"Email,CRM","access_type":"read","soc2":True,"soc2_exp":"2025-09-01","iso":False,"gdpr":True,"sla":48,"fin":"BBB","breaches":"","contract_end_offset":450},
    {"vendor_id":"V030","name":"CloudBackup Inc","category":"Storage & Backup","sensitivity":"MEDIUM","systems":"Document Store","access_type":"read","soc2":True,"soc2_exp":"2024-12-01","iso":True,"gdpr":True,"sla":48,"fin":"A","breaches":"","contract_end_offset":500},
]

# ── ground-truth labels ────────────────────────────────────────────────────
LABELS = {
    # Normal / no anomaly
    "V001":{"is_anomaly":False,"anomaly_type":"","severity":"","explanation":"Fully compliant, low-risk payment processor."},
    "V002":{"is_anomaly":False,"anomaly_type":"","severity":"","explanation":"Low sensitivity HR tool, all certs valid."},
    "V003":{"is_anomaly":False,"anomaly_type":"","severity":"","explanation":"Legal docs vendor, compliant."},
    "V004":{"is_anomaly":False,"anomaly_type":"","severity":"","explanation":"Marketing, ISO not required for this category."},
    "V005":{"is_anomaly":False,"anomaly_type":"","severity":"","explanation":"Security vendor, fully certified."},
    "V025":{"is_anomaly":False,"anomaly_type":"","severity":"","explanation":"Exemplary compliance posture."},
    "V028":{"is_anomaly":False,"anomaly_type":"","severity":"","explanation":"Low-sensitivity, limited access."},
    "V029":{"is_anomaly":False,"anomaly_type":"","severity":"","explanation":"Low-sensitivity comms tool."},
    "V030":{"is_anomaly":False,"anomaly_type":"","severity":"","explanation":"Compliant backup vendor."},

    # Anomalies
    "V006":{"is_anomaly":True,"anomaly_type":"cert_expiring_soon","severity":"MEDIUM","explanation":"SOC2 expires in <30 days; handles HIGH sensitivity data."},
    "V007":{"is_anomaly":True,"anomaly_type":"missing_compliance","severity":"HIGH","explanation":"No SOC2 or ISO27001; read-write access to ERP and Finance ERP."},
    "V008":{"is_anomaly":True,"anomaly_type":"missing_gdpr_dpa","severity":"HIGH","explanation":"No GDPR DPA; stores HIGH sensitivity data outside EU."},
    "V009":{"is_anomaly":True,"anomaly_type":"cert_expiring_soon","severity":"MEDIUM","explanation":"SOC2 expiring in <90 days; financial instability (B rating)."},
    "V010":{"is_anomaly":True,"anomaly_type":"recent_breach","severity":"HIGH","explanation":"Breach in last 12 months; SOC2 expiring end of year."},
    "V011":{"is_anomaly":True,"anomaly_type":"recent_breach","severity":"HIGH","explanation":"HIGH severity breach (SQL injection) in last 12 months; exposed customer records."},
    "V012":{"is_anomaly":True,"anomaly_type":"missing_compliance","severity":"HIGH","explanation":"No SOC2, no ISO, no GDPR DPA; handles HIGH sensitivity analytical data."},
    "V013":{"is_anomaly":True,"anomaly_type":"under_investigation","severity":"CRITICAL","explanation":"Under investigation for ransomware; potential PII exfiltration."},
    "V014":{"is_anomaly":True,"anomaly_type":"recent_breach_pii","severity":"CRITICAL","explanation":"CRITICAL breach in last 12 months; 50k payment records; still has full read-write access."},
    "V015":{"is_anomaly":True,"anomaly_type":"orphaned_access","severity":"CRITICAL","explanation":"Contract expired 6 months ago; system access used 30 days ago. Access must be revoked immediately."},
    "V016":{"is_anomaly":True,"anomaly_type":"expired_cert","severity":"HIGH","explanation":"SOC2 Type II expired Dec 2023; still has HIGH sensitivity read-write access."},
    "V017":{"is_anomaly":True,"anomaly_type":"concentration_risk","severity":"HIGH","explanation":"Single-vendor dependency for 5 critical systems; no documented alternative."},
    "V018":{"is_anomaly":True,"anomaly_type":"missing_compliance","severity":"MEDIUM","explanation":"No SOC2, no ISO, no GDPR DPA for a legal & compliance tool."},
    "V019":{"is_anomaly":True,"anomaly_type":"repeat_breach","severity":"CRITICAL","explanation":"Two breaches including insider threat; HIGH sensitivity; no certs; CCC financial rating."},
    "V020":{"is_anomaly":True,"anomaly_type":"missing_gdpr_dpa","severity":"HIGH","explanation":"No GDPR DPA; processes customer PII for marketing; HIGH sensitivity."},
    "V021":{"is_anomaly":True,"anomaly_type":"contract_expiring","severity":"MEDIUM","explanation":"Contract expires in <30 days; no renewal in sight."},
    "V022":{"is_anomaly":True,"anomaly_type":"cert_expiring_soon","severity":"HIGH","explanation":"SOC2 expires in <60 days; HIGH sensitivity identity access."},
    "V023":{"is_anomaly":True,"anomaly_type":"non_eu_residency_pii","severity":"HIGH","explanation":"Non-EU data residency; handles PII; no GDPR DPA."},
    "V024":{"is_anomaly":True,"anomaly_type":"high_sub_processor_count","severity":"MEDIUM","explanation":"25 sub-processors; supply chain risk not fully assessed."},
    "V026":{"is_anomaly":True,"anomaly_type":"under_investigation","severity":"CRITICAL","explanation":"Under investigation; full DB dump exfiltrated; non-EU; no certs."},
    "V027":{"is_anomaly":True,"anomaly_type":"stale_assessment","severity":"MEDIUM","explanation":"Last risk assessment >12 months ago; cert landscape may have changed."},
}

def build_vendor_row(v):
    contract_start = TODAY - timedelta(days=365)
    contract_end_offset = v.get("contract_end_offset", 365)
    contract_end = TODAY + timedelta(days=contract_end_offset)

    # access_last_used
    if "access_last_used_offset" in v:
        access_last_used = TODAY + timedelta(days=v["access_last_used_offset"])
    elif contract_end < TODAY:
        # orphaned — used recently despite expired contract
        access_last_used = TODAY - timedelta(days=abs(v.get("access_last_used_offset", 30)))
    else:
        access_last_used = TODAY - timedelta(days=random.randint(1, 30))

    # last_assessment_date
    vid = v["vendor_id"]
    if vid == "V027":
        last_assessment = TODAY - timedelta(days=400)
    else:
        last_assessment = TODAY - timedelta(days=random.randint(30, 180))

    # residency
    residency = v.get("residency", "EU")

    # sub_processor_count
    sub_proc = v.get("sub_processors", random.randint(0, 10))

    # concentration_risk
    conc = v.get("concentration", "")
    if not conc:
        sys_count = len(v["systems"].split(","))
        conc = "HIGH" if sys_count >= 4 else ("MEDIUM" if sys_count >= 2 else "LOW")

    # financial_rating numeric → grade
    fin = v["fin"]

    return {
        "vendor_id": v["vendor_id"],
        "name": v["name"],
        "category": v["category"],
        "contract_start": contract_start.isoformat(),
        "contract_end": contract_end.isoformat(),
        "systems": v["systems"],
        "data_sensitivity": v["sensitivity"],
        "access_type": v["access_type"],
        "access_last_used_at": datetime.combine(access_last_used, datetime.min.time()).isoformat(),
        "soc2_type2": str(v["soc2"]).lower(),
        "soc2_expiry": v["soc2_exp"],
        "iso27001": str(v.get("iso", False)).lower(),
        "gdpr_dpa": str(v["gdpr"]).lower(),
        "breach_notification_sla_hours": v["sla"],
        "breach_history": v["breaches"],
        "financial_rating": fin,
        "data_residency": residency,
        "sub_processor_count": sub_proc,
        "concentration_risk": conc,
        "last_assessment_date": last_assessment.isoformat(),
        "under_investigation": str(v.get("under_investigation", False)).lower(),
    }

registry_rows = [build_vendor_row(v) for v in vendors]
registry_fields = list(registry_rows[0].keys())

with open(os.path.join(OUT, "vendor_registry.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=registry_fields)
    w.writeheader()
    w.writerows(registry_rows)

label_fields = ["vendor_id","is_anomaly","anomaly_type","severity","explanation"]
with open(os.path.join(OUT, "vendor_labels.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=label_fields)
    w.writeheader()
    for vid, row in LABELS.items():
        w.writerow({"vendor_id": vid, **row})

print(f"Generated {len(registry_rows)} vendors -> sample_data/vendor_registry.csv")
print(f"Generated {len(LABELS)} labels  -> sample_data/vendor_labels.csv")
