# Audrolics Frontend

This is the Next.js frontend for Audrolics. The root `README.md` and SRS PDF in `../documents/` define the product requirements; this file is only frontend-specific orientation.

## Responsibilities

The frontend owns the browser-based schematic builder and user-facing workflows:

- Landing page with product description and login/signup calls to action.
- Email/password login and signup screens.
- Diagram builder canvas for junctions, reservoirs, tanks, pipes, pumps, valves, and filters.
- Properties panel for element input parameters.
- Read-only display of computed simulation results.
- Manual measurement entry for node pressure/head and link flow.
- Visual anomaly results with confidence and manual-review warnings.
- Export controls for PNG, SVG, CSV, and JSON.

Keep input parameters separate from computed results in UI state. Computed fields should look read-only and should not be editable.

## Diagram Builder Requirements

The builder should support:

- Snap-to-connect within 10 px.
- Pan, zoom from 50% to 200%, and fit-to-view.
- Multi-select with Shift+click or drag-box.
- Delete by keyboard and context menu.
- Copy/paste with auto-incremented labels.
- Undo/redo with at least 50 actions.
- `localStorage` recovery backup every 30 seconds.
- Browser close warning when unsaved changes exist.
- Right-panel width between 280 px and 480 px.
- Attribute visibility toggles for length, diameter, pressure, flow, and elevation.
- Curve editor with live mini-chart for pump curves and GPV valve curves.
- Pattern/texture anomaly highlights in addition to color.

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

Run linting:

```bash
npm run lint
```

Build for production:

```bash
npm run build
```

## API

When backend calls are implemented, read the backend base URL from:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Production should point this to the Render backend. Do not hardcode localhost in components or client data modules.

All non-auth API calls require bearer-token authorization per the SRS.
