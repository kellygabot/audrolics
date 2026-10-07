# Audrolics Backend

Express and MongoDB API for accounts, personal schematics, hydraulic simulation, and anomaly detection.

## Setup

```bash
cd backend
npm install
cp sample.env .env
# Set MONGODB_URI and JWT_SECRET in .env
npm run dev
```

`JWT_SECRET` is required whenever the backend starts outside tests. Use a random value of at least 32 characters. The backend now stops with a clear error if it is missing or still set to the sample placeholder. Restart the backend after changing `.env`, and configure the same variable in the deployed backend environment. `MONGODB_DATABASE` defaults to `audrolics`; `PORT` defaults to `8000`; `FRONTEND_ORIGINS` is a comma-separated list used for CORS. The frontend makes same-origin `/api/*` requests, rewritten to this backend through `BACKEND_API_BASE_URL` for separate deployments.

Create the sole administrator once:

```bash
npm run seed-admin -- 'Admin Name' admin@example.com
```

The command generates and prints a strong temporary password once, and refuses to create another admin. Store the password securely and change it through an approved operational process if needed. Public registration and admin-created accounts always have the `USER` role. Give admin-created passwords to users outside the app. Deleted account emails remain reserved.

## Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Create a USER and start a session (`fullName`, `email`, `password`, `acceptedPolicies: true`) |
| POST | `/api/v1/auth/login` | Start a session (`email`, `password`) |
| POST | `/api/v1/auth/refresh` | Rotate the refresh cookie and return a new access token |
| POST | `/api/v1/auth/logout` | Revoke the refresh session and clear its cookie |
| GET | `/api/v1/auth/me` | Return the active account; Bearer token required |

Register and login return `{ "token": "...", "user": { "id": "...", "fullName": "...", "email": "...", "role": "USER" } }`. Refresh returns the same shape; `GET /auth/me` returns `{ "user": { "id": "...", "fullName": "...", "email": "...", "role": "USER" } }`. Account `status` is not included in auth responses. The access token expires after 15 minutes. An HTTP-only refresh cookie survives browser restarts and expires after 30 days without refresh. Refresh rotates the stored token and extends the inactivity deadline. Logout, suspension, and account deletion revoke sessions. Login attempts are limited in MongoDB, and repeated failures temporarily lock an account. Email verification and email password reset are deferred for this prototype.

Public signup requires `acceptedPolicies: true` after the user reviews the linked draft Terms and Privacy notice. This flag is validated but not stored as an acknowledgment. Admin-created and existing accounts are unaffected. The drafts identify Oceans and Arrays Team as the prototype operator and direct data requests through an Audrolics administrator.

All schematic, simulation, anomaly, and admin APIs require `Authorization: Bearer <token>`. A browser visit to a raw API URL without that header receives 401. `X-User-Id` is ignored.

## User APIs

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/api/v1/schematics` | List or create the signed-in user's diagrams |
| GET, PUT, DELETE | `/api/v1/schematics/:schematicId` | Read, replace, or soft-delete own active diagram |
| POST | `/api/v1/simulate` | Analyze an inline network or owned `schematic_id` |
| POST | `/api/v1/anomalies` | Analyze measurements against an inline network or owned `schematic_id` |

Deleted schematics disappear from the user library. Existing documents owned by `dev-user` remain in MongoDB but are not assigned to any account.

## Admin APIs

Only the seeded `ADMIN` can use these endpoints. The admin cannot read diagram nodes, links, measurements, or run analyses as another user.

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/api/v1/admin/users` | List regular accounts; create a USER |
| GET, PATCH, DELETE | `/api/v1/admin/users/:id` | View, edit fullName/email, soft-delete a USER |
| PATCH | `/api/v1/admin/users/:id/status` | Set `ACTIVE` or `SUSPENDED` |
| POST | `/api/v1/admin/users/:id/restore` | Restore deleted account |
| GET | `/api/v1/admin/schematics` | List diagram metadata only |
| DELETE | `/api/v1/admin/schematics/:id` | Soft-delete a diagram |
| POST | `/api/v1/admin/schematics/:id/restore` | Restore a diagram |
| GET | `/api/v1/admin/audit-logs` | Read simulation history metadata; optional `userId`, `status`, and `page` filters (25 records per page) |

The admin account is excluded from user lists and cannot be edited through these routes. Account restoration makes its previously active diagrams available again; individually deleted diagrams stay deleted until restored.
Audit entries include time, user ID, optional schematic ID, network size, outcome, and an error code for new failed runs. Older entries may not have an error code. Schematic contents and computed results are not included.

Admin create accepts `{ "fullName": "...", "email": "...", "password": "..." }`; edit accepts `{ "fullName": "...", "email": "..." }`. Account responses use `{ "id": "...", "fullName": "...", "email": "...", "role": "USER", "status": "ACTIVE", "deletedAt": null }`. The old `name` request field and `_id` response field are no longer accepted by this API. Update any callers before using the new backend. Stored bcrypt hashes use `passwordHash` after migration; existing hashes are not rehashed.

## One-time account migration

Set `MONGODB_URI`, `MONGODB_DATABASE`, and `JWT_SECRET` for the target database. Run a read-only preflight first:

```bash
npm run migrate-account-fields
```

The output reports total, ready, already current, incomplete, and conflicting account counts without personal data. Resolve field conflicts before applying. Incomplete records are reported and left untouched. After code checks, apply with:

```bash
ACCOUNT_MIGRATION_BACKUP_DIR=/tmp/audrolics-account-backups npm run migrate-account-fields -- --apply
npm run migrate-account-fields
```

Apply creates a gzip `mongodump` archive of the configured database before any writes. The backup directory is restricted to mode `0700` and the archive to `0600`; keep the archive outside the repo and move it to secure long-term storage. The command verifies document counts, new field shapes, and hash preservation. A repeat apply should report zero ready accounts. To restore after investigating a failed migration, use `mongorestore --uri "$MONGODB_URI" --nsInclude "$MONGODB_DATABASE.*" --drop --gzip --archive /path/to/archive.gz` against the same database; this overwrites its current contents. The app is not deployed as part of this migration.

Example:

```bash
curl -c cookies.txt -H 'Content-Type: application/json' -d '{"email":"user@example.com","password":"password123"}' http://localhost:8000/api/v1/auth/login
curl -b cookies.txt -X POST http://localhost:8000/api/v1/auth/refresh
curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:8000/api/v1/schematics
```

## Checks

```bash
npm run typecheck
npm test
npm run build
```

The MongoDB integration suite runs when `TEST_MONGODB_URI` points to a dedicated database whose name includes `audrolics_auth_test`; migration tests use a separate `TEST_MIGRATION_MONGODB_URI` whose database name includes `audrolics_migration_test`. Set `JWT_SECRET` alongside them. Without those variables, their respective suites are skipped.
