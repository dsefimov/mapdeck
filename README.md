# Mapdeck

Mapdeck is a browser-based framework for building configurable geoportals.
It provides map rendering, layer management, geospatial data access and an extension
API for integrating data sources, tools and widgets. Built-in integrations include
STAC catalogs, OGC services, raster and vector tiles, GeoJSON and COPC point clouds.

Mapdeck is distributed as an embeddable npm package. The repository also contains a
demo application built on the same public API.

## Install

```sh
npm install mapdeck
```

The host application must provide these peer dependencies:

- `react` `^19.0.0`
- `react-dom` `^19.0.0`
- `mobx` `^6.15.0`
- `mobx-react-lite` `^4.1.1`

npm 7 and later installs peer dependencies automatically when possible. With other
package managers, install them explicitly. The remaining runtime dependencies are
included with the package.

## Requirements

- A browser with WebGL2 support. MapLibre GL and deck.gl both require WebGL2.
- For TypeScript projects, `moduleResolution: "bundler"` or an equivalent setting.
  The published declarations use extension-less relative imports.
- If the host uses Content Security Policy (CSP), allow connections to the configured
  data endpoints and the WebAssembly decoder. Point-cloud decoding also requires
  `worker-src blob:`. See [Compatibility](docs/compatibility.md#content-security-policy).

See [Compatibility](docs/compatibility.md) for the supported environment and package
constraints.

## Minimal embed

```tsx
import ReactDOM from "react-dom/client";
import { createMapdeck, MapdeckRoot } from "mapdeck";
import "mapdeck/styles.css";

const mapdeck = createMapdeck({
    settingsOverrides: {
        // Replace with the URL of a catalog accessible to the browser.
        "layer-tree.data-source-url": "<your-stac-catalog-url>",
    },
    // Required when loading COPC point clouds. Serve the package asset from your app.
    lazPerfWasmUrl: "/assets/laz-perf.wasm",
});

const container = document.getElementById("root");
if (!container) throw new Error("Root element was not found");

const root = ReactDOM.createRoot(container);
root.render(<MapdeckRoot mapdeck={mapdeck} />);

// When the embed is permanently removed:
root.unmount();
mapdeck.dispose();
```

`createMapdeck` returns synchronously and starts initialization in the background.
Initialization errors are exposed through `initError`. `MapdeckRoot` renders the
loading state, an error state with a retry action, or the workspace. See
[Instance lifecycle](docs/api/lifecycle.md) for initialization, restart and disposal
behavior.

The `mapdeck/contracts` entry point exposes extension contracts. The `mapdeck/ui`
and `mapdeck/utils` entry points expose UI components and helper functions. See
[Extending Mapdeck](docs/extending.md) for integration examples.

## Configuration

| Option | Type | Default | Purpose |
|---|---|---|---|
| `defaultSourceType` | `string` | `"stac"` | Source-adapter type used when a node does not specify one. The adapter must be registered. |
| `builtinBasemaps` | `boolean` | `true` | Registers the built-in basemap configurations. |
| `lazPerfWasmUrl` | `string` | `"laz-perf.wasm"` | Runtime URL of the LazPerf WASM binary. Used for COPC point clouds. |
| `language` | `string` | runtime default `"en"` | Initial UI language. Other languages are supplied by registered translation dictionaries. |
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | `"warn"` | Package logger threshold. |
| `settingsOverrides` | `Record<string, string \| number \| boolean>` | — | Values for registered settings. See below. |
| `modules` | `readonly Module[]` | `[]` | Consumer modules registered after built-in modules. |

See the [configuration reference](docs/api/configuration.md) for validation,
registration order and restart behavior.

### `settingsOverrides`

`settingsOverrides` supplies values for settings registered by built-in or consumer
modules. Values are applied after registration and before the initial source fetch.
Unknown setting IDs and invalid values cause initialization to fail.

Built-in settings:

| ID | Type | Purpose |
|---|---|---|
| `layer-tree.data-source-url` | string | URL used by the configured source adapter. |
| `basemap.basemap` | select | ID of the active registered basemap. |

The complete set of available IDs depends on the registered modules.

## Features

- **Map rendering and interaction.** MapLibre GL renders raster and vector layers.
  A deck.gl overlay renders layers that require it, including streamed point clouds.
  Map controls include basemap selection, orientation reset and 2D/3D measurement tools.
- **Layer management.** Hierarchical layer tree with search, visibility controls,
  per-layer styling and zoom-to-extent.
- **Data access and inspection.** Attribute tables for supported feature services and
  feature inspection through map interactions.
- **Built-in data support.** WMS, XYZ raster tiles, vector tiles, tiled GeoJSON, WFS,
  OGC API Features and COPC point clouds. STAC catalogs are supported as a source
  format. See the [protocol reference](docs/api/protocols.md) for details and limits.
- **Extensions.** Modules can register widgets, map tools, layer tools, source adapters
  and protocols. Workspace widget layout and z-order persist for the session.

## Known limitations

- One `MapdeckRoot` per page. The theme root is a page-level singleton, so multiple
  independent embedded instances are not supported.
- The workspace uses the browser viewport (`100vw`/`100vh`). It does not currently
  fit into a smaller host container.
- The package provides ESM only and requires a browser DOM. CommonJS and SSR are not
  supported.
- COPC point clouds are expected to use a metric coordinate reference system. See
  [COPC requirements](docs/api/protocols.md#copc-point-clouds).
- `createMapdeck` configures MobX strictness globally for the page, including stores
  created by the host application. See [ADR-0001](docs/adr/0001-mobx-state-management.md).

## Serving the point-cloud decoder

COPC streaming requires the LazPerf WebAssembly binary. The package exports a copy of
the binary at `mapdeck/laz-perf.wasm`. Serve this file over HTTP, for example from a
static directory or CDN, and set `lazPerfWasmUrl` to its URL. The binary is fetched at
runtime; it is not imported by the bundler. If the option is omitted, Mapdeck resolves
`laz-perf.wasm` against the page base URL.

COPC data is read with HTTP range requests. The server must support partial content;
cross-origin files also require suitable CORS headers. See the
[protocol reference](docs/api/protocols.md#copc-point-clouds) and
[CSP requirements](docs/compatibility.md#content-security-policy).

## Demo and development

The repository includes a demo application and sample data under `public/`. To run it:

```sh
npm install
npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development scripts, tests and repository
workflow.

## Technology stack

React 19, TypeScript, Vite, MobX, MapLibre GL, deck.gl, copc.js and LazPerf. Turf is
used for geospatial calculations.

## Documentation

- [Architecture](docs/architecture.md) — system structure and data flow.
- [Extending Mapdeck](docs/extending.md) — modules, tools, source adapters and protocols.
- [API reference](docs/api/index.md) — public package entry points and API documentation.
- [Compatibility](docs/compatibility.md) — environment requirements and limitations.
- [Glossary](docs/glossary.md) — domain terminology.
- [Architecture decision records](docs/adr/) — decisions and their rationale.
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution guidelines.

## Versioning

Mapdeck follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The public
package surface is defined by the package `exports` map: the root entry,
`mapdeck/contracts`, `mapdeck/ui`, `mapdeck/utils`, `mapdeck/styles.css`,
`mapdeck/laz-perf.wasm` and `mapdeck/package.json`. Changes to exported APIs and their
behavior follow SemVer. Internal files under `src/core/**` and the demo application
are not public API and may change between releases.

`mapdeck/contracts` references MapLibre and deck.gl types without re-exporting them.
Their versions are determined by the versions included in the package, so a major
engine upgrade may require a Mapdeck major release. `MapdeckInstance.store` is an
internal implementation detail used by `MapdeckRoot`; embedder code must not depend
on it.

## License

[MIT](LICENSE) © 2025–2026 The Mapdeck Authors.

## Attribution

Icons by [Flaticon Uicons](https://www.flaticon.com/uicons).
