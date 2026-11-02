# Mapdeck

Mapdeck is a geospatial constructor for the browser: a small generic kernel that renders
external data sources on a map, with domain-specific functionality — data protocols,
widgets, tools — delivered as extensions. A STAC catalog, a WMS service or a COPC
point cloud becomes an interactive layer tree with attribute tables, styling controls
and measurement tools, and new sources arrive as modules without touching the kernel.

The same code ships as an embeddable library (`mapdeck` on npm) and as this
repository's demo application, which uses only the public entries.

## Install

```sh
npm install mapdeck
```

React 19 (React 18 is declared in the peer range but not covered by tests), `mobx`
and `mobx-react-lite` are peer dependencies: the host page owns them as singletons.
npm 7+ installs them automatically; with other managers, install them alongside.
Everything else the embed needs arrives transitively.

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
a retry wired to `restart()`. The full option surface (`language`, `logLevel`,
`modules`, the built-in basemap switch) is typed in the shipped
`MapdeckOptions` declaration. Deep integration — protocols, extension contexts,
contracts — goes through the `mapdeck/contracts` subpath; panel building and pure
helpers through `mapdeck/ui` and `mapdeck/utils`. Building extensions is covered
in [docs/extending.md](docs/extending.md).

## Known limitations

- One `MapdeckRoot` per page: the theme root is a page-level singleton.
- The workspace fills the browser viewport (`100vw`/`100vh`); embedding into a
  smaller container overflows it.
- ESM only; there is no CommonJS entry, and rendering assumes a browser DOM (no SSR).
- Point clouds are expected in a metric CRS; foot-based files render with
  over-resolved detail.
- `createMapdeck` configures MobX strictness for the whole page
  (`enforceActions: "always"`).

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

## License

[MIT](LICENSE) © 2025–2026 The Mapdeck Authors.

## Attribution

Icons by [Flaticon Uicons](https://www.flaticon.com/uicons).
