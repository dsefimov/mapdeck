## Context

`store-architecture` is a companion to `state-management`. Where `state-management` defines the rules (lifecycle, configuration, cross-store access patterns), `store-architecture` defines the map (what exists, where it lives, when to use it). This split keeps `state-management` focused on contracts and `store-architecture` focused on discoverability.

## Goals / Non-Goals

**Goals:**
- Provide a single entry point for developers asking "where do I put my state?"
- Document per-store responsibilities at a glance (one row per store)
- Define the three local-store patterns and when to use each
- Establish a maintenance contract: adding a store means updating this document

**Non-Goals:**
- Replacing per-capability design docs — each store's internal design belongs to its owning capability (e.g., `LayerTreeStore` internals belong to `layer-system/design.md`)
- Documenting adapter factories in depth — they are registries, not stores; listed for completeness only

## Decisions

### Catalog format: tables, not prose

Each global store is documented as one row in a responsibility table with columns: Store, Responsibility, Key state, Key methods, Depends on, Consumed by. This format was chosen over prose descriptions because:

- **Scannability**: A developer can scan the "Responsibility" column to find the right store in seconds
- **Consistency**: Every store entry has the same shape — no risk of some stores being documented more thoroughly than others
- **Maintainability**: Adding a store means adding one row. The template is self-evident

**Alternative considered**: Per-store subsections with prose. Rejected because it encourages inconsistent depth and makes comparison across stores harder.

### Adapter factories listed separately

`LayerAdapterFactory`, `AttributeAdapterFactory`, `SourceAdapterFactory`, and `LayerConfigRegistry` are not MobX stores — they are plain registries with no observable state. They appear in `RootStore` for dependency injection convenience. The spec lists them in a separate table to avoid confusing them with MobX stores.

### Store selection guide: organized by task, not by store

The selection guide answers "I need to do X — which store handles that?" It is organized by task category (layer data, user preferences, widget state, etc.) rather than by store name. This matches how developers actually search: they know their goal, not the store name.

### Local-store patterns: documented here, not duplicated

Three local-store patterns exist (widget-local, tool-owned, inline observable). The `state-management` spec defines them as requirements. `store-architecture` references them with usage guidance. No duplication — `state-management` owns the rules, `store-architecture` owns the map.

### Maintenance contract

When a new global store is added to `RootStore`:
1. Add a row to the responsibility table in `store-architecture/spec.md`
2. Add an entry to the relevant task category in the selection guide
3. If the store introduces a new local-store pattern, update the classification section

When a store is removed or renamed, the corresponding row and guide entries must be updated.

## Risks / Trade-offs

- **Catalog staleness** — If a developer adds a store but forgets to update the spec, the catalog becomes incomplete. Mitigation: the spec includes the scenario "Every store is listed" which can be verified by comparing against `RootStore`'s constructor fields.
- **Table verbosity** — The responsibility table has 10 rows and 6 columns. For small screens or diffs this can be unwieldy. Mitigation: the table is markdown-native; tools handle it. No plans to split.
- **Overlap with per-capability specs** — Some store details appear both here and in capability specs. Mitigation: `store-architecture` focuses on "what it does and when to use it"; capability specs focus on "how it fulfills its contract."
