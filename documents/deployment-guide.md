# Audrolics Deployment Guide

This guide describes how to deploy Audrolics with both apps on Vercel:

- Frontend: Next.js on Vercel from `frontend/`
- Backend: Node.js/Express/Mongoose serverless functions on Vercel from `backend/`
- Database: MongoDB Atlas
- CI/CD: GitHub Actions for validation and Vercel automatic deploys

The commands assume the repository root is `audrolics/`.

## 1. Prerequisites

Install these tools locally before deploying:

- Git
- Node.js 20 or newer
- npm
- A GitHub repository for this project
- A Vercel account connected to GitHub
- A MongoDB Atlas account

Recommended local verification before deployment:

```bash
cd backend
npm install
npm run typecheck
npm test
npm run build
```

```bash
cd ../frontend
npm install
npm run lint
npm exec tsc -- --noEmit
npm test -- --run
npm run build
```

## 2. Backend Vercel Readiness

The backend can run in two modes:

- Local development: `backend/src/server.ts` connects to MongoDB and starts `app.listen(...)`.
- Vercel deployment: `backend/api/index.ts` and `backend/api/[...path].ts` export a serverless handler.

The Vercel handler is in:

```text
backend/src/vercel.ts
```

That handler creates the Express app once, caches the MongoDB connection promise, and lets Vercel invoke the app per request.

The backend Vercel routing config is:

```text
backend/vercel.json
```

It supports:

```text
GET    /
GET    /api/v1/schematics
POST   /api/v1/schematics
GET    /api/v1/schematics/:schematicId
PUT    /api/v1/schematics/:schematicId
DELETE /api/v1/schematics/:schematicId
```

## 3. Prepare MongoDB Atlas

1. Sign in to MongoDB Atlas.
2. Create a project named `Audrolics`.
3. Create a cluster. A free shared cluster is enough for the current schematic API.
4. Create a database user.
5. Save the username and password.
6. Add a network access rule.
7. For early Vercel deployment, allow `0.0.0.0/0`. Tighten this later if your plan supports static outbound networking.
8. Copy the connection string.
9. Put the database name in the connection string or use `MONGODB_DATABASE=audrolics`.

Do not commit real secrets to Git. Keep `.env` files local only.

## 4. Deploy Backend On Vercel

Create a separate Vercel project for the backend.

### 4.1 Create The Backend Project

1. Sign in to Vercel.
2. Choose `Add New` -> `Project`.
3. Import the GitHub repository.
4. Set root directory to:

```text
backend
```

5. Set framework preset to `Other`.
6. Set install command:

```bash
npm ci
```

7. Set build command:

```bash
npm run build
```

8. Leave output directory empty.

### 4.2 Add Backend Environment Variables

In the backend Vercel project, add these environment variables:

```env
MONGODB_URI=mongodb+srv://your_username:your_password@your-cluster.mongodb.net/
MONGODB_DATABASE=audrolics
FRONTEND_ORIGINS=https://your-frontend-project.vercel.app
```

For preview deployments, add the preview frontend URL to `FRONTEND_ORIGINS` as a comma-separated value:

```env
FRONTEND_ORIGINS=https://your-frontend-project.vercel.app,https://your-preview-url.vercel.app
```

`PORT` is not needed on Vercel because Vercel invokes serverless functions directly. Keep `PORT=8000` only for local development.

### 4.3 Deploy Backend

1. Click `Deploy`.
2. Wait for the build to finish.
3. Open the backend Vercel URL.
4. Confirm the health response:

```bash
curl https://your-backend-project.vercel.app/
```

Expected response:

```json
{"name":"Audrolics API","status":"ok"}
```

5. Confirm the schematic API reaches MongoDB:

```bash
curl -H "X-User-Id: dev-user" https://your-backend-project.vercel.app/api/v1/schematics
```

Expected response for a new database:

```json
[]
```

If this fails, check:

- `MONGODB_URI` is set in the backend Vercel project.
- `MONGODB_DATABASE` is set or the connection string includes a database.
- MongoDB Atlas network access allows Vercel.
- The request includes `X-User-Id` until real authentication is implemented.

## 5. Deploy Frontend On Vercel

Create a separate Vercel project for the frontend.

### 5.1 Create The Frontend Project

1. Sign in to Vercel.
2. Choose `Add New` -> `Project`.
3. Import the same GitHub repository.
4. Set framework preset to `Next.js`.
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

### 5.2 Add Frontend Environment Variables

In the frontend Vercel project, set the backend URL:

```env
BACKEND_API_BASE_URL=https://your-backend-project.vercel.app
```

`frontend/next.config.ts` rewrites frontend requests from:

```text
/api/v1/schematics
```

to:

```text
https://your-backend-project.vercel.app/api/v1/schematics
```

