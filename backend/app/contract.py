"""
Contract PDF extraction using pdfplumber + Anthropic claude-opus-4-8.
Returns structured JSON with breach SLA, data ownership, sub-processors,
and offboarding/access-revocation terms.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import anthropic
import pdfplumber


def extract_text_from_pdf(pdf_path: str | Path) -> str:
    pages = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n\n".join(pages)


EXTRACTION_PROMPT = """\
You are a legal contract analyst for a bank's Third-Party Risk Management team.
Extract the following fields from the contract text below. Return ONLY valid JSON.

Fields to extract:
- breach_notification_sla_hours: integer (hours vendor has to notify of a breach; null if not specified)
- data_ownership_clause: string (who owns the data — bank or vendor; null if not specified)
- sub_processors: list of strings (named sub-processors or "none stated")
- offboarding_terms: string (data deletion / access revocation terms on contract end; null if not specified)
- data_residency: string (where data is stored: "EU", "non-EU", or "unspecified")
- governing_law: string (jurisdiction; null if not specified)
- audit_rights: boolean (does the bank have audit rights over the vendor?)
- key_risks: list of strings (any unusual clauses or omissions that raise risk)

Contract text:
---
{contract_text}
---

Return JSON only, no markdown fences.
"""


def extract_contract_fields(
    text: str,
    vendor_id: str | None = None,
) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {
            "error": "ANTHROPIC_API_KEY not set",
            "vendor_id": vendor_id,
        }

    client = anthropic.Anthropic(api_key=api_key)

    # Truncate to ~80k chars to stay within context
    truncated = text[:80_000]

    message = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": EXTRACTION_PROMPT.format(contract_text=truncated),
            }
        ],
    )

    raw = message.content[0].text.strip()
    # Strip accidental markdown fences
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"raw_response": raw, "parse_error": True}

    if vendor_id:
        parsed["vendor_id"] = vendor_id

    return parsed


def extract_from_pdf(pdf_path: str | Path, vendor_id: str | None = None) -> dict:
    text = extract_text_from_pdf(pdf_path)
    return extract_contract_fields(text, vendor_id=vendor_id)
