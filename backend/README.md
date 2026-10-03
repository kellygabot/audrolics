# Audrolics Backend

This is the Node.js/Express/Mongoose backend for Audrolics.

It exposes the schematic API contract used by the Next.js frontend:

```text
GET    /api/v1/schematics
POST   /api/v1/schematics
GET    /api/v1/schematics/:schematicId
PUT    /api/v1/schematics/:schematicId
DELETE /api/v1/schematics/:schematicId
```

The frontend calls same-origin `/api/*` paths. The root Vercel Services config
routes them to the Express entrypoint in `src/index.ts`. When deployed as two
separate Vercel projects, the frontend instead uses `BACKEND_API_BASE_URL` to
rewrite those paths to this backend.

## Setup

```bash
cd backend
npm install
cp sample.env .env
npm run dev
```

The default port is `8000`, matching the existing frontend rewrite setup.

`MONGODB_URI` must be a real MongoDB connection string. This backend does not
fall back to in-memory persistence because the point of this service is MongoDB.

Run validation with:

```bash
npm run typecheck
npm test
npm run build
```