You may also set `NEXT_PUBLIC_API_BASE_URL`, but `BACKEND_API_BASE_URL` is preferred because the rewrite runs in Next.js config and does not need to expose the backend URL to browser code.

After changing Vercel environment variables, redeploy the frontend project so `next.config.ts` picks up the value.

### 5.3 Deploy Frontend

1. Click `Deploy`.
2. Wait for the build to finish.
3. Open the frontend Vercel URL.
4. Open the builder page.
5. Save a schematic.
6. Open browser devtools and confirm the frontend calls same-origin `/api/v1/schematics`.
7. Confirm the request succeeds and the backend Vercel project receives the request.

## 6. Configure CORS

The backend reads CORS origins from:

```env
FRONTEND_ORIGINS
```

Use comma-separated origins:

```env
FRONTEND_ORIGINS=https://your-frontend-project.vercel.app,http://localhost:3000
```

For production, include the production frontend URL. For local testing against the deployed backend, include `http://localhost:3000`.

Do not use `*` once authentication cookies or bearer tokens are implemented.

## 7. CI: GitHub Actions Validation

Use one workflow to validate both projects.

Create:

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
  backend:
    name: Backend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

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

      - name: Typecheck
        run: npm exec tsc -- --noEmit

      - name: Test
        run: npm test -- --run

      - name: Build
        run: npm run build
```

## 8. CD: Automatic Deployments

Vercel can deploy both projects directly from GitHub:

- Backend Vercel project root: `backend`
- Frontend Vercel project root: `frontend`

Recommended branch policy:

- `main`: production deploy branch
- Pull requests: preview checks and code review
- Merge to `main`: triggers production deployment for both Vercel projects

Recommended GitHub branch protection for `main`:

1. Require pull request before merging.
2. Require status checks to pass.
3. Select the `Backend` and `Frontend` CI jobs.
4. Require branches to be up to date before merging.
5. Restrict direct pushes if the team needs stricter release control.

## 9. Recommended Release Flow

1. Create a feature branch:

```bash
git checkout -b feature/your-change
```

2. Make changes.
3. Run local checks:

```bash
cd backend
npm run typecheck
npm test
npm run build
```

```bash
cd ../frontend
npm run lint
npm exec tsc -- --noEmit
npm test -- --run
npm run build
```

4. Push the branch:

```bash
git push -u origin feature/your-change
```

5. Open a pull request.
6. Wait for CI to pass.
7. Review Vercel preview deployments.
8. Merge to `main`.
9. Confirm both Vercel production deployments finish.
10. Smoke test production.

## 10. Production Smoke Test Checklist

After each production deploy, verify:

- Frontend URL loads.
- Backend `/` responds.
- `GET /api/v1/schematics` returns `[]` or saved schematics when called with `X-User-Id`.
- Browser console has no failed API requests.
- Frontend network requests use same-origin `/api/v1/schematics`.
- Frontend rewrite reaches the backend Vercel URL.
- MongoDB Atlas shows saved schematics in the `audrolics.schematics` collection.
- Authentication flows work once implemented.
- Save, list, load, update, and delete schematic flows work.
- Future hydraulic calculation endpoints return expected validation errors for invalid input.

Smoke commands:

```bash
curl https://your-backend-project.vercel.app/
curl -H "X-User-Id: dev-user" https://your-backend-project.vercel.app/api/v1/schematics
```

Open:

```text
https://your-frontend-project.vercel.app
```

## 11. Rollback Plan

### Frontend Rollback

1. Open the frontend Vercel project.
2. Go to `Deployments`.
3. Select the last known good deployment.
4. Promote it to production.

### Backend Rollback

1. Open the backend Vercel project.
2. Go to `Deployments`.
3. Select the last known good deployment.
4. Promote it to production.

If the problem is database-related, rollback code first, then inspect data changes. The current project does not include migrations yet.

## 12. Operational Notes

- Keep production secrets in Vercel, not in committed `.env` files.
- Use MongoDB Atlas backups before enabling real user data.
- Keep `MONGODB_URI` scoped to a database user with only the permissions the app needs.
- Add structured logging before field use.
- Add authentication before real multi-user production use.
- Validate the hydraulic solver against EPANET reference networks before using results for field decisions.
- Keep frontend and backend deployment configuration documented whenever hosting settings change.

## 13. Current App-Specific Notes

- The backend is deployed from `backend/`.
- The frontend is deployed from `frontend/`.
- The backend currently exposes schematic CRUD routes only.
- The backend requires `X-User-Id` until real authentication is implemented.
- The backend requires MongoDB and does not use in-memory persistence.
- The frontend builder already saves through `/api/v1/schematics`.
- Simulation, anomaly detection, export routes, and authentication are still planned work.
