# Mapdeck

Mapdeck is a browser-based geospatial application framework for building
configurable geoportals. It provides map rendering, layer management, data access
and an extension system for adding data sources, tools and widgets. A STAC catalog,
a WMS service or a COPC point cloud becomes an interactive layer tree with
attribute tables, styling controls and measurement tools; new data sources can be
added through modules without modifying the core.

Mapdeck is distributed as an embeddable npm package. This repository also contains
a demo application built on the same public API.

## Install

```sh
npm install mapdeck
```

`react` (`^19.0.0`), `react-dom` (`^19.0.0`), `mobx` (`^6.15.0`) and
`mobx-react-lite` (`^4.1.1`) are peer dependencies: the host application must
provide them. npm 7+ installs them automatically; with other managers, install
them alongside. All other runtime dependencies are installed automatically.

## Requirements

- A browser with WebGL2 — both MapLibre GL and deck.gl require it.
- For TypeScript hosts: `moduleResolution: "bundler"` (or an equivalent setting) —
  the shipped declarations use extension-less relative imports.
- A page with a Content-Security-Policy needs `connect-src` for the data sources and
  the WebAssembly (WASM) decoder, and `worker-src blob:` for the point-cloud decode
  worker (the package inlines it as a blob URL).

The full compatibility list — browsers, versions, distribution format — lives in
[docs/compatibility.md](docs/compatibility.md).

## Minimal embed

```tsx
import ReactDOM from "react-dom/client";
import { createMapdeck, MapdeckRoot } from "mapdeck";
import "mapdeck/styles.css"; // required — the component renders unstyled without it

const mapdeck = createMapdeck({
    // Catalog URL for the configured source adapter (STAC by default).
    settingsOverrides: {
        "layer-tree.data-source-url": "https://example.com/stac/catalog.json",
    },
    // Point clouds only: where the host serves the wasm binary (see below).
    lazPerfWasmUrl: "/assets/laz-perf.wasm",
});

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<MapdeckRoot mapdeck={mapdeck} />);

// When the embed is removed for good:
root.unmount();      // React teardown (the map tears down with it)
mapdeck.dispose();   // releases the instance: adapters, registries, state
```

`createMapdeck` is synchronous; the bootstrap runs in the background, and its
failures surface through the instance's `initError` — never as an unhandled
rejection. `MapdeckRoot` renders a loading screen, an error screen with a retry
(wired to `restart()`), or the workspace. The complete lifecycle — restart
semantics, disposal, unmounting without disposal, error categories — is documented
in [docs/api/lifecycle.md](docs/api/lifecycle.md).

Deep integration — protocols, extension contexts, contracts — goes through the
`mapdeck/contracts` subpath; panel building and pure helpers through `mapdeck/ui`
and `mapdeck/utils`. Building extensions is covered in
[docs/extending.md](docs/extending.md).

## Options

| Option | Type | Default | Purpose |
|---|---|---|---|
| `defaultSourceType` | `string` | `"stac"` | which source adapter serves nodes that name none; must be registered |
| `builtinBasemaps` | `boolean` | `true` | whether the built-in basemap set registers |
| `lazPerfWasmUrl` | `string` | `"laz-perf.wasm"` | URL of the LazPerf WASM binary; point clouds (COPC) only |
| `language` | `string` | runtime default `"en"` | initial UI language; other languages arrive as registered dictionaries |
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | `"warn"` | log threshold |
| `settingsOverrides` | `Record<string, string \| number \| boolean>` | — | per-deployment setting values, see below |
| `modules` | `readonly Module[]` | `[]` | consumer modules, registered after the built-ins (may override) |

The complete reference — validation, timing, restart behavior, module interaction —
is [docs/api/configuration.md](docs/api/configuration.md).

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

- One `MapdeckRoot` per page: the theme root is a page-level singleton — two
  embedded instances are not supported.
