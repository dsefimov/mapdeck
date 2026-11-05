# Contributing

## Git workflow

The current workflow (not a permanent policy — change this file if it changes):

- **`main`** — stable releases, tagged with semver (`v1.0.0`, etc.)
- **`devel`** — active development branch, all changes land here
- Feature branches: branch off `devel`, merge back via pull request or direct push.
  Name them `feat/<slug>`, `fix/<slug>`, `refactor/<slug>`. Use a pull request when
  the change benefits from review.

## Local development

1. Clone the repository. Node.js ≥ 20.11 is required (`engines` in `package.json`).
2. `npm install` — also installs the git hooks (below).
3. `npm run dev` — the demo application runs on the public entries; sample data
   (a STAC catalog, basemap configs, the laz-perf decoder) ships in `public/`.

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run lint` | `tsc --noEmit` + ESLint (`--max-warnings=0`) |
| `npm run test` | Vitest, single run |
| `npm run build` | TypeScript check + production build (demo app) |
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

The suite boots the dev server itself and walks the demo catalog — layer toggles,
point-cloud streaming over HTTP range requests, measurements on the cloud, feature
info, basemap switching, widget grid and menu keyboard navigation. It fails on any
browser console error outside the known-harmless patterns (missing demo favicon and
Chrome's `ERR_CACHE_OPERATION_NOT_SUPPORTED` on ranged responses), listed with their
reasons in `tests/helpers/console.ts`. The suite runs against live demo sources, so it
needs network access and takes a few minutes; it is not part of the git hooks.

### Accessibility checks

Verify the keyboard paths that the UI implements — menu navigation (arrow keys,
Home/End, Escape), listbox selects, the point-size slider — before and after changing
interactive components; `tests/keyboard.spec.ts` and `tests/layer-tools.spec.ts` cover
them in E2E. Do not document accessibility behavior the implementation does not have.

### Git hooks

`pre-commit` runs lint + test, `pre-push` runs the build; `npm install` installs them
(`scripts/install-git-hooks.mjs`). Git's `--no-verify` flag bypasses the hooks; use it
for intermediate work — final commits should pass the hooks.

## Commit messages

Follow [conventional commits](https://www.conventionalcommits.org/):

```
<type>: <description>
```

Types in use:

| Type | When |
|------|------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `perf` | Performance improvement |
| `refactor` | Code restructuring, no behavior change |
| `chore` | Tooling, dependencies, config |
| `docs` | Documentation only |

Keep the subject line under 72 characters where possible. Use present tense,
imperative mood (`add`, not `added` or `adds`). Keep commits focused — one logical
change per commit.

## Pull requests

Keep pull requests focused on a single logical change. A change that introduces a
significant architectural decision, changes a public contract, or adds a major
dependency includes an ADR (the criteria are in [AGENTS.md](AGENTS.md)). Conduct is
covered by the [code of conduct](CODE_OF_CONDUCT.md).

## Releasing

1. In `CHANGELOG.md`, rename the `[Unreleased]` section to `## [X.Y.Z] - YYYY-MM-DD`
   and add the compare link at the bottom (keep the `[Unreleased]` link).
2. Bump `version` in `package.json` and refresh the lockfile
   (`npm install --package-lock-only`).
3. Commit, tag `vX.Y.Z`, push the commit and the tag; the tag and the release commit
   point at the same commit.
4. `npm publish` — `prepack` runs lint, the test suite and the library build.
   Publishing is manual; publish from a clean checkout of the tag.
5. Verify the package as a consumer, from the packed tarball:
   - `npm pack` and inspect the tarball: `dist/` present, `mapdeck.css` and
     `laz-perf.wasm` included, no demo-only files.
   - Install the tarball into a clean minimal React app; resolve `mapdeck`,
     `mapdeck/contracts`, `mapdeck/ui`, `mapdeck/utils`, `mapdeck/styles.css`,
     `mapdeck/laz-perf.wasm`; run its TypeScript build against the shipped
     declarations, and compile the code examples from `docs/extending.md`
     against them.
   - Smoke-test the installed package in a browser: boot, layer tree, one raster
     layer, one point cloud; check the console.
   - Confirm `npm run license-check` passes.

## Documentation

Documentation lives alongside the code:

| Doc | Purpose |
|---|---|
| `AGENTS.md` | Orientation for coding agents and contributors |
| `docs/architecture.md` | System overview: layers, data flows, stores |
| `docs/glossary.md` | Domain terms |
| `docs/extending.md` | Building modules, tools and protocols (how-to) |
| `docs/api/` | Public references: configuration, lifecycle, protocols, extensions |
| `docs/adr/` | Architectural decisions with rationale |

All documentation is in English. Style principles:

- Describe responsibilities, dependencies and constraints as they are; do not
  proclaim principles or invent terminology.
- Use standard technical terms and concrete verbs: implements, registers,
  resolves, creates, manages, validates, exposes.
- Use emphatic words ("never", "always", "only", "by design") only when they state
  a real constraint.
- Keep numbers, thresholds and algorithms in the code and its tests; documentation
  names the module and the reason.
- An ADR records the problem, the decision and its consequences — not the
  implementation.
- The public API references in `docs/api/` own the current contract; other documents
  link there instead of restating it.
