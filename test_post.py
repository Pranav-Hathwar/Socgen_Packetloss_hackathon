import urllib.request
import json
data=json.dumps({
    'name': 'Test', 'category': 'Cloud', 'data_sensitivity': 'LOW', 'access_type': 'read', 
    'soc2_type2': False, 'iso27001': False, 'gdpr_dpa': False, 'financial_rating': 'BBB', 
    'data_residency': 'EU', 'concentration_risk': 'LOW', 'sub_processor_count': 15,
    'under_investigation': True, 'breach_history': '2023-11-15|HIGH|Leaked 50,000 credit card records',
    'last_assessment_date': '2023-01-10', 'breach_notification_sla_hours': 120,
    'contract_start': '2023-05-01', 'contract_end': '2024-12-31'
}).encode('utf-8')
req = urllib.request.Request('http://localhost:8000/vendors', data=data, headers={'Content-Type': 'application/json'})
try:
    print(urllib.request.urlopen(req).read().decode('utf-8'))
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print(e.read().decode('utf-8'))
