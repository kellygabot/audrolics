# Audrolics MERN Backend

This is the Node/Express/Mongoose backend for classes that require the MERN stack.

It intentionally exposes the same schematic API contract as the FastAPI/FARM backend:

```text
GET    /api/v1/schematics
POST   /api/v1/schematics
GET    /api/v1/schematics/:schematicId
PUT    /api/v1/schematics/:schematicId
DELETE /api/v1/schematics/:schematicId
```

The frontend does not need to know which backend is running. Point `BACKEND_API_BASE_URL`
or `NEXT_PUBLIC_API_BASE_URL` at this service instead of the FastAPI service.

## Setup

```bash
cd mern-backend
npm install
cp sample.env .env
npm run dev
```

The default port is `8000`, matching the existing frontend rewrite setup.

`MONGODB_URI` must be a real MongoDB connection string. This MERN backend does not
fall back to in-memory persistence because the point of this service is MongoDB.
