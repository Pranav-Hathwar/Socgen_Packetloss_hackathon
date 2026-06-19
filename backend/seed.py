"""
Seed demo users — run once before the demo.

  python seed.py

Creates one account per role (skips if already exists):
  admin@vendorlens.com   / Admin@Demo1    — ADMIN
  analyst@vendorlens.com / Analyst@Demo1  — ANALYST
  auditor@vendorlens.com / Auditor@Demo1  — AUDITOR
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.db import init_db, create_user, get_user_by_email
from app.auth import hash_password
from app.startup import bootstrap

DEMO_USERS = [
    ("admin@vendorlens.com",   "Admin@Demo1",   "ADMIN"),
    ("analyst@vendorlens.com", "Analyst@Demo1", "ANALYST"),
    ("auditor@vendorlens.com", "Auditor@Demo1", "AUDITOR"),
]

if __name__ == "__main__":
    bootstrap()   # ensures DB + vendor data is ready
    print("\n--- VendorLens demo user seed ---")
    for email, password, role in DEMO_USERS:
        if get_user_by_email(email):
            print(f"  SKIP  {email} (already exists)")
        else:
            create_user(email, hash_password(password), role)
            print(f"  OK    {email}  [{role}]  pw: {password}")
    print("\nReady. Login at POST /auth/login with the credentials above.")
