# ADR-0005: Extension registration and initialization

Status: Accepted · Date: 2026-09-22

## Context

The app assembles itself at startup: built-in widgets, tools and protocols are registered
first, then external modules, and only after that does the UI render. Four properties of
this assembly are not visible from any interface, so they are recorded here: the extension
set must be resolved deterministically, without discovery that depends on filesystem
scanning; a duplicate registration must fail loudly instead of being silently tolerated;
a failed assembly must be retryable without leaving the system half-assembled; and no
consumer may observe a registry before it is fully populated.

## Decision

**Explicit registration.** Every extension is listed explicitly in a per-kind
`register*.ts` file (`registerWidgets`, `registerTools`, `registerMapTools`,
`registerBasemaps`, `registerProtocols`, `registerModules`), invoked in a visible sequence
by the app bootstrap. No `import.meta.glob`, no filesystem scanning, no decorators, no
side-effect imports.

Auto-discovery was rejected for three failure modes:

1. **Tree-shaking risk** — bundlers may drop files not statically imported.
2. **Silent skip** — forgetting an export makes the extension silently vanish.
3. **Init order** — implicit discovery makes order non-deterministic.

Decorator-based registration was rejected: it requires experimental TypeScript features
and makes registration a side effect of import.

**Fixed initialization order, one concern per step.**

The bootstrap registers extensions in a fixed sequence; each step registers one kind of
thing, so the file names tell the reader where each extension type comes from.

First the built-in widgets (`registerWidgets`), then the built-in layer tools
(`registerTools`). The layer-tool step also contains the links that bind built-in tools
to built-in protocols — the same `bindToolToProtocol` mechanism modules use — because a
tool ships together with the protocols it supports.

Then the map tools (`registerMapTools`). A map tool registers itself plus the things it
comes with: its panel widget and its translations. Those belong to the tool, so they are
registered in the same step rather than in the widget or locale steps.

Then the built-in basemap configurations (`registerBasemaps`); whether the box ships
with built-in basemaps at all is assembly policy (the `builtinBasemaps` option, the
same authority as the default source type). A module registers its own basemaps —
and may replace a built-in by id with the explicit override — through the module
context; both channels share one registration path. Hiding a built-in without
replacing it is deliberately unsupported — the model has replacement, not removal.
Per-deployment tile retuning is module content, not a constructor option.

Then the data protocols and feature providers (`registerProtocols`). Providers belong to
the protocols domain.

Then the external modules (`registerModules`), executed in the order of the module array.
Modules are last because they may register extensions of any kind and link existing tools
to their protocols — they need all built-in registries populated first. The final step
applies the embed's `settingsOverrides` (ADR-0016), then runs the layer-tree fetch and
`initialized`: the fetch goes last because it depends on source
adapters registered by modules.

A failure in any step surfaces through `initError` (see ADR-0003) and the whole sequence
is retried.

**The default source adapter is assembly policy.** The default source type is a
facade option (`MapdeckOptions.defaultSourceType`), applied after modules have
registered their adapters; the embed facade falls back to the built-in STAC adapter
when the assembly names none. A named type with no registered adapter fails
initialization visibly through `initError` — an empty tree must be a source's answer,
never a wiring accident. A module cannot capture the global default: `setDefault` is
not part of the registration context (ADR-0004).

**Duplicate policy.** Registries throw on a duplicate id — the extension set is fixed
at build time, so an accidental duplicate is a programming error caught at startup.
A deliberate replacement is explicit: `{ override: true }` replaces the entry and
logs a warning, because silent replacement would make assembled behavior depend on
registration order. The same explicit-override policy covers every
replacement-capable registration surface — `SourceAdapterFactory` and basemap configs
included. Translations and settings ride their owner's registration under the same
policy.

**Retry-safe registration.** Every bootstrap attempt registers into empty registries — a
failed attempt leaves no partial registrations behind, so retry is safe by construction.

**Registries live on `RootStore`.** Extension registries (`protocolRegistry`,
`sourceAdapterFactory`, feature providers) are fields of the root store, consistent
with the store-registry composition of ADR-0002. No module-level singleton
registries.

## Consequences

- A duplicate id fails startup and shows the error screen with retry — the failure is
  loud by design.
- Adding an extension requires touching exactly one `register*.ts` file.
- Each step registers one concern; an extension's cross-cutting registrations (panel
  widgets, translations) happen inside its own routine, not in a foreign step.

