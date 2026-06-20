# VendorLens — Third-Party Vendor Risk Management

Hackathon project for Société Générale. AI-powered vendor risk scoring platform.

## Quick start

### Backend (Python 3.11 / FastAPI)

```bash
cd backend

# First time
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

pip install -r requirements.txt

cp .env.example .env
# Edit .env — add your GEMINI_API_KEY

# Run
uvicorn app.main:app --reload --port 8000
```

API available at **http://localhost:8000**
Swagger docs at **http://localhost:8000/docs**

### Frontend (Next.js 14 / TypeScript)

```bash
cd frontend

npm install

cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:8000  (already set)

npm run dev
```

App available at **http://localhost:3000**

---

## Endpoints (stubs → real logic)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vendors` | List all vendors (summary) |
| GET | `/vendors/{id}` | Full vendor detail + risk score |
| GET | `/alerts` | All active alerts |
| GET | `/report` | Portfolio-level risk report |
| POST | `/ingest` | Upload vendor CSV files |
| POST | `/ask` | AI audit chat (Gemini) |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — vendor table with RAG status |
| `/vendors/[id]` | Vendor detail with radar chart |
| `/chat` | Audit chat (optionally scoped to a vendor) |

## Monorepo layout

```
vendorlens/
├── backend/          Python 3.11 · FastAPI · Pydantic · Gemini SDK
│   └── app/
│       ├── main.py
│       ├── schema.py         ← canonical Pydantic models
│       ├── mock_data.py      ← stub data (replace with real engine)
│       └── routers/          ← one file per endpoint group
├── frontend/         Next.js 14 · TypeScript · Tailwind · Recharts
│   ├── types/vendor.ts       ← mirrors backend/app/schema.py
│   ├── lib/api.ts            ← typed fetch wrappers
│   ├── components/           ← shared UI components
│   └── pages/                ← dashboard · vendor detail · chat
├── shared/           schema_reference.md
└── sample_data/      drop vendor_registry.csv and vendor_labels.csv here
```

## Schema contract

Types are mirrored in **`backend/app/schema.py`** (Pydantic) and **`frontend/types/vendor.ts`** (TypeScript). Keep them in sync when adding fields.

## Environment variables

| Variable | Where | Description |
|----------|-------|-------------|
| `GEMINI_API_KEY` | `backend/.env` | Gemini API key for `/ask` |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | Backend base URL |
