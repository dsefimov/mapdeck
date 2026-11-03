# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First public release.

- Embeddable ESM library: `createMapdeck`, `MapdeckRoot`, entries `mapdeck`,
  `mapdeck/contracts`, `mapdeck/ui`, `mapdeck/utils`, `mapdeck/styles.css`,
  `mapdeck/laz-perf.wasm`.
- Data protocols: WMS, XYZ, COG, COPC point clouds, vector tiles (PMTiles), tiled
  GeoJSON, WFS, OGC API Features; STAC catalogs as a data source.
- Layer tree with search, visibility cascade, per-layer styling and zoom to extent;
  attribute tables and feature info.
- Map tools: ruler, area, volume, basemap switcher, feature inspection, orientation
  reset.
- Extension model: modules register widgets, layer tools, map tools, protocols,
  source adapters, basemaps, settings and translations. See `docs/extending.md`.
- `settingsOverrides` embed option for per-deployment setting values.

[Unreleased]: https://github.com/dsefimov/mapdeck/commits/main
