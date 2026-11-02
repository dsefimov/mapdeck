# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Earlier versions — the 0.x tags and the 1.0.0–1.2.7 release commits that
existed only on the development branch — were never published and have no
entries here; this file opens at the first published release.

## 1.0.0 — 2026-11-02

The first published release: the geospatial constructor as an embeddable ESM
library. A small generic core renders external data sources on a map — WMS,
XYZ, COG, COPC point clouds, vector tiles (PMTiles), tiled GeoJSON, WFS and
OGC API Features — with domain functionality delivered as extensions, and the
repository's demo application acting as a dogfood consumer of the public
entries.

### Added

- The embed surface: the `createMapdeck` facade, the `MapdeckRoot` component
  and the public barrel. Bootstrap is synchronous and self-contained;
  bootstrap failures surface through the instance's `initError`, and the root
  renders the error screen with a retry wired to `restart()`.
- The prebuilt ESM package: library build with type declarations, unminified —
  the host bundler owns minification. Helper subpaths `mapdeck/ui` (panel
  building, `createToolPanelWidget`) and `mapdeck/utils` (pure helpers);
  `mapdeck/contracts` for deep integration (protocols, extension contexts);
  `mapdeck/styles.css` for the mandatory style chain;
  `mapdeck/laz-perf.wasm` so the point-cloud decoder version is locked to the
  installed package, never chosen by the host.
- `settingsOverrides`: host-declared setting values (e.g. the data source URL)
  applied after registrations, before the first tree fetch; unknown ids fail
  visibly.
- Kernel asset mapping: the `AssetProtocolMapper` and the `assetMapping` port;
  protocol declarations — slots and rules ride registration instead of
  built-in fitness checks.
- The open icon set: artwork lives in theme tokens (`--icon-<name>`), and
  non-registry icon names render the token inline.
- The e2e smoke suite (Playwright) walking the demo catalog — layer toggles,
  point-cloud streaming, measurements, feature info, basemap switching, widget
  grid and keyboard navigation — plus a console guard that fails the unit
  suite on any `[MobX]` strictness message.
- The documentation set: ADR 0001–0020, the architecture overview, the
  glossary, the extending guide and CONTRIBUTING.

### Changed

- The kernel is decomposed into engine and stores with `RootStore` as the
  single access point; cross-domain calls go through contracts ports only.
- Registration surfaces are module-only in the extension context family;
  built-in basemaps and module basemaps ride a single registration channel.
- Composition is parameterized: bootstrap options and the module list are
  assembly inputs, not hard-wired sequences.
- The style chain rides the `.mapdeck-root` token carrier — embedded instances
  read their theme from their own container, not the document root.
- The logger threshold is bundler-agnostic: an explicit option replaces
  environment probing.
- Locale languages are open data; the manifest carries MIT license, top-level
  types and the Node ≥ 20.11 engine requirement.

### Fixed

- Settings: owner batches ride the common override policy — translations
  merge, stale-id cleanup fires only on an explicit override, so a tool's
  panel widget no longer erases the tool's own settings.
- Theme: embedded instances read custom properties from their container root.
- Layer tree: refresh preserves expanded groups and reloads them level by
  level.
- Attribute table: WFS pages are requested in EPSG:4326; input font-size
  aligns with selects; tables render without the layer header clutter.
- Feature info: the layer dropdown keeps its store receiver.
- `parseUrl` resolves document-relative URLs under an http(s)-only guard.

### Breaking

Relative to the last unpublished 0.x state:

- Engine/store decomposition: `RootStore` is the single access point; store
  construction and inter-store wiring changed accordingly.
- Registration surfaces are module-only in the context family — direct
  registry calls from extensions are gone.
- Basemaps ride a single registration channel for built-ins and modules.
- The `SupportedLanguage` type is removed — languages are open data.
- Environment-probe logger configuration is replaced by the explicit option.
