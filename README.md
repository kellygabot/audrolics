# Audrolics

Audrolics is a web-based automated calculation and condition monitoring system for pressurized water pipe networks. It is designed for field engineers and technicians who need to draw a schematic pipe network, run hydraulic calculations, enter field measurements, and locate likely anomaly segments such as leaks, blockages, or faulty readings.

The authoritative product definition is the SRS in `documents/hydraulics_ automated calculation and condition monitoring system.pdf`. If implementation details conflict, follow the SRS first and update this README afterward.

## System Definition

Audrolics v1 is a browser-based tool for Maynilad field engineers and technicians. It models pressurized water distribution segments as a graph of hydraulic nodes and links, runs a steady-state hydraulic simulation, compares expected values against manually entered field measurements, and highlights likely anomaly segments.

The system is intentionally not a CAD replacement, SCADA platform, city-wide hydraulic model, or ML condition-monitoring platform in v1.

## Product Scope

Audrolics v1 focuses on field-segment scale water distribution networks, not full city-wide hydraulic modeling.

In scope for v1:

- Schematic diagram builder for line-and-symbol network diagrams.
- Hydraulic simulation using Hazen-Williams headloss and the Global Gradient Algorithm.
- Manual pressure and flow measurement input at valid element types.
- Anomaly detection by comparing simulated expected values against measured field values.
- Candidate segment highlighting between bracketing measurement points.
- Landing page.
- Email/password authentication so users can save and reload their own schematics.
- Save/load/delete for authenticated users' own schematic library.
- PNG, SVG, CSV, and JSON export.

Out of scope for v1:

- ML-based condition monitoring.
- Auto-measuring hardware or IoT sensors.
- AutoCAD or EPANET `.inp` import.
- Real-time collaboration.
- SCADA or live sensor integration.
- Oil-based hydraulic systems.
- Extended Period Simulation (EPS).

## Architecture

Audrolics models a water network as a graph:

- Nodes: junctions, reservoirs, and tanks.
- Links: pipes, pumps, valves, and strainers/filters.

The frontend owns the interactive schematic-building experience. The backend owns validation, persistence, and the API boundary for future simulation, anomaly localization, audit logging, and authentication work.

```text
audrolics/
├── backend/                  # Node.js/Express/Mongoose backend service
│   ├── src/
│   │   ├── app.ts            # Express app, middleware, health route, and API mounting
│   │   ├── server.ts         # MongoDB connection and HTTP server startup
│   │   ├── config/           # dotenv, port, CORS, and MongoDB configuration
│   │   ├── models/           # Mongoose models
│   │   ├── repositories/     # MongoDB CRUD access layer
│   │   ├── routes/           # Express route handlers
│   │   ├── schemas/          # Request normalization and validation
│   │   └── utils/            # Shared errors and time helpers
│   ├── tests/
│   ├── package.json
│   ├── sample.env
│   └── tsconfig.json
├── frontend/                 # Next.js frontend application
│   ├── app/                  # Next.js App Router pages
│   ├── components/           # React component areas
│   ├── public/               # Static assets
│   ├── package.json
│   └── tsconfig.json
├── documents/                # SRS and project documentation
└── notebook/                 # Experiments and scratch analysis
```

`builder-storage.ts` is now a frontend API client, despite the old name. It no longer stores the main schematic library in browser `localStorage`; `localStorage` is only used for recovery drafts.

The required JavaScript backend path is now the only active backend path:

```text
MongoDB
  -> Express/Mongoose backend in backend/
  -> React/Next.js frontend in frontend/
  -> Node.js runtime
```

The old FastAPI/FARM backend is no longer part of the active working tree. If Python solver experiments are needed later, keep them in a separate folder or notebook and call them through an explicit API boundary instead of mixing them into the Express/Mongoose service.

## Planned Core Workflows

### Schematic Diagram Maker

The diagram builder should allow engineers to place and connect:

- Junctions
- Reservoirs
- Tanks
- Pipes
- Pumps
- Valves
- Strainers/filters

Each element has editable input attributes and computed simulation attributes. These must remain separate in both the UI and data model so users do not overwrite solver output. Computed values are recalculated on simulation runs and must not be persisted as user-editable values.

Expected builder controls include:

- Left element palette.
- Central canvas with snap-to-connect, delete, pan, zoom, undo/redo, and multi-select.
- Right-side property panel for selected element inputs.
- Conditional valve settings based on valve type.
- Curve editor for pump curves and GPV valve headloss curves.
- Live curve preview for pump and GPV curve inputs.
- Attribute visibility toggles for diagram labels.
- Explicit save/load/delete from MongoDB.
- Browser `localStorage` recovery backup every 30 seconds.
- Browser close warning when unsaved changes exist.
- PNG/SVG/CSV/JSON export.

Element labels are auto-generated by type: `J-*`, `R-*`, `T-*`, `P-*`, `PU-*`, `V-*`, and `F-*`, with user renaming allowed.

### Autocalculate And Anomaly Detection

Audrolics v1 is planned as a steady-state hydraulic simulator. It should solve one fixed snapshot of the network using base demands and current settings.

