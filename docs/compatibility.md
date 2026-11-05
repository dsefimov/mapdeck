# Compatibility and limitations

The authoritative list of supported environments, distribution constraints, and
known limitations. The README keeps a short summary of this page.

## Browser baseline

- A browser with WebGL2 — both MapLibre GL and deck.gl require it. This excludes
  browsers without hardware or software WebGL2 support.
- The package targets evergreen browsers; there is no legacy (ES5/UMD) build.

## Host requirements

- **React** `^19.0.0` and **react-dom** `^19.0.0` — peer dependencies; the host
  provides them, and the package resolves against the host's copies.
- **MobX** `^6.15.0` and **mobx-react-lite** `^4.1.1` — peer dependencies, same
  rule.
- **TypeScript hosts**: `moduleResolution: "bundler"` or an equivalent setting —
  the shipped declarations use extension-less relative imports. The MobX peer's
  declarations reference `ReadonlySetLike`, so hosts without `skipLibCheck` need
  `"ESNext.Collection"` in `lib` (or a TypeScript ≥ 5.6 lib set that carries it).

## Distribution format

- **ESM only.** There is no CommonJS entry; a `require()` consumer (Jest without
  ESM setup, SSR pipelines) cannot import the package without tooling changes.
- **No SSR.** Rendering assumes a browser DOM and WebGL.
- **One instance per page.** The theme root is a page-level singleton, so one
  `MapdeckRoot` per page; two independent embedded instances are not supported.
- **Viewport-sized workspace.** The workspace fills the browser viewport
  (`100vw`/`100vh`); embedding into a smaller container overflows it.

## Content Security Policy

A page with a CSP needs at least:

- `connect-src`: the data source endpoints, the tile/feature endpoints the sources
  use, and the WASM decoder URL for point clouds;
- `worker-src blob:`: the point-cloud decode worker is inlined as a blob URL.

## MobX configuration

`createMapdeck` configures MobX (`enforceActions: "always"`,
`computedRequiresReaction`, `safeDescriptors`) globally for the page — see ADR-0001.
A host running its own MobX stores on the same page runs them under the same
strictness.

## Point clouds (COPC)

- Metric CRS expected: spacing is read as meters; foot-based files render with
  over-resolved detail (≈3.3×), and a CRS declared only through GeoTIFF keys is
  treated as geographic (see [api/protocols.md](api/protocols.md#copc-point-clouds)).
- HTTP range requests: the COPC file's server must answer `Range` requests with
  partial content; cross-origin files need CORS.
- WASM: the LazPerf decoder is fetched at runtime from `lazPerfWasmUrl` (default
  `laz-perf.wasm` against the page base); serve the copy shipped at
  `mapdeck/laz-perf.wasm`.

## Engine coupling

The package depends on MapLibre GL (`^5`) and deck.gl (`^9`) as regular
dependencies — hosts do not install them. `mapdeck/contracts` references their
types inline, so a MapLibre or deck.gl major carried by a mapdeck release can
require a mapdeck major (see Versioning in the README). A module that imports
MapLibre itself installs `maplibre-gl@^5` for type compatibility
(see [api/extensions.md](api/extensions.md#maplibre-and-deckgl-types)).
