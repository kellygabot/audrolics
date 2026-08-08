# Audrolics

Audrolics is a web-based automated calculation and condition monitoring system for pressurized water pipe networks. It is designed for field engineers and technicians who need to draw a schematic pipe network, run hydraulic calculations, enter field measurements, and locate likely anomaly segments such as leaks, blockages, or faulty readings.

The product scope is based on the SRS in `documents/hydraulics_ automated calculation and condition monitoring system.pdf`.

## Current Status

This repository is in initial scaffold state.

- `frontend/` contains a Next.js App Router project with placeholder pages for the landing, builder, diagram, UI, login, and signup areas.
- `backend/` contains a FastAPI project scaffold with sample routes in `backend/src/backend/main.py`.
- Backend architecture folders for API routes, engine logic, schemas, models, repositories, services, database, and core configuration are present, but most modules are still empty.
- The hydraulic solver, anomaly detection, persistence, authentication, and diagram builder workflows are planned by the SRS but are not implemented yet.

## Product Scope

Audrolics v1 focuses on field-segment scale water distribution networks, not full city-wide hydraulic modeling.

In scope:

- Schematic diagram builder for line-and-symbol network diagrams.
- Hydraulic simulation using Hazen-Williams headloss and a steady-state solver.
- Manual pressure and flow measurement input.
- Anomaly detection by comparing simulated expected values against measured field values.
- Candidate segment highlighting between bracketing measurement points.
- Landing page.
- Email/password authentication so users can save and reload their own schematics.

Out of scope for v1:

- ML-based condition monitoring.
- Auto-measuring hardware.
- AutoCAD import.
- Real-time collaboration.
- SCADA or live sensor integration.
- Oil-based hydraulic systems.
- Extended Period Simulation (EPS).

## Architecture

Audrolics models a water network as a graph:

- Nodes: junctions, reservoirs, and tanks.
- Links: pipes, pumps, valves, and strainers/filters.

The frontend owns the interactive schematic-building experience. The backend owns validation, simulation, anomaly localization, persistence, and authentication APIs.

```text
audrolics/
├── backend/                  # FastAPI backend service
│   ├── src/backend/
│   │   ├── api/              # API routers and route controllers
│   │   ├── core/             # Cross-cutting app configuration/security helpers
│   │   ├── engine/           # Hydraulic calculation and anomaly modules
│   │   ├── models/           # Database models
│   │   ├── repositories/     # Persistence access layer
│   │   ├── schemas/          # Request/response schemas
│   │   ├── services/         # Application workflow services
│   │   ├── config.py         # Runtime configuration
│   │   ├── database.py       # Database client setup
│   │   └── main.py           # FastAPI app entrypoint
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── sample.env
│   └── uv.lock
├── frontend/                 # Next.js frontend application
│   ├── app/                  # Next.js App Router pages
│   ├── components/           # React component areas
│   ├── public/               # Static assets
│   ├── package.json
│   └── tsconfig.json
├── documents/                # SRS and project documentation
└── notebook/                 # Experiments and scratch analysis
```

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

Each element has editable input attributes and computed simulation attributes. These must remain separate in both the UI and data model so users do not overwrite solver output.

Expected builder controls include:

- Left element palette.
- Central canvas with snap-to-connect, delete, pan, zoom, undo/redo, and multi-select.
- Right-side property panel for selected element inputs.
- Conditional valve settings based on valve type.
- Curve editor for pump curves and GPV valve headloss curves.
- Attribute visibility toggles for diagram labels.
- Explicit save/load from MongoDB.
- PNG/SVG export.

### Autocalculate And Anomaly Detection

Audrolics v1 is planned as a steady-state hydraulic simulator. It should solve one fixed snapshot of the network using base demands and current settings.

The planned calculation approach is:

- Hazen-Williams pipe headloss.
- Global Gradient Algorithm (GGA), matching the solver strategy used by EPANET.
- Conservation of mass at nodes.
- Conservation of energy across links and loops.

The anomaly workflow is:

1. Build or load a schematic with design attributes.
2. Run the hydraulic simulation to produce expected pressure and flow values.
3. Enter measured pressure values at node elements and measured flow values at link elements.
4. Compare expected and measured values against the schematic's configured threshold.
5. Flag measured points that exceed the threshold.
6. Narrow the likely anomaly to the pipe segment between bracketing measurement points.
7. Highlight the suspect segment on the schematic.

Default v1 threshold: +/-10% for pressure and +/-10% for flow, configurable per saved schematic.

## Validation Rules

The backend should reject invalid save or run actions with clear element-specific errors.

| Attribute | Element(s) | Rule |
| --- | --- | --- |
| Elevation | Junction, Reservoir, Tank | Any real number relative to a defined datum |
| Base Demand | Junction | `>= 0 L/s` |
| Length | Pipe | `> 0 m` |
| Diameter | Pipe, Valve | `> 0 mm` |
| Roughness C-factor | Pipe | Reject `<= 0`; typical Hazen-Williams range is `60-150` |
| Minor Loss Coefficient | Pipe | `>= 0` |
| Tank Levels | Tank | `Min <= Initial <= Max`, all `>= 0` |
| Pump Power | Pump | `> 0 kW` when used instead of a curve |
| Valve Setting | Valve | `> 0`; unit/range depends on valve type |
| Filter Mesh Size | Strainer/filter | `> 0 mm` |

Before simulation, the backend should also block networks with:

- No reservoir or tank water source.
- Orphaned nodes.
- Pipes with unconnected endpoints.
- Disconnected subgraphs unreachable from a source.

## Units And Engineering Conventions

Audrolics intentionally uses mixed field units at the UI/data-entry boundary.

| Quantity | Standard Unit | Formula Note |
| --- | --- | --- |
| Length, Elevation | meters (`m`) | Used directly |
| Diameter | millimeters (`mm`) | Convert to meters for hydraulic formulas |
| Flow | liters/second (`L/s`) | Convert to `m^3/s` for hydraulic formulas |
| Pressure/Head | meters of head (`m`) | Bar may be shown as a UI toggle |
| Power | kilowatts (`kW`) | Used for pump input when no curve is provided |

Do not silently normalize the UI inputs into a single displayed unit system. Normalize only inside calculation code where formulas require it.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend/API: FastAPI, Python
- Database: MongoDB
- Backend package management: `uv`
- Planned hosting: Vercel for frontend, Render for backend
- Future ML experiments: Modal

## Getting Started

### Backend

```bash
cd backend
uv sync
cp sample.env .env
uv run fastapi dev
```

The API should be available at `http://localhost:8000`. FastAPI documentation should be available at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend should be available at `http://localhost:3000`.

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