The planned calculation approach is:

- Hazen-Williams pipe headloss.
- Global Gradient Algorithm (GGA), matching the solver strategy used by EPANET.
- Conservation of mass at nodes.
- Conservation of energy across links and loops.
- Steady-state only: junction demand patterns are stored as future EPS placeholders but not used in v1 calculations.

Solver convergence requirements:

- Node head imbalance: `<= 0.001 m`.
- Link flow imbalance: `<= 0.001 L/s`.
- Maximum iterations: `200`.
- Abort on divergence if the head-correction L2 norm increases for 5 consecutive iterations.

The anomaly workflow is:

1. Build or load a schematic with design attributes.
2. Run the hydraulic simulation to produce expected pressure and flow values.
3. Enter measured pressure values at node elements and measured flow values at link elements.
4. Compare expected and measured values against the schematic's configured threshold.
5. Flag measured points that exceed the threshold.
6. Narrow the likely anomaly to the pipe segment between bracketing measurement points.
7. Highlight the suspect segment on the schematic.

At least 2 measurement points are required for segment narrowing. With fewer than 2 measurements, the system can flag anomalous points but must return the insufficient-measurements warning instead of pretending to localize a segment.

Default v1 thresholds are per saved schematic, not global:

- Pressure/head: `+/-5%` or `+/-0.5 m`, whichever is larger.
- Flow: `+/-10%` or `+/-0.5 L/s`, whichever is larger.

A measurement is anomalous when `abs(actual - expected) > max(percent_threshold * abs(expected), absolute_threshold)`.

The localization output should include flagged points, up to 3 suspect segments, anomaly signature (`LEAK`, `BLOCKAGE`, or manual-review/unknown), warnings, and a confidence score. Conflicting residuals on the same segment must be flagged for manual review.

## Validation Rules

The backend should reject invalid save or run actions with clear element-specific errors.

| Attribute | Element(s) | Rule |
| --- | --- | --- |
| Elevation | Junction, Reservoir, Tank | `-100` to `5000 m` relative to a defined datum |
| Base Demand | Junction | `>= 0 L/s` |
| Length | Pipe | `> 0 m` and `<= 100000 m` |
| Diameter | Pipe, Valve | `> 0 mm`; typical `12-1200 mm` |
| Roughness C-factor | Pipe | `1-150`; reject `<= 0`; practical minimum `60` |
| Minor Loss Coefficient | Pipe, Filter | `>= 0` |
| Tank Levels | Tank | `Min <= Initial <= Max`, all `>= 0` |
| Pump Speed | Pump | `> 0`; typical `0.1-2.0` |
| Valve Setting | Valve | `> 0`; unit/range depends on valve type; PRV setting must be below upstream pressure |
| Filter Mesh Size | Strainer/filter | `> 0 mm` |

Curve validation:

- Pump and GPV curves require at least 2 points.
- Pump head must decrease monotonically as flow increases.
- GPV headloss must increase monotonically as flow increases.
- Duplicate flow values within one curve are invalid.
- Do not extrapolate beyond the last curve point; use constant behavior and flag a warning if the operating point falls outside the curve range.

Filter headloss uses configurable per-schematic status multipliers: `1.0` for clean, `3.0` for partially clogged, and `10.0` for clogged.

Before simulation, the backend should also block networks with:

- No reservoir or tank water source.
- Orphaned nodes.
- Pipes with unconnected endpoints.
- Disconnected subgraphs unreachable from a source.
- Feasibility failures such as direct different-head reservoirs, dead-head pumps, demand nodes isolated by closed valves, extreme negative pressure below `-10 m`, invalid PRV operation, and FCV settings beyond theoretical pipe capacity.

## API Surface

The SRS defines the production API base as `https://api.audrolics.com/api/v1`. All endpoints except `/auth/*` require a bearer token.

Required endpoint groups:

- Auth: `POST /auth/signup`, `/auth/verify`, `/auth/login`, `/auth/refresh`, `/auth/reset-password-request`, `/auth/reset-password`.
- Schematics: `GET /schematics`, `POST /schematics`, `GET /schematics/{id}`, `PUT /schematics/{id}`, `DELETE /schematics/{id}`.
- Simulation: `POST /simulate`.
- Anomaly detection: `POST /anomalies`.
- Export: `GET /export/{schematic_id}?format=png|svg|csv|json`.

Standard errors use `{ error_code, message, element_id?, attribute? }`. Preserve the SRS error-code families when implementing validation and API responses:

- `E100-E106`: network and simulation failures.
- `E200-E203`: invalid input and curve/element validation failures.
- `E300-E301`: anomaly localization warnings/failures.
- `E400-E429`: auth, ownership, and rate-limit failures.

Current implementation status:

- Implemented in the Node.js/Express/Mongoose backend: `GET /api/v1/schematics`, `POST /api/v1/schematics`, `GET /api/v1/schematics/{id}`, `PUT /api/v1/schematics/{id}`, and `DELETE /api/v1/schematics/{id}`.
- Temporary ownership is handled by the `X-User-Id` header until authentication is implemented.
- Backend validation is authoritative for saved schematic payloads.
- Simulation, anomaly detection, authentication, audit logging, and export API routes are still planned work.
- Computed fields exist in the saved data model as read-only placeholders until the solver is wired in.

