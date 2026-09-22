# Contributing

## Git Workflow

- **`main`** — stable releases, tagged with semver (`v0.5.0`, etc.)
- **`devel`** — active development branch, all changes land here
- Feature branches: branch off `devel`, merge back via PR or direct push. Name them `feat/<slug>`, `fix/<slug>`, `refactor/<slug>`.

## Local development

Setup and first run: see [Quick Start](README.md) in the README.

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run lint` | `tsc --noEmit` + ESLint (`--max-warnings=0`) |
| `npm run test` | Vitest, single run |
| `npm run build` | TypeScript check + production build |

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

## Workflow

Every task follows a lightweight process — the source of truth is the code, not documents:

1. **Plan.** Write a task plan: scope, approach, affected files, verification steps. Plans live in `plans/` (gitignored) or any local working file outside git; they are never committed. They are working artifacts, not documentation.
2. **Implement.** Code + tests. Edge cases and business rules are documented by tests, never by prose.
3. **ADR check.** Record architecturally significant decisions as ADRs in `docs/adr/NNNN-*.md` (Context / Decision / Consequences). The complete trigger list lives in `AGENTS.md`.
4. **Gate.** `npm run lint` + `npm run test` + `npm run build` green; commit per completed stage.

## Documentation

Documentation lives alongside the code:

| Doc | Purpose |
|---|---|
| `AGENTS.md` | Rules and workflow for contributors and AI agents |
| `docs/architecture.md` | System overview: layers, data flows, stores |
| `docs/glossary.md` | Domain terms |
| `docs/adr/` | Architectural decisions with rationale |

Docs are not a separate source of truth — code, types, and tests are. Docs explain "why"
and context only. All documentation is in English.
