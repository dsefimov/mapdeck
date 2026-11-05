# AGENTS.md

Mapdeck is a browser-based geospatial application framework that ships as the
npm package `mapdeck`; this repository also contains a demo application built
on the same public API. Read
[docs/architecture.md](docs/architecture.md) before changing `src/core/`, and
[docs/extending.md](docs/extending.md) plus [docs/api/](docs/api/) before
changing anything that affects extension authors. Domain terms are defined in
[docs/glossary.md](docs/glossary.md); decisions and their rationale are in
[docs/adr/](docs/adr/). Commands and the contribution process are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Rules that are not enforced automatically

- Domain logic lives in pure modules (`logic/` directories) with colocated
  tests; MobX stores hold observable state and call those operations. React
  components render state and call store methods — interaction orchestration
  belongs in controller classes obtained from the state store.
- Cross-domain communication goes through interfaces in `src/core/contracts`;
  the known exceptions are recorded in ADR-0006 (the raw `maplibregl.Map`
  handed to map tools) and ADR-0010 (deck.gl types in the overlay port).
- Extension registration is explicit and per kind (see `src/app/bootstrap.ts`).
  Registries throw on duplicate ids unless an explicit `{ override: true }` is
  passed.
- A new external dependency needs justification in review: what it is used for
  and why an existing dependency or a small local implementation does not fit.
  Dependencies that change the architecture, a public contract or the package
  surface also need an ADR (ADR-0020).

The full dependency rules between layers are enforced by the ESLint zones in
`eslint.config.js` — do not add imports that the zones reject.

## Verification

| Command | Purpose |
|---|---|
| `npm run lint` | TypeScript check + ESLint |
| `npm run test` | Vitest suite |
| `npm run build` | production build |
| `npm run build:lib` | library build into `dist/` |
| `npm run test:e2e` | Playwright smoke against live demo sources; run it for user-facing changes |

Git hooks run lint + test on commit and the build on push.

## Architecture decisions

Create or update an ADR in `docs/adr/` when a change introduces a significant
architectural decision, changes a public contract, or adds a major dependency.
An ADR records status, date, the problem (context), the decision, and its
consequences; list alternatives only when they were actually considered.
