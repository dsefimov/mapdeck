# AGENTS.md

## Project Overview

Mapdeck is a browser-based geospatial application framework: map rendering, layer
management, data access, and an extension system for data sources, tools and
widgets. It ships as an npm package (`mapdeck`); this repository also contains a
demo application built on the same public API.

Key documents: [docs/architecture.md](docs/architecture.md) (system overview),
[docs/glossary.md](docs/glossary.md) (domain terms), [docs/adr/](docs/adr/)
(architecture decisions and their rationale), [docs/extending.md](docs/extending.md)
(building modules, tools and protocols), [CONTRIBUTING.md](CONTRIBUTING.md)
(commands and contribution process).

## Architecture

The core (`src/core/`) is layered, and dependencies point one way:

- `lib/` — pure technical primitives; no framework imports, no domain words.
- `common/` — technical subsystems: locale, settings, the widget system, async state.
- `ui/` — generic React components; no stores, no domain knowledge.
- `contracts/` — shared types and ports, including the extension-context family.
- `shell/` — the store provider glue.
- `domain/` — bounded contexts: `layer-tree`, `map`, `protocols` (one folder per
  data protocol).
- `src/app/` — the composition root: the store graph, bootstrap, the embed facade
  and the public barrels.

Import rules are enforced by the ESLint zones in `eslint.config.js`. The essentials:

- Layers import only downward; the full edge list is in `eslint.config.js`.
- Extensions (`src/widgets`, `src/layer-tools`, `src/map-tools`, `src/modules`)
  import shared types from `@core/contracts`, never from `src/app`, and never from
  each other. The core never imports from the extension folders.
- Cross-domain communication goes through interfaces in `contracts`. The known
  exceptions are recorded in ADRs: the raw `maplibregl.Map` handed to map tools
  (ADR-0006) and deck.gl types in the overlay port (ADR-0010).
- External systems (deck.gl, MapLibre, STAC) sit behind ports in `contracts`;
  implementations live in their domains, wiring happens in `src/app`.

## Development Guidelines

- Business logic lives in pure modules (`logic/` directories) and is covered by
  colocated tests. MobX stores hold state, track loading/error state and call the
  operations; they do not implement rules.
- React components render state and call store methods. Interaction orchestration
  lives in controller classes obtained from the state store; components stay thin.
- Extension registration is explicit and per kind (see `src/app/bootstrap.ts` and
  [docs/extending.md](docs/extending.md)). Registries throw on duplicate ids unless
  an explicit `{ override: true }` is passed.
- Avoid unnecessary abstractions and dependencies. A new external dependency needs
  a reason that survives review.
- Do not use auto-replacement commands for editing files; edit with the
  file-editing tool.

## Verification

- `npm run lint` — TypeScript check + ESLint.
- `npm run test` — the Vitest suite.
- `npm run build` — production build; `npm run build:lib` — the library build.
- `npm run test:e2e` — Playwright smoke against live demo sources; run it for
  user-facing changes.
- Git hooks run lint + test on commit and the build on push.

## Architecture Decisions

Create or update an ADR in `docs/adr/` when a change introduces a significant
architectural decision, changes a public contract, or adds a major dependency.
An ADR records status, date, the problem (context), the decision, and its
consequences. Invented alternatives are worse than a short honest record: list
alternatives only when they were actually considered.
