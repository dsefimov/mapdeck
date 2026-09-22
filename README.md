# Mapdeck

Mapdeck is a geospatial constructor for the browser: a small generic core that renders
external data sources on a map, with domain-specific functionality — data protocols,
widgets, tools — delivered as extensions. A STAC catalog, a WMS service or a COPC
point cloud becomes an interactive layer tree with attribute tables, styling controls
and measurement tools, and new sources arrive as modules without touching the core.

## What it can do

- **Map.** MapLibre GL renders raster and vector layers natively; a deck.gl overlay
  handles the layer types that need it — streamed point clouds among them. Basemaps
  are switchable, and the toolbar offers orientation reset and 2D/3D measurements
  (ruler, area, volume).
- **Layer tree.** Hierarchical layers with search, visibility cascades, per-layer
  styling — opacity, point size, point and vector color schemes — and zoom to a
  layer's extent.
- **Data.** Attribute tables per layer, feature inspection by map click, WMS
  GetFeatureInfo queries.
- **Protocols.** WMS, XYZ, COG, COPC, vector tiles (PMTiles), tiled GeoJSON, WFS and
  OGC API Features are built in; STAC catalogs work as a data source.
- **Extensions.** Widgets live in a windowed grid workspace whose layout survives
  close; domain functionality is delivered as modules (the STAC integration is the
  built-in example).

## Quick start

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Run the development server: `npm run dev`.

The demo STAC catalog, basemap configs and the laz-perf decoder ship in
`public/`, so a fresh checkout runs with sample data out of the box.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` | type check + production build |
| `npm run lint` | TypeScript + ESLint |
| `npm run test` | Vitest test suite |
| `npm run test:e2e` | Playwright E2E smoke (see below) |
| `npm run license-check` | production dependency license check |

## Testing

Unit and store logic run with Vitest (`npm run test`, colocated `*.test.ts`).
The E2E smoke suite lives in `tests/` and drives the real app in Chromium:

```sh
npx playwright install chromium   # once, after cloning
npm run test:e2e
```

The suite boots the dev server itself, walks the demo catalog — layer
toggles, point-cloud streaming over range requests, measurements on the
cloud, feature info, basemap switching, widget grid and menu keyboard
navigation — and fails on any console error outside the known-harmless
list (`tests/helpers/console.ts`). It runs against live demo sources, so
it needs network access and takes a few minutes; it is deliberately not
part of the git hooks.

## Stack

React 19 and TypeScript on Vite, MobX for state, MapLibre GL and deck.gl for
rendering, copc.js and laz-perf for point-cloud streaming, Turf for geo math.

## Documentation

- [AGENTS.md](AGENTS.md) — repository organization, rules and workflow, for
  contributors and AI agents
- [docs/architecture.md](docs/architecture.md) — system overview
- [docs/glossary.md](docs/glossary.md) — domain terms
- [docs/adr/](docs/adr/) — architecture decisions and their rationale
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guidelines

## License

[MIT](LICENSE) © 2025–2026 The Mapdeck Authors.

## Attribution

Icons by [Flaticon Uicons](https://www.flaticon.com/uicons).