- The workspace fills the browser viewport (`100vw`/`100vh`); embedding into a
  smaller container overflows it.
- ESM only; there is no CommonJS entry, and rendering assumes a browser DOM
  (no SSR).
- Point clouds are expected in a metric CRS; foot-based files render with
  over-resolved detail (see [docs/api/protocols.md](docs/api/protocols.md#copc-point-clouds)).
- `createMapdeck` configures MobX strictness for every MobX store on the page, not
  only its own (ADR-0001).

## Serving the point-cloud decoder

COPC streaming needs the LazPerf WASM binary. The package exports it as
`mapdeck/laz-perf.wasm` — a copy of the library's `laz-perf` dependency, so its
version is locked to the installed package, never chosen by the host. Serve that
file over HTTP from anywhere (a static directory, a CDN) and point
`lazPerfWasmUrl` at the URL; it is fetched at runtime, never bundler-imported.
Without the option, the decoder is fetched from `<page-base>/laz-perf.wasm`.

The COPC file itself is read with HTTP range requests: the server must answer them
(partial content), and a file on another origin needs CORS headers. The full COPC
requirements are in [docs/api/protocols.md](docs/api/protocols.md#copc-point-clouds);
the wasm fetch and the decode worker are covered by the CSP notes in Requirements.

## What it can do

- **Map.** MapLibre GL renders raster and vector layers natively; a deck.gl overlay
  handles the layer types that need it — streamed point clouds among them. Basemaps
  are switchable, and the toolbar offers orientation reset and 2D/3D measurements
  (ruler, area, volume).
- **Layer tree.** Hierarchical layers with search, visibility cascades, per-layer
  styling — opacity, point size, point and vector color schemes — and zoom to a
  layer's extent.
- **Data.** Attribute tables per layer (WFS, OGC API Features), feature inspection
  by map click (WMS GetFeatureInfo, vector tiles, GeoJSON overlays, point-cloud
  picking).
- **Protocols.** WMS, XYZ, vector tiles (including PMTiles URLs), tiled GeoJSON,
  WFS, OGC API Features and streamed COPC point clouds are built in; STAC catalogs
  work as a data source. Per-protocol requirements and capabilities:
  [docs/api/protocols.md](docs/api/protocols.md).
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

- [docs/architecture.md](docs/architecture.md) — system overview
- [docs/extending.md](docs/extending.md) — building modules, tools and protocols
- [docs/api/](docs/api/) — public references: configuration, lifecycle, protocols,
  extension contracts
- [docs/compatibility.md](docs/compatibility.md) — supported environments and
  known limitations
- [docs/glossary.md](docs/glossary.md) — domain terms
- [docs/adr/](docs/adr/) — architecture decisions and their rationale
- [AGENTS.md](AGENTS.md) — repository rules and workflow, for contributors and AI
  agents
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guidelines

## Versioning

Mapdeck follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The public surface is what the package exports map exposes as importable entries:
the root entry, `mapdeck/contracts`, `mapdeck/ui`, `mapdeck/utils`,
`mapdeck/styles.css` and `mapdeck/laz-perf.wasm` (plus `mapdeck/package.json`
metadata). Changes to these entries — types, behavior or removal — follow semver: a
breaking change bumps the major version, an additive change bumps the minor.
Everything the exports map does not expose (`src/core/**` internals, the demo
application) may change in any release.

Two boundary notes. `mapdeck/contracts` references the rendering engines' types —
`maplibregl.Map` in the tool contexts, deck.gl types in the overlay port — without
re-exporting them: those follow the engine versions the manifest carries, so a
MapLibre or deck.gl major can require a mapdeck major. And `MapdeckInstance.store`
is an internal implementation detail that exists for `MapdeckRoot`; embedder code
must not read it.

## License

[MIT](LICENSE) © 2025–2026 The Mapdeck Authors.

## Attribution

Icons by [Flaticon Uicons](https://www.flaticon.com/uicons).
