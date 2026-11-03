# Mapdeck

Mapdeck is a geospatial constructor for the browser: a kernel — the map, the layer
tree, and the built-in protocols, streamed point clouds included — that renders
external data sources on a map, with additional functionality delivered as extension
modules. A STAC catalog, a WMS service or a COPC
point cloud becomes an interactive layer tree with attribute tables, styling controls
and measurement tools, and new sources arrive as modules without touching the kernel.

The same code ships as an embeddable library (`mapdeck` on npm) and as this
repository's demo application, which uses only the public entries.

## Install

```sh
npm install mapdeck
```

React (`^19.0.0`), `mobx` (`^6.15.0`) and `mobx-react-lite` (`^4.1.1`) are peer
dependencies: the host page owns them as singletons.
npm 7+ installs them automatically; with other managers, install them alongside.
Everything else the embed needs arrives transitively.

## Requirements

- A browser with WebGL2 — both MapLibre GL and deck.gl require it.
- For TypeScript hosts: `moduleResolution: "bundler"` (or an equivalent setting) —
  the shipped declarations use extension-less relative imports.
- A page with a Content-Security-Policy needs `connect-src` for the data sources and
  the wasm binary, and `worker-src blob:` for the point-cloud decode worker (the
  package inlines it as a blob URL).

## Minimal embed

```tsx
import ReactDOM from "react-dom/client";
import { createMapdeck, MapdeckRoot } from "mapdeck";
import "mapdeck/styles.css"; // mandatory — the component renders unstyled without it

const mapdeck = createMapdeck({
    // Catalog URL for the configured source adapter (STAC by default).
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
a retry wired to `restart()`. Deep integration — protocols, extension contexts,
contracts — goes through the `mapdeck/contracts` subpath; panel building and pure
helpers through `mapdeck/ui` and `mapdeck/utils`. Building extensions is covered
in [docs/extending.md](docs/extending.md).

## Options

| Option | Default | Purpose |
|---|---|---|
| `defaultSourceType` | `"stac"` | which source adapter serves nodes that name none; must be registered |
| `builtinBasemaps` | `true` | whether the built-in basemap set registers |
| `lazPerfWasmUrl` | — | URL of the LazPerf wasm binary; point clouds (COPC) only |
| `language` | `"en"` | initial UI language; other languages arrive as registered dictionaries |
| `logLevel` | `"warn"` | log threshold |
| `settingsOverrides` | — | per-deployment setting values, see below |
| `modules` | `[]` | consumer modules, registered after the built-ins (may override) |

The returned handle (`MapdeckInstance`) exposes the boot state (`isInitialized`,
`initError`), `restart()` (a fresh store and bootstrap) and `dispose()` (release
everything; the instance is unusable after).

### `settingsOverrides`

Values for registered settings, applied after all registrations and before the first
tree fetch. Unknown ids and invalid values fail initialization visibly. The built-in
settings:

| Id | Kind | Purpose |
|---|---|---|
| `layer-tree.data-source-url` | string | catalog URL for the configured source adapter |
| `basemap.basemap` | select | the active basemap id; ids come from the registered basemap configs |

A module's own settings register through the same mechanism, so the full id set is
whatever the assembled modules declared.

## Known limitations

- One `MapdeckRoot` per page: the theme root is a page-level singleton.
- The workspace fills the browser viewport (`100vw`/`100vh`); embedding into a
  smaller container overflows it.
- ESM only; there is no CommonJS entry, and rendering assumes a browser DOM (no SSR).
- Point clouds are expected in a metric CRS; foot-based files render with
  over-resolved detail.
- `createMapdeck` configures MobX strictness for the whole page (ADR-0001 lists
  the options).

## Serving the point-cloud decoder

COPC streaming needs the LazPerf wasm binary. The package exports it as
`mapdeck/laz-perf.wasm` — a copy of the library's `laz-perf` dependency, so its
version is locked to the installed package, never chosen by the host. Serve that
file over HTTP from anywhere (a static directory, a CDN) and point
`lazPerfWasmUrl` at the URL; it is fetched at runtime, never bundler-imported.

The COPC file itself is read with HTTP range requests: the server must answer them
(partial content), and a file on another origin needs CORS headers. The wasm fetch
and the decode worker are covered by the CSP notes in Requirements.

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

The repository ships a demo application that runs on the public entries with sample
data in `public/` — clone, `npm install`, `npm run dev`. The scripts table, the test
suites and the hooks live in [CONTRIBUTING.md](CONTRIBUTING.md).

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

## Versioning

Mapdeck follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The public surface is what the package exports map exposes: the root entry,
`mapdeck/contracts`, `mapdeck/ui`, `mapdeck/utils`, `mapdeck/styles.css` and
`mapdeck/laz-perf.wasm`. Changes to these entries — types, behavior or
removal — follow semver: a breaking change bumps the major version, an
additive change bumps the minor. Everything the exports map does not expose
(`src/core/**` internals, the demo application) may change in any release.

Two members of the public surface follow special rules. The type of
`MapdeckInstance.store` is the internal store registry (kept because
`MapdeckRoot` renders from it) and may change in any release. And
`mapdeck/contracts` carries the rendering engines' types — `maplibregl.Map` in
the tool contexts, deck.gl types in the overlay port: those follow the engine
versions the manifest carries, so a maplibre or deck.gl major can require a
mapdeck major.

## License

[MIT](LICENSE) © 2025–2026 The Mapdeck Authors.

## Attribution

Icons by [Flaticon Uicons](https://www.flaticon.com/uicons).
