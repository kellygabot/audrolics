# Audrolics Deployment Guide

This guide describes how to deploy Audrolics with:

- Frontend: Next.js on Vercel
- Backend: FastAPI on Render
- Database: MongoDB Atlas
- CI/CD: GitHub Actions for validation, Vercel automatic frontend deploys, and Render automatic backend deploys

The commands assume the repository root is `audrolics/`.

## 1. Prerequisites

Install these tools locally before deploying:

- Git
- Node.js 20 or newer
- npm
- Python 3.13 or newer
- uv
- A GitHub repository for this project
- A Vercel account connected to GitHub
- A Render account connected to GitHub
- A MongoDB Atlas account

Recommended local verification before deployment:

```bash
cd frontend
npm install
npm run lint
npm run build
```

```bash
cd ../backend
uv sync
uv run fastapi dev
```

The backend should start at `http://127.0.0.1:8000`, and the frontend should build without errors.

## 2. Prepare Environment Variables

The backend uses these MongoDB variables from `backend/sample.env`:

```env
MONGODB_USERNAME={USERNAME}
MONGODB_PASSWORD={PASSWORD}
MONGODB_URI={URI}
```

Create production values in MongoDB Atlas before deploying.

Do not commit real secrets to Git. Keep `backend/.env` local only.

Recommended production backend variables:

```env
MONGODB_USERNAME=your_atlas_database_user
MONGODB_PASSWORD=your_atlas_database_password
MONGODB_URI=mongodb+srv://your_atlas_cluster/audrolics
```

Recommended frontend variables:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

The current frontend scaffold may not use `NEXT_PUBLIC_API_BASE_URL` yet, but add it when API calls are implemented so the deployed frontend does not hardcode local backend URLs.
  
## 3. Create MongoDB Atlas Database

1. Sign in to MongoDB Atlas.
2. Create a project named `Audrolics`.
3. Create a cluster. A free shared cluster is enough for the current scaffold.
4. Create a database user.
5. Save the username and password.
6. Add a network access rule.
7. For Render deployment, either allow Render outbound IPs if you have a paid static outbound IP setup, or temporarily allow `0.0.0.0/0` during early development.
8. Copy the connection string.
9. Replace the username, password, and database name in the connection string.

Use a database name like `audrolics`.

## 4. Backend Deployment On Render

The backend is a FastAPI app in `backend/` with the default FastAPI entrypoint at `backend/main.py`.

### 4.1 Create The Render Web Service

1. Sign in to Render.
2. Choose `New` -> `Web Service`.
3. Connect the GitHub repository.
4. Select the branch to deploy, usually `main`.
5. Set the root directory to:

```text
backend
```

6. Set runtime to Python.
7. Set build command:

```bash
uv sync --frozen
```

8. Set start command:

```bash
uv run fastapi run main.py --host 0.0.0.0 --port $PORT
```

Render provides `$PORT`; the backend must bind to `0.0.0.0` and that port.

### 4.2 Add Render Environment Variables

In Render, open the service settings and add:

```env
MONGODB_USERNAME=your_atlas_database_user
MONGODB_PASSWORD=your_atlas_database_password
MONGODB_URI=mongodb+srv://your_atlas_cluster/audrolics
```

If frontend CORS settings are added later, also add:

```env
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
```

### 4.3 Deploy Backend

1. Click `Manual Deploy` -> `Deploy latest commit`, or push to the configured branch.
2. Wait for the build to finish.
3. Open the service URL.
4. Confirm the API responds:

```bash
curl https://your-render-service.onrender.com/
```

Expected current scaffold response:

```json
{"Hello":"World"}
```

5. Confirm the API docs are available:

```text
https://your-render-service.onrender.com/docs
```

## 5. Frontend Deployment On Vercel

The frontend is a Next.js app in `frontend/`.

### 5.1 Create The Vercel Project

1. Sign in to Vercel.
2. Choose `Add New` -> `Project`.
3. Import the GitHub repository.
4. Set framework preset to Next.js.
5. Set root directory to:

```text
frontend
```

6. Set install command:

```bash
npm ci
```

7. Set build command:

```bash
npm run build
```

8. Leave output directory as the Next.js default.

### 5.2 Add Vercel Environment Variables

Add this once the frontend calls the backend:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

Add it to all Vercel environments that should call the backend:

- Production
- Preview
- Development, if needed

### 5.3 Deploy Frontend

1. Click `Deploy`.
2. Wait for the build to finish.
3. Open the generated Vercel URL.
4. Confirm the page loads.
5. If the frontend calls the API, open browser devtools and confirm requests go to the Render backend URL, not `localhost`.

## 6. Configure CORS Before Connecting Frontend To Backend

When the frontend starts calling backend endpoints from Vercel, the backend must allow that origin.

Add CORS middleware in `backend/src/backend/main.py`:

```python
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

frontend_origin = os.getenv("FRONTEND_ORIGIN")

if frontend_origin:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
```

Then set `FRONTEND_ORIGIN` in Render to the production Vercel URL.

For preview deployments, use a stricter dynamic allowlist rather than `allow_origins=["*"]` if the backend uses cookies or credentials.

## 7. CI: GitHub Actions Validation

Create this file:

```text
.github/workflows/ci.yml
```

Recommended workflow:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  frontend:
    name: Frontend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

  backend:
    name: Backend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v6
        with:
          enable-cache: true

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version-file: backend/.python-version

      - name: Install dependencies
        run: uv sync --frozen

      - name: Import FastAPI app
        run: uv run python -c "from main import app; print(app.title)"
