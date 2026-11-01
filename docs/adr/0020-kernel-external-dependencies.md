# ADR-0020: Kernel external dependencies — one policy, the `lib` import rule

## Context

The kernel runs on a dozen external packages: two rendering engines, a
point-cloud stack, geo math, a grid layout, a tile protocol, projections, a
LAZ decompressor. Three groups carry architectural records of their own —
the engines (ADR-0010), the point-cloud stack (ADR-0011/0012), the host
singletons (ADR-0019); the rest sit in the manifest with no record at all,
and the path for a new package is undefined. The dependency graph's
"`lib` imports nothing" adds a rule to square: the geo math in `lib/geo`
(`spatial.ts`, `delaunay2d.ts`) genuinely needs external code.

## Decision

**One policy for every external package the kernel carries.**

- **Engines behind ports** — `maplibre-gl`, `@deck.gl/*`: the kernel knows
  them through the contracts of ADR-0010; their packaging (dependencies,
  not peers) is ADR-0019.
- **The point-cloud stack** — `copc`, `rbush`, `laz-perf`, the engine-side
  `proj4`: the streaming and data-port architecture of ADR-0011/0012 is
  their record.
- **Host singletons as peers** — `react`, `react-dom`, `mobx`,
  `mobx-react-lite`: ADR-0019.
- **Geo math on vetted packages** — `delaunator` (the triangulation under
  the TIN volume measurement, `lib/geo/delaunay2d.ts`), `@turf/distance` +
  `@turf/helpers` (`lib/geo/spatial.ts`), `@turf/area`
  (`map-tools/area-measure/logic/area.ts`). Hand-rolled geodesics and
  triangulation are rejected: haversine edge cases and robust-predicate
  pitfalls fail quietly, and a wrong measurement is worse than a dependency.
- **Single-purpose utilities** — `react-grid-layout` (the widget grid),
  `pmtiles` (the map domain's tile protocol), `proj4` in WMS feature info:
  small, permissively licensed; this policy is their record.

The license-check allowlist (`npm run license-check`) is the enforcement
common to all groups: small, permissive licenses only.

**A new package is an ADR.** The trigger list in `AGENTS.md` already demands
it; this record sets the precedent's shape — name the package, name the
sites, name the license, or name the architectural record it rides.

**"`lib` imports nothing" means project layers and frameworks.** The rule
has two precise parts, and the eslint zone for `lib` enforces exactly them:
no upper layer of this codebase (`@core/*` above lib, the app, the
extensions) and no framework or engine (React, MobX, maplibre, deck.gl, the
grid library). External packages are a third category: permitted, but each
one is an ADR-triggered decision — the absolute wording is the high bar
that keeps utility creep out of the bottom layer. Placement still follows
the move test: a `lib/` file compiles in a fresh project that installs its
own dependencies — geo math passes, so geo math lives in `lib/geo`.

Why a new ADR rather than amending 0011/0014/0019: 0011 is COPC streaming,
0014's dependency policy is scoped to UI rendering and interaction, 0019
governs packaging against hosts — which external code may enter the kernel
is hosted nowhere else.

## Consequences

- No dependency "just exists": every package sits under its architectural
  record or under this policy.
- A new external package anywhere in the kernel requires an ADR.
- The dependency-graph line in `AGENTS.md` and the `lib` entry in
  `docs/architecture.md` carry the precise reading — layers and frameworks,
  not the world.
- The policy covers the manifest as shipped: entries without imports in the
  source tree are removed, not covered.
