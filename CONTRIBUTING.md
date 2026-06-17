# Contributing

## Git Workflow

- **`main`** — stable releases, tagged with semver (`v0.5.0`, etc.)
- **`devel`** — active development branch, all changes land here
- Feature branches: branch off `devel`, merge back via PR or direct push

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

Keep the subject line under 72 characters. Use present tense, imperative mood (`add`, not `added` or `adds`).

## Spec-Driven Development

All features, refactors, and architectural decisions must go through the **OpenSpec** workflow:

1. **Spec exists** — check `openspec/specs/<capability>/` for the relevant contract
2. **No spec** — create a change: `/opsx:propose <feature-name>`
3. **Review artifacts** — proposal, spec, design, tasks
4. **Implement** — `/opsx:apply`

Never write code without a corresponding spec unless it's a hotfix.

Specs live in `openspec/specs/`. Each module has a `spec.md` (system contract in Given/When/Then format) and `design.md` (architecture decisions with rationale).
