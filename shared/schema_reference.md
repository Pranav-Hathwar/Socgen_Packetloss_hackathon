# VendorLens — Canonical Schema Reference

Authoritative types live in two places that must stay in sync:

| File | Language |
|------|----------|
| `backend/app/schema.py` | Python / Pydantic v2 |
| `frontend/types/vendor.ts` | TypeScript |

## Key types

- `VendorScore` — full vendor record (API detail endpoint)
- `VendorSummary` — lightweight list-view row
- `AlertItem` — single alert row
- `ScoreBreakdown` — five sub-scores (0-100 each)
- `Recommendation` — action + detail string
- `AskRequest` / `AskResponse` — chat endpoint contract

## Enum values

| Field | Values |
|-------|--------|
| `data_sensitivity` | LOW / MEDIUM / HIGH |
| `access_type` | read / read_write |
| `data_residency` | EU / non-EU |
| `concentration_risk` | LOW / MEDIUM / HIGH |
| `risk_level` | CRITICAL / HIGH / MEDIUM / LOW |
| `rag` | RED / AMBER / GREEN |
