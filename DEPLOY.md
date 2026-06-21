# Deploying VendorLens (free tier)

**Stack:** Frontend → **Vercel** · Backend → **Render** · CI/CD → **GitHub Actions** + both platforms' native auto-deploy.

Every push to `main` rebuilds and redeploys both services automatically.

```
GitHub (main)
   ├──> Vercel   ── builds Next.js frontend, serves at https://<app>.vercel.app
   └──> Render   ── builds FastAPI backend,  serves at https://<api>.onrender.com
        ▲
   GitHub Actions (ci-cd.yml) runs build/test checks first
```

---

## One-time setup

### 1. Push these config files to GitHub
```bash
git add render.yaml .github/workflows/ci-cd.yml backend/requirements-render.txt backend/app/main.py DEPLOY.md
git commit -m "chore: add deployment config (Vercel + Render + CI/CD)"
git push origin main
```
> If the repo isn't on GitHub yet: create an empty repo on github.com, then
> `git remote add origin <url>` and `git push -u origin main`.

### 2. Deploy the backend on Render
1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect your GitHub repo. Render reads `render.yaml` and creates the `vendorlens-api` web service.
3. In the service's **Environment**, optionally set `GROQ_API_KEY` / `GEMINI_API_KEY` (AI features degrade gracefully without them). `JWT_SECRET_KEY` is auto-generated.
4. Wait for the first deploy. Note the URL, e.g. `https://vendorlens-api.onrender.com`.
5. Verify: open `https://vendorlens-api.onrender.com/health` → `{"status":"ok"}`.

### 3. Deploy the frontend on Vercel
1. Go to <https://vercel.com/new> → import the same GitHub repo.
2. **Root Directory** → set to `frontend`. (Vercel auto-detects Next.js.)
3. **Environment Variables** → add:
   - `NEXT_PUBLIC_API_URL` = your Render URL (e.g. `https://vendorlens-api.onrender.com`)
4. Deploy. Note the URL, e.g. `https://vendorlens.vercel.app`.

### 4. Connect the two (CORS)
1. Back in Render → `vendorlens-api` → **Environment** → set
   `CORS_ORIGINS` = your Vercel URL (e.g. `https://vendorlens.vercel.app`).
   (Vercel *preview* URLs are already allowed via the `CORS_ORIGIN_REGEX` in `render.yaml`.)
2. Save → Render redeploys automatically.

### 5. (Optional) Wire the GitHub Actions deploy trigger
The frontend build job uses an Actions **variable**, and the backend deploy step uses a **secret**:
- Repo → **Settings → Secrets and variables → Actions**
  - **Variables** → `NEXT_PUBLIC_API_URL` = your Render URL (so CI builds the frontend correctly).
  - **Secrets** → `RENDER_DEPLOY_HOOK_URL` = Render service → Settings → **Deploy Hook** URL.
- This is optional: Render's `autoDeploy: true` already redeploys on push. The secret just lets Actions trigger it explicitly after checks pass.

---

## How push-to-main works after setup
1. You push to `main`.
2. **GitHub Actions** (`ci-cd.yml`) runs: backend import smoke test + frontend `npm run build`.
3. **Vercel** rebuilds and redeploys the frontend (native git integration).
4. **Render** rebuilds and redeploys the backend (`autoDeploy: true`, plus optional Actions trigger).

## Notes & tradeoffs
- **Render free tier** spins the backend down after ~15 min idle; the first request after that takes ~30–50s to wake. Fine for demos. Hit `/health` to pre-warm before a demo.
- **SQLite is ephemeral** on Render's free tier — that's intentional here: `startup.bootstrap()` re-seeds the DB from `sample_data/*.csv` on every boot, so it's always consistent.
- **Full local RAG** (`sentence-transformers`) is excluded from `requirements-render.txt` to fit 512MB RAM; `rag.py` falls back to deterministic QA. To enable it, deploy on an instance ≥2GB RAM and point the build command at `requirements.txt`.
