from backend.app.db import create_vendor, fetch_vendor, save_scores
from backend.app.engine import score_vendor
from backend.app.hydrate import row_to_vendor_score

test_data = {
    'name': 'Apex Secure Cloud', 'category': 'Cloud', 'data_sensitivity': 'LOW', 'access_type': 'read', 
    'soc2_type2': False, 'iso27001': False, 'gdpr_dpa': False, 'financial_rating': 'CCC', 
    'data_residency': 'EU', 'concentration_risk': 'MEDIUM', 'sub_processor_count': 15,
    'under_investigation': True, 'breach_history': '2023-11-15|HIGH|Leaked 50,000 credit card records',
    'last_assessment_date': '2026-06-20', 'breach_notification_sla_hours': 120,
    'contract_start': '2026-06-20', 'contract_end': '2026-06-25'
}

try:
    print("Creating vendor...")
    vendor_id = create_vendor(test_data)
    print(f"Created vendor_id: {vendor_id}")
    raw = dict(fetch_vendor(vendor_id))
    print("Scoring vendor...")
    scored = score_vendor(raw)
    print("Saving scores...")
    save_scores(vendor_id, scored, trigger="initial")
    raw.update(scored)
    print("Hydrating to row...")
    final = row_to_vendor_score(raw)
    print("SUCCESS!")
except Exception as e:
    import traceback
    print("ERROR:")
    traceback.print_exc()
