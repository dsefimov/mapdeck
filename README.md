# Mapdeck

Mapdeck is a geospatial constructor for the browser: a small generic core that renders
external data sources on a map, with domain-specific functionality — data protocols,
widgets, tools — delivered as extensions. A STAC catalog, a WMS service or a COPC
point cloud becomes an interactive layer tree with attribute tables, styling controls
and measurement tools, and new sources arrive as modules without touching the core.

The same code ships as an embeddable library (`mapdeck` on npm) and as this
repository's demo application — the demo is a dogfood consumer of the public
entries, not a separate surface.

## Install

```sh
npm install mapdeck
```

React (18 or 19), `mobx` and `mobx-react-lite` are peer dependencies: the host page
owns them as singletons. npm 7+ installs them automatically; with other managers,
install them alongside. Everything else the embed needs arrives transitively.

## Minimal embed

```tsx
import { createMapdeck, MapdeckRoot } from "mapdeck";
import "mapdeck/styles.css"; // mandatory — the component renders unstyled without it

const mapdeck = createMapdeck({
    // Deployment data: where this install's data source lives. The URL feeds
    // whichever source adapter is configured (`defaultSourceType`; the built-in
    // default is the STAC catalog adapter). Applied after registrations,
    // before the first tree fetch; unknown ids fail visibly.
    settingsOverrides: {
        "layer-tree.data-source-url": "https://example.com/stac/catalog.json",
    },
    // Point clouds only: where the host serves the wasm binary (see below).
    lazPerfWasmUrl: "/assets/laz-perf.wasm",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
    <MapdeckRoot mapdeck={mapdeck} />,
);
```

`createMapdeck` is synchronous and self-bootstrapping: bootstrap failures surface
through the instance's `initError`, and `MapdeckRoot` renders the error screen with
a retry wired to `restart()`. The full option surface (`language`, `logLevel`,
`modules`, the built-in basemap switch) is typed in the shipped
`MapdeckOptions` declaration. Deep integration — protocols, extension contexts,
contracts — goes through the `mapdeck/contracts` subpath; panel building and pure
helpers through `mapdeck/ui` and `mapdeck/utils`.

## Serving the point-cloud decoder

COPC streaming needs the LazPerf wasm binary. The package exports it as
`mapdeck/laz-perf.wasm` — a copy of the library's `laz-perf` dependency, so its
version is locked to the installed package, never chosen by the host. Serve that
file over HTTP from anywhere (a static directory, a CDN) and point
`lazPerfWasmUrl` at the URL; it is fetched at runtime, never bundler-imported.

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

## Demo & development

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Run the development server: `npm run dev`.

The demo STAC catalog, basemap configs and the laz-perf decoder ship in
`public/`, so a fresh checkout runs with sample data out of the box.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` | type check + production build |
| `npm run build:lib` | library build (prebuilt ESM package into `dist/`) |
| `npm run lint` | TypeScript + ESLint |
| `npm run test` | Vitest test suite |
| `npm run test:e2e` | Playwright E2E smoke (see below) |
| `npm run license-check` | production dependency license check |

### Testing

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
- [docs/extending.md](docs/extending.md) — building modules, tools and protocols
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guidelines

## License

[MIT](LICENSE) © 2025–2026 The Mapdeck Authors.

## Attribution

Icons by [Flaticon Uicons](https://www.flaticon.com/uicons).
