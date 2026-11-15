# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-15

### Added

- Embeddable ESM package with the entries `mapdeck`, `mapdeck/contracts`,
  `mapdeck/ui`, `mapdeck/utils`, `mapdeck/styles.css` and `mapdeck/laz-perf.wasm`:
  `createMapdeck` with a documented lifecycle (`restart`, `dispose`) and
  `MapdeckRoot`.
- Data protocols: WMS with GetFeatureInfo, XYZ raster tiles (PMTiles URLs
  supported), vector tiles, tiled GeoJSON, WFS and OGC API Features with attribute
  tables, and streamed COPC point clouds. STAC catalogs serve as the built-in data
  source.
- Layer tree with search, visibility cascade, per-layer styling (opacity, point
  size, color schemes, classification filter) and zoom to extent.
- Map tools: ruler, area and volume measurement, basemap switcher, feature
  inspection, orientation reset.
- Extension model: modules register widgets, layer tools, map tools, protocols,
  source adapters, basemaps, settings and translations. See `docs/extending.md`
  and `docs/api/`.
- `settingsOverrides` embed option: per-deployment setting values with validation.
- Widget workspace whose layout and z-order persist for the session.

[Unreleased]: https://github.com/dsefimov/mapdeck/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/dsefimov/mapdeck/compare/v0.7.0...v1.0.0