## Units And Engineering Conventions

Audrolics intentionally uses mixed field units at the UI/data-entry boundary.

| Quantity | Standard Unit | Formula Note |
| --- | --- | --- |
| Length, Elevation | meters (`m`) | Used directly |
| Diameter | millimeters (`mm`) | Convert to meters for hydraulic formulas |
| Flow | liters/second (`L/s`) | Convert to `m^3/s` for hydraulic formulas |
| Pressure/Head | meters of head (`m`) | Bar may be shown as a UI toggle |
| Power | kilowatts (`kW`) | Used for pump input when no curve is provided |
| Energy | kilowatt-hours (`kWh`) | Pump result |
| Velocity | meters/second (`m/s`) | Pipe result |
| Volume | cubic meters (`m^3`) | Tank result |

Do not silently normalize the UI inputs into a single displayed unit system. Normalize only inside calculation code where formulas require it.

## Non-Functional Requirements

- Accuracy: match EPANET 2.2 equivalent inputs within `+/-0.01 m` node pressure head, `+/-0.1 L/s` link flow, and `+/-0.01 m` link headloss.
- Performance: simulate networks up to 50 nodes and 100 links in under 2 seconds at the 95th percentile on a standard 8 GB laptop; database load under 1 second; save under 500 ms; element selection response under 100 ms.
- Security: bcrypt password hashing with work factor at least 12, HTTPS in production, 15-minute JWT access tokens, HTTP-only 7-day refresh token cookie, auth rate limiting, input sanitization, and secrets only in environment variables.
- Usability: no CAD experience required, tooltips for inputs, contextual help from any screen, and shortcut help via `Ctrl+?`.
- Accessibility: WCAG 2.1 AA, keyboard navigation, text contrast at least 4.5:1, and anomaly highlights that use pattern/texture in addition to color.
- Compatibility: latest supported Chrome, Edge, and Firefox families per the SRS baseline.
- Data retention: schematics inactive for more than 2 years may be archived; audit logs retained for 1 year.

Every simulation run must create an audit record with timestamp, user ID, schematic ID, network size, and result status (`success`, `failure`, or `non-convergence`).

## Testing Requirements

Before field deployment, solver results must be validated against EPANET 2.2:

- `TEST-NET-01`: simple branch network.
- `TEST-NET-02`: single loop network.
- `TEST-NET-03`: EPANET Example 1 / Net1.
- `TEST-NET-04`: pump network.
- `TEST-NET-05`: PRV valve network.

Anomaly tests must cover known leak localization, blockage localization, insufficient measurements (`E300`), and conflicting measurements (`E301`). UI tests must cover undo/redo depth with at least 60 actions, copy/paste label increments, all export formats, and canvas behavior at `1280x720`, `1920x1080`, and `2560x1440`. Security tests must cover password rules, login rate limiting, JWT expiry, and injection resistance.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend/API: Node.js, Express, Mongoose
- Database: MongoDB
- Backend package management: `npm`
- Planned hosting: Vercel for frontend and backend
- Future ML experiments: Modal

## Getting Started

### Backend

```bash
cd backend
npm install
cp sample.env .env
npm run dev
```

The API should be available at `http://localhost:8000`.

For MongoDB persistence, `backend/.env` must include a real `MONGODB_URI`:

```env
PORT=8000
MONGODB_URI=mongodb+srv://your_username:your_password@your-cluster.mongodb.net/
MONGODB_DATABASE=audrolics
FRONTEND_ORIGINS=http://localhost:3000,http://localhost:3001
```

`MONGODB_URI` is required. If it is missing or left as `{URI}`, the backend refuses to start instead of falling back to in-memory persistence.

The optional `MONGODB_DATABASE` env var can override the database name. If omitted, the backend uses:

```text
database: audrolics
collection: schematics
```

Run backend checks with:

```bash
cd backend
npm run typecheck
npm test
npm run build
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend should be available at `http://localhost:3000`.

The builder calls same-origin paths such as `/api/v1/schematics`. `frontend/next.config.ts` rewrites `/api/*` to the backend server, defaulting to `http://localhost:8000`. Keep the backend running while saving, listing, loading, or deleting schematics from the builder.

After the first save, clicking Save again updates the current schematic with `PUT`. To create another separate schematic, click **New** first, then build and save the new diagram.

Run linting with:

```bash
cd frontend
npm run lint
```

## Team

Prepared by Oceans and Arrays:

- De Galicia, MJ
- Gabot, Kelly
- Jondiz, Cesar III
- Migrino, Areisha Julliana
- Tablizo, Paul Edward

## Disclaimer

Audrolics is being built by a non-hydraulics-expert team for hydraulics practitioners. Hydraulic calculations should be validated against EPANET test networks and reviewed by a hydraulics subject matter expert before production or field use.
