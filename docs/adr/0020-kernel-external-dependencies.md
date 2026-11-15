# ADR-0020: External dependencies

Status: Accepted · Date: 2026-11-01

## Context

The core runs on a dozen external packages: two rendering engines, a point-cloud
stack, geo math, a grid layout, a tile protocol, projections, a LAZ decompressor.
Three groups carry architectural records of their own — the engines (ADR-0010), the
point-cloud stack (ADR-0011/0012), the host singletons (ADR-0019); the rest sit in the
manifest with no record at all, and the path for a new package is undefined. The
dependency rule "`lib` imports nothing" adds a case to square: the geo math in
`lib/geo` (`spatial.ts`, `delaunay2d.ts`) genuinely needs external code.

## Decision

**Every external package the core carries sits under a policy.**

- **Engines behind ports** — `maplibre-gl`, `@deck.gl/*`: the core knows them through
  the contracts of ADR-0010; their packaging (dependencies, not peers) is ADR-0019.
- **The point-cloud stack** — `copc`, `rbush`, `laz-perf`, the engine-side `proj4`: the
  streaming and data-port architecture of ADR-0011/0012 is their record.
- **Host singletons as peers** — `react`, `react-dom`, `mobx`, `mobx-react-lite`:
  ADR-0019.
- **Geo math on vetted packages** — `delaunator`; `@turf/area` + `@turf/helpers`
  (the area tool only, slated to move into one local metric frame). Distances are
  in-house haversine (`greatCircleDistance`): the formula is five lines pinned by
  analytic arc-length tests — equator, meridian, the antipodal `asin(1)` edge — and
  the Vincenty reference pair, which is what replaced the "vetted package" argument
  for it. Hand-rolled triangulation stays rejected: robust-predicate pitfalls fail
  quietly, and a wrong measurement is worse than a dependency.
- **Single-purpose utilities** — `react-grid-layout`, `pmtiles`, `proj4`: small,
  permissively licensed; this policy is their record.

The license-check allowlist (`npm run license-check`) is the enforcement common to all
groups: small, permissive licenses only.

**When a dependency needs an ADR.** A package requires an ADR if it changes the
architecture, a public contract or the execution model, or materially affects
package size or compatibility. The ADR records the package, its license and any
related architectural decision. An ordinary dependency goes through code review;
`npm run license-check` and the review verify its license and purpose.

**"`lib` imports nothing" means project layers and frameworks.** The rule has two
precise parts, and the eslint zone for `lib` enforces exactly them: no upper layer of
this codebase (`@core/*` above lib, the app, the extensions) and no framework or engine
(React, MobX, MapLibre, deck.gl, the grid library). External packages are a third
category: permitted with justification — a package in the bottom layer still needs a
review-approved reason. Placement follows the move test: a `lib/` file compiles in a
fresh project that installs its own dependencies — geo math passes, so geo math lives
in `lib/geo`.

## Consequences

- No dependency sits in the manifest without a record: every package belongs to an
  architectural record or to this policy.
- A dependency that changes the architecture, a public contract, the execution model or
  the package's size/compatibility requires an ADR; ordinary dependencies pass through
  code review and license-check.
- The enforced import restrictions live in the ESLint zones (`eslint.config.js`);
  `docs/architecture.md` carries the same reading — layers and frameworks, not every
  external package.
- The policy covers the manifest as shipped: entries without imports in the source tree
  are removed, not covered.
