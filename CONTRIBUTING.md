# Contributing

## Git Workflow

- **`main`** — stable releases, tagged with semver (`v1.0.0`, etc.)
- **`devel`** — active development branch, all changes land here
- Feature branches: branch off `devel`, merge back via PR or direct push. Name them `feat/<slug>`, `fix/<slug>`, `refactor/<slug>`.

## Local development

1. Clone the repository.
2. `npm install` — also installs the git hooks (below).
3. `npm run dev` — the demo application runs on the public entries; sample data
   (a STAC catalog, basemap configs, the laz-perf decoder) ships in `public/`.

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run lint` | `tsc --noEmit` + ESLint (`--max-warnings=0`) |
| `npm run test` | Vitest, single run |
| `npm run build` | TypeScript check + production build |
| `npm run build:lib` | library build: the prebuilt ESM package into `dist/` |
| `npm run test:e2e` | Playwright E2E smoke against live demo sources |
| `npm run license-check` | production dependency license allowlist |

### Testing

Unit and store logic run with Vitest (`npm run test`, colocated `*.test.ts`).
The E2E smoke suite lives in `tests/` and drives the real app in Chromium:

```sh
npx playwright install chromium   # once, after cloning
npm run test:e2e
```

The suite boots the dev server itself, walks the demo catalog — layer
toggles, point-cloud streaming over range requests, measurements on the
cloud, feature info, basemap switching, widget grid and menu keyboard
navigation — and fails on any console error outside the known-harmless
list (`tests/helpers/console.ts`). It runs against live demo sources, so it
needs network access and takes a few minutes; it is deliberately not
part of the git hooks.

### Git hooks

`pre-commit` runs lint + test, `pre-push` runs the build; `npm install`
installs them (`scripts/install-git-hooks.mjs`). `--no-verify` is the WIP
escape hatch.

## Commit Messages

Follow [conventional commits](https://www.conventionalcommits.org/):

```
<type>: <description>
```

Types:

| Type | When |
|------|------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring, no behavior change |
| `chore` | Tooling, dependencies, config |
| `docs` | Documentation only |

Keep the subject line under 72 characters. Use present tense, imperative mood (`add`, not `added` or `adds`). One logical change per commit — a completed stage/phase is a natural boundary; no WIP commits.

## Pull requests

One logical change per PR. For a change that adds an ADR, the PR description states
why no existing ADR can host the decision; a maintainer reviews ADR-bearing changes
before merge. There is no formal code of conduct beyond
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — be respectful, critique code rather
than people.

## Releasing

1. In `CHANGELOG.md`, rename the `[Unreleased]` section to `## [X.Y.Z] - YYYY-MM-DD`
   and add the compare link at the bottom.
2. Bump `version` in `package.json` and refresh the lockfile
   (`npm install --package-lock-only`).
3. Commit, tag `vX.Y.Z`, push the commit and the tag.
4. `npm publish` — `prepack` runs lint, the test suite and the library build;
   publish from a clean checkout of the tag.

## Workflow

The full workflow (plan → implement → ADR check → gate) is defined in
[AGENTS.md](AGENTS.md), including the exemption for trivial changes.

## Documentation

Documentation lives alongside the code:

| Doc | Purpose |
|---|---|
| `AGENTS.md` | Rules and workflow for contributors and AI agents |
| `docs/architecture.md` | System overview: layers, data flows, stores |
| `docs/glossary.md` | Domain terms |
| `docs/adr/` | Architectural decisions with rationale |
| `docs/extending.md` | Building modules, tools and protocols |

Docs explain "why" and context only; the writing rules live in
[AGENTS.md](AGENTS.md). All documentation is in English.