```

This CI workflow checks that:

- Frontend dependencies install from the lockfile.
- Frontend lint passes.
- Frontend production build succeeds.
- Backend dependencies install from `uv.lock`.
- The FastAPI app imports through the default `main:app` entrypoint.

When backend tests are added, include a test step:

```yaml
      - name: Test
        run: uv run pytest
```

Add `pytest` to backend dependencies or dependency groups before enabling that step.

## 8. CD: Automatic Deployments

Use platform-native deploy hooks for the first deployment setup:

- Vercel deploys `frontend/` automatically when changes are pushed to the production branch.
- Render deploys `backend/` automatically when changes are pushed to the production branch.

Recommended branch policy:

- `main`: production deploy branch
- Pull requests: preview checks and code review
- Merge to `main`: triggers production deployment

Recommended GitHub branch protection for `main`:

1. Require pull request before merging.
2. Require status checks to pass.
3. Select the `Frontend` and `Backend` CI jobs.
4. Require branches to be up to date before merging.
5. Restrict direct pushes if the team needs stricter release control.

## 9. Optional CD From GitHub Actions

Vercel and Render can deploy directly from GitHub without deployment steps in Actions. If you prefer explicit GitHub-controlled deployment, use deploy hooks.

### 9.1 Render Deploy Hook

1. In Render, open the backend service.
2. Go to `Settings`.
3. Copy the deploy hook URL.
4. In GitHub, add a repository secret:

```text
RENDER_DEPLOY_HOOK_URL
```

Add this job to `.github/workflows/ci.yml`:

```yaml
  deploy-backend:
    name: Deploy Backend
    runs-on: ubuntu-latest
    needs:
      - backend
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - name: Trigger Render deploy
        run: curl -fsS -X POST "$RENDER_DEPLOY_HOOK_URL"
        env:
          RENDER_DEPLOY_HOOK_URL: ${{ secrets.RENDER_DEPLOY_HOOK_URL }}
```

### 9.2 Vercel Deploy Hook

1. In Vercel, open the frontend project.
2. Go to `Settings` -> `Git` -> `Deploy Hooks`.
3. Create a hook for the production branch.
4. In GitHub, add a repository secret:

```text
VERCEL_DEPLOY_HOOK_URL
```

Add this job:

```yaml
  deploy-frontend:
    name: Deploy Frontend
    runs-on: ubuntu-latest
    needs:
      - frontend
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - name: Trigger Vercel deploy
        run: curl -fsS -X POST "$VERCEL_DEPLOY_HOOK_URL"
        env:
          VERCEL_DEPLOY_HOOK_URL: ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}
```

Do not use both platform-native automatic deploys and deploy-hook Actions at the same time, or each merge can trigger duplicate deployments.

## 10. Recommended Release Flow

1. Create a feature branch:

```bash
git checkout -b feature/your-change
```

2. Make changes.
3. Run local checks:

```bash
cd frontend
npm run lint
npm run build
```

```bash
cd ../backend
uv sync
uv run python -c "from main import app; print(app.title)"
```

4. Push the branch:

```bash
git push -u origin feature/your-change
```

5. Open a pull request.
6. Wait for CI to pass.
7. Review Vercel preview deployment, if enabled.
8. Merge to `main`.
9. Confirm Vercel production deployment finishes.
10. Confirm Render backend deployment finishes.
11. Smoke test production:

```bash
curl https://your-render-service.onrender.com/
```

Open:

```text
https://your-vercel-app.vercel.app
```

## 11. Production Smoke Test Checklist

After each production deploy, verify:

- Frontend URL loads.
- Backend `/` responds.
- Backend `/docs` loads.
- Browser console has no failed API requests.
- API requests use the production Render URL.
- MongoDB connection succeeds once persistence endpoints are implemented.
- Authentication flows work once implemented.
- Save/load schematic flows work once implemented.
- Hydraulic calculation endpoints return expected validation errors for invalid input once implemented.

## 12. Rollback Plan

### Vercel Rollback

1. Open the Vercel project.
2. Go to `Deployments`.
3. Select the last known good deployment.
4. Promote it to production.

### Render Rollback

1. Open the Render backend service.
2. Go to `Events` or `Deploys`.
3. Select the last known good deploy.
4. Redeploy that commit.

If the problem is database-related, rollback code first, then inspect migrations or data changes. The current scaffold does not include migrations yet.

## 13. Operational Notes

- Keep production secrets in Render and Vercel, not in `.env` files committed to Git.
- Use MongoDB Atlas backups before enabling real user data.
- Add backend health endpoints before production use, for example `/health`.
- Add structured logging before field use.
- Add tests for hydraulic calculations before relying on production outputs.
- Validate the hydraulic solver against EPANET reference networks before using results for field decisions.
- Keep frontend and backend deployment configuration documented whenever hosting settings change.

## 14. Current App-Specific Notes

- The backend default command `uv run fastapi dev` works because `backend/main.py` re-exports `app` from the package.
- For production, use `fastapi run`, not `fastapi dev`.
- The frontend currently contains scaffold pages; API integration and production environment variables should be wired when backend endpoints are implemented.
- The backend currently exposes sample routes in `backend/src/backend/main.py`.
- MongoDB variables are scaffolded, but persistence code is not implemented yet.
