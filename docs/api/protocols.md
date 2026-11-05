# Protocol reference

What each built-in protocol consumes, what the server must support, and which
capabilities a layer gets. The extension-side contract (`Protocol`, `LayerAdapter`)
is in [extensions.md](extensions.md).

## Source adapters and protocols

Two different jobs:

- A **source adapter** discovers and represents a source's content: it loads the
  catalog hierarchy, classifies its **assets**, routes them through the asset mapping,
  and builds layer nodes. The built-in adapter is STAC (`type: "stac"`); a module can
  register its own or replace it ([extensions.md](extensions.md#source-adapters)).
- A **protocol** defines how one node's data is requested and rendered: raster tiles
  over MapLibre, GeoJSON through the deck.gl overlay, streamed point clouds, or an
  attribute feed.

The asset mapping decides which protocol an asset gets: priority-ordered rules claim
assets, slot fitness picks the slot. A node can carry two protocol bindings —
`renderer` (draws the map layer) and `data` (serves the attribute table).

## Capability matrix

| Protocol | Format | Rendering | Feature info (map click) | Attribute table | Styling |
|---|---|---|---|---|---|
| `wms` | OGC WMS raster | native MapLibre raster | yes — GetFeatureInfo | — | raster opacity |
| `xyz` | raster tile pyramid (`{z}/{x}/{y}`) | native MapLibre raster | — | — | raster opacity |
| `vector-tile` | Mapbox Vector Tiles | native MapLibre vector | yes — rendered features | — | layer type + colors |
| `geojson-tiled` | tiled GeoJSON | deck.gl overlay | yes — overlay picking | — | colors, line width |
| `copc` | COPC point cloud | deck.gl overlay (streamed) | yes — point picking | — | point size, color scheme, class filter |
| `wfs` | OGC WFS GeoJSON | — (data slot only) | — | yes — GetFeature | — |
| `ogc-features` | OGC API Features | deck.gl overlay | yes — overlay picking | yes — items paging | colors, line width |
| `cog` | (see note) | — | — | — | — |

`cog` is registered as a protocol but currently declares no slot fitness and no
matching rule, so no asset maps to it. It is effectively unreachable pending a
wiring decision; the raster protocols (`xyz`, `wms`) cover tiled raster sources.

PMTiles is not a protocol: `pmtiles://` URLs are handled by a scheme handler
registered with MapLibre, so tile-URL templates (`xyz`, vector sources) accept them.

## WMS

- **Endpoint**: a clean GetMap base URL; request parameters travel in the binding's
  `params` (`layers`, `styles`, `version` default `"1.3.0"`, `format` default
  `image/png`), never in the URL.
- **Server**: answers GetMap in EPSG:3857 (256×256 tiles); for feature info,
  GetFeatureInfo with `INFO_FORMAT` default `application/json` (10 s timeout).
  Cross-origin servers need CORS.
- **Feature info**: one query per visible WMS layer on map click; a pixel query
  returns the topmost JSON feature. Non-JSON responses render as a text preview.
- **Styling**: `raster-opacity`.
- **Constraints**: consecutive layers sharing base URL, version, format and opacity
  are batched into one raster source (at most 10 per group); differently-opaque
  layers never batch.

## XYZ

- **Endpoint**: a `{z}/{x}/{y}` tile URL template; optional `maxzoom` parameter.
  `pmtiles://` URLs work.
- **Server**: a standard tile server; MapLibre issues the tile requests (cross-origin
  servers need CORS).
- **Styling**: `raster-opacity`.
- **Constraints**: raster only — vector-tile assets are routed to `vector-tile`.

## Vector tiles

- **Endpoint**: a `{z}/{x}/{y}` template serving Mapbox Vector Tiles; parameters:
  `sourceLayer` (the MVT source layer, required for styling), `maxzoom`, `layerType`
  (`fill` default, `line`, `circle`, `symbol`).
- **Server**: standard MVT tile server with CORS.
- **Feature info**: rendered-feature query at the click position (properties, source
  layer, geometry type).
- **Styling**: layer type plus the vector color picker.
- **Constraints**: one layer type per layer; the `symbol` type renders the `name`
  property as its text.

## Tiled GeoJSON

- **Endpoint**: a base URL; each tile request appends `bbox=<w,s,e,n>&limit=5000`
  to the query (existing parameters are preserved). The server answers with a
  GeoJSON `FeatureCollection` (`Accept: application/geo+json`, 15 s timeout);
  anything else is ignored.
- **Feature info**: overlay picking of the drawn features.
- **Styling**: fill/line/circle colors and opacity, line width (the MapLibre-style
  paint keys are translated to deck.gl accessors).
- **Constraints**: requests at zoom ≥ 2 in steps of 2; at most 5,000 features per
  request and 50,000 per layer (oldest tiles drop first); deduplication is by
  feature id only.

## WFS

- **Endpoint**: a GetFeature URL that already carries `typeName` (and any other fixed
  parameters); there is no GetCapabilities discovery. `params.version` defaults to
  `"2.0.0"`; `CQL_FILTER` and `SRSNAME` pass through.
- **Server**: returns GeoJSON from GetFeature (`OUTPUTFORMAT=application/json`,
  20 s timeout). Paging follows the version (`STARTINDEX`/`COUNT` vs `MAXFEATURES`);
  sorting via `SORTBY`.
- **Attribute table**: yes — paging and sorting map onto GetFeature; the total count
  comes from `numberMatched` or is estimated.
- **Constraints**: serves the `data` slot only (no map rendering); requests ask for
  EPSG:4326; no spatial filter parameter is exposed.

## OGC API Features

- **Endpoint**: a collection's `/items` URL (a collection URL without `/items` gets
  it appended); paging via `offset`/`limit` (default 50).
- **Server**: returns a valid GeoJSON `FeatureCollection` (`Accept:
  application/geo+json`, 20 s timeout); `numberMatched` is honored for totals.
- **Feature info**: overlay picking of the drawn features.
- **Attribute table**: yes — table paging maps onto items paging (rate-limited to
  one request per second, at most 500 per page).
- **Styling**: fill/line/circle colors and opacity (same paint mapping as tiled
  GeoJSON).
- **Constraints**: fill/line/circle layer types only; shares the tiled-GeoJSON tile
  caps; no CRS negotiation.

## COPC (point clouds)

COPC layers stream: the file is read with HTTP range requests, decoded in a
WebAssembly worker pool, and rendered as a point cloud through the deck.gl overlay.

**Requirements:**

- **CRS**: point clouds are expected in a metric CRS. Spacing is read as meters;
  foot-based files render with over-resolved detail (≈3.3×), and a CRS declared only
  through GeoTIFF keys (no WKT) is treated as geographic. This is a documented
  degradation, not an error.
- **HTTP range requests**: the server must answer `Range` requests with partial
  content; cross-origin files need CORS. Requests carry a 30 s ceiling; at most 4
  node loads run concurrently.
- **WebAssembly**: the LazPerf decoder is fetched from a URL at runtime —
  `lazPerfWasmUrl`, default `"laz-perf.wasm"` resolved against the page. Serve the
  copy shipped at `mapdeck/laz-perf.wasm` (its version is locked to the package).
  A CSP needs `connect-src` for the file and the wasm, and `worker-src blob:` for
  the inline decode worker.
- **URL sources only** through the protocol path (no file upload UI).

**Behavior:**

- Selection follows the camera; memory is bounded by a fixed point budget
  (40,000,000 points) and a 256 MiB decoded-node cache; a screen-space error of
  1.0 px governs the level of detail. These are constants of the current engine,
  not settings.
- A failed wasm fetch or decode marks the affected nodes as errored in the tree and
  retries with exponential backoff — it does not fail initialization.
- Styling per layer: point size, color scheme (RGB / elevation / intensity /
  classification), classification visibility, opacity.

## STAC — the built-in source adapter

STAC is the data source, not a rendering protocol. The built-in `stac` module
registers a source adapter of type `"stac"` and the asset-mapping rules for its
catalog format:

- A catalog/collection hierarchy maps to the tree's groups; items map to layers.
  Collection children load through `items`/`item` links; asset-less items are
  enriched via their `self` link (batches of 5, capped at 200); item paging follows
  `next` links.
- Item assets are classified by role and MIME type into the matrix above: `wms`
  roles to WMS, `raster-tile` or a `{z}/{x}/{y}` href to XYZ, `vector-tile` roles or
  the MVT MIME to vector tiles, `geojson`/`ogc` roles to tiled GeoJSON or OGC API
  Features, `wfs`/`ogc-feature-api` roles to the data slot, point-cloud roles to
  COPC. Assets with `report`/`metadata` roles (or document MIME types) become report
  links on the node.
- The adapter is configured by the `layer-tree.data-source-url` setting; a module
  can replace it by registering an adapter under the same type with
  `{ override: true }`.
