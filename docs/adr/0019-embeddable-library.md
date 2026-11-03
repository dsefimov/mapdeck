# ADR-0019: The embeddable library — prebuilt ESM over host-singleton peers

Status: Accepted · Date: 2026-11-01

## Context

One codebase serves two roles: this repository's demo app and an embeddable
component inside arbitrary hosts (`createMapdeck` / `MapdeckRoot`, the barrel
at `src/app/index.ts`). The demo uses only the public entries — it exercises
the same package a host receives.

Two constraints shape the package. React and MobX must be singletons of the
host page: a second React copy means two renderers and broken hooks, a second
MobX means duplicated stores and reactions — the package cannot own these
runtimes. And host toolchains differ in what they compile from `node_modules`
(TypeScript, CSS Modules) — the package can neither assume a specific
toolchain nor require one.

## Decision

**Host-singleton runtimes are peer dependencies.** `react`, `react-dom`, `mobx`,
`mobx-react-lite`; README carries the exact ranges. The React peer names only the
major the test suite runs — widening it later is a minor, narrowing it is a major.
Every runtime the embed
needs on its own — the engines, pmtiles, proj4, the geo math, the grid
layout, the point-cloud stack — is a regular dependency, and the build
externals exactly the manifest's dependency and peer lists
(`vite.lib.config.ts`), so a runtime cannot silently bundle into the package.

**Rendering engines are dependencies, not peers.** The engines are
singleton-flavored too, but the embed facade owns map creation: a host
touches the engine through `MapContext` ports and tools (ADR-0010), never by
importing the engine alongside the library. Peering maplibre and deck.gl
would make every host install and version-align two heavyweight packages it
never imports; depending on them keeps `npm install mapdeck`
self-sufficient. The cost is named in Consequences: the engine is not public
surface. `react-grid-layout` follows the same policy — its React peer resolves
against the host's copy under normal dedupe, and a host pinning a React
outside its range hears about it from the package manager at install time,
not from a broken-hooks mystery at runtime.

**Prebuilt ESM, readable, no second format.** `minify: false`, sourcemaps
shipped — the host's bundler owns minification. ESM is the only format;
there is no CJS entry.

**Declarations with rewritten aliases; the demo is not the package.**
Declarations are generated over the source tree with the `@core/…` aliases
rewritten; demo-only modules (`main.tsx`, the config readers, the global
error handlers) are excluded from the build and the types. Global handlers
are a host's prerogative — the library installs none.

**One stylesheet, vendors included.** CSS is emitted as a single
`mapdeck.css` with the vendor stylesheets (maplibre, the grid layout, the
resizers) folded in: a host whose pipeline does not process CSS from
`node_modules` still gets a working package. Importing `mapdeck/styles.css`
is part of the integration contract.

**The exports map is the surface.** `.`, `./contracts`, `./ui`, `./utils`,
`./styles.css`, `./laz-perf.wasm`, `./package.json` — four barrels in
`src/app/`, each with its own build entry. The composition and stability
guard of the helper subpaths live in ADR-0017; this record is the packaging
foundation they ride.

**The one file asset is the wasm.** `laz-perf.wasm` ships as a copy of the
library's `laz-perf` dependency — its version is locked by the manifest,
never chosen by the host. It is served over HTTP at a runtime URL, never
bundler-imported; icons and the worker inline, so the package emits no asset
files besides the wasm.

## Consequences

- SemVer covers the public surface: the four entries, the stylesheet, the
  wasm copy, the peer ranges. A breaking change to any of them is a major.
- `import "mapdeck/styles.css"` is mandatory: without it the component
  renders unstyled.
- The host serves `laz-perf.wasm` over HTTP at a URL the runtime names; the
  file ships with the package, so its version never drifts from the reader.
- The engines are not public surface: a host that needs direct maplibre or
  deck.gl access imports its own copy and owns version alignment, the
  duplicate-engine cost included.
- ESM-only: a CJS consumer (Jest without ESM setup, SSR through `require`)
  cannot import the package without tooling changes — accepted; bundling
  hosts are the target.
- `createMapdeck` configures MobX globally (the options are in ADR-0001); host
  stores on the same page run under the same strictness.
- The React peer names the tested major; adding another major is a minor bump
  once a test run covers it.
- The demo app builds on the same entries, so the package surface is
  exercised by the repository itself on every demo build.
