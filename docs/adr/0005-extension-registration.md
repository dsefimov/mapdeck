# ADR-0005: Extension registration and initialization

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

Then the built-in basemap configurations (`registerBasemaps`). Basemaps are map
infrastructure, not tools — previously this work was buried inside the map-tools step,
which made the step do several unrelated jobs. The step is conditional: whether the box
ships with built-in basemaps at all is assembly policy (the `builtinBasemaps` option,
the same authority as the default source type). A module registers its own basemaps —
and may replace a built-in by id with the explicit override — through the module
context; everything a config needs on the way in (validation, style-Url fetch, the
duplicate policy, the select-setting repair) lives in the store's registration path,
shared by both channels. Hiding a single built-in without replacing it is deliberately
unsupported — no consumer has needed it, and it would be removal, which the model does
not have.

Per-stand basemap tile retuning without a rebuild, previously a runtime-config
parameter rewriting the baked tiles, is now module content: the consumer's module
registers (or overrides) configs pointing at its own tile cache. Module unregister was
rejected — the context reference outlives bootstrap, so an assembly-only unregister
would in fact be a runtime API, and without an ownership ledger any module could
remove any other module's or the built-in registrations. Passing a basemap list as a
constructor option was rejected for duplicating the module channel; shipping no
built-in set at all was rejected for losing the batteries-included default.

Then the data protocols and feature providers (`registerProtocols`). Providers belong to
the protocols domain; previously they were also registered inside the map-tools step,
which is why that step mixed three domains at once.

Then the external modules (`registerModules`), executed in the order of the module array.
Modules are last because they may register extensions of any kind and link existing tools
to their protocols — they need all built-in registries populated first. The final step is
the layer-tree fetch and `initialized`: the fetch goes last because it depends on source
adapters registered by modules.

A failure in any step surfaces through `initError` (see ADR-0003) and the whole sequence
is retried.

**The default source adapter is assembly policy.** Which source adapter serves when no
type is named is decided by the application composition: the default source type is a
build-time constant of the assembly (the app config in `src/app/`), and bootstrap
applies it after modules have registered their adapters. A deployment that names no
default fails initialization — implicit registration order must not decide (the same
rule `SourceAdapterFactory.get()` already follows) — and a named type with no registered
adapter fails initialization too, visibly through `initError`: an empty tree must be a
source's answer, never a wiring accident. A module cannot capture the global default —
`setDefault` is not part of the registration context (ADR-0004).

**Duplicate policy.** Registries throw on a duplicate id — the extension set is fixed at
build time, so an accidental duplicate is a programming error caught at startup, not a
silent conflict. A deliberate replacement is the extension mechanism for changing base
behavior: registering with `{ override: true }` replaces the existing entry and logs a
warning. The override is explicit and visible because silent replacement would make
assembled behavior depend on registration order. Grouped registries (protocol→tool
links) are a no-op on a duplicate within the same group — linking the same tool to the
same protocol twice is harmless, while the same id in different groups is allowed. The
policy covers every replacement-capable registration surface, `SourceAdapterFactory`
and basemap configs included: a module replacing a base adapter or a built-in basemap
does it with the same explicit override, never by out-registering it. An overridden
basemap drops its stale health status and re-applies when the replaced id was the
active one. Register-once surfaces — settings, translations — throw
on duplicates without an override path: their entries are declared once at bootstrap,
so a collision is always a programming error with nothing legitimate to replace.

**Retry-safe registration.** Every bootstrap attempt registers into empty registries — a
failed attempt leaves no partial registrations behind, so retry is safe by construction.

**Single access point for registries.** Extension registries live on `RootStore`
(`protocolRegistry`, `sourceAdapterFactory`, feature providers), consistent with the
service-locator contract of ADR-0002. No module-level singleton registries.

## Consequences

- A duplicate id fails startup and shows the error screen with retry — the failure is
  loud by design.
- Adding an extension requires touching exactly one `register*.ts` file.
- Each step registers one concern; an extension's cross-cutting registrations (panel
  widgets, translations) happen inside its own routine, not in a foreign step.

