# ADR-0016: Embed settings overrides — host-declared setting values

## Context

The embedding facade (`createMapdeck`) serves prebuilt-library consumers that
must point the map at their own deployment's data sources. Settings — e.g.
`layer-tree.data-source-url` — are registered by extensions during
`bootstrap()`; the first tree fetch runs in `rootStore.initialize()`
immediately after. From outside the boot there is no correct moment to inject
a value: before boot the setting does not exist yet (`setSetting` returns
`notfound`); after boot the default-address fetch has already failed into
`initError`; and `restart()` builds a fresh store that re-reads defaults. The
only window is inside `bootstrap()`, between the last registration wave and
`initialize()`.

Settings are register-once without an override path (ADR-0005), so a consumer
module cannot re-register a built-in setting either — value injection is the
only channel for per-deployment setting values.

## Decision

The facade option `settingsOverrides` carries a generic map
`settingId → value` as deployment data — the same authority as
`lazPerfWasmUrl`, not module content. Bootstrap applies it through the
ordinary validating setter (`SettingsStore.setSetting`) after all
registrations and before the first fetch; every rejected id (unknown, wrong
type, out of range, outside select options) is collected into one error that
surfaces through `initError`, failing initialization visibly.

Generic dictionary, not a narrow `dataSourceUrl` option: the kernel carries no
constants naming a concrete extension (ADR-0004 contract hygiene), so the
facade must not hardcode knowledge of the layer-tree setting; the same
mechanism serves any future deployment value (e.g. a stand's default basemap).

Why a new ADR rather than amending an existing one: ADR-0004 governs the
extension shape and its context (no new extension point appears here),
ADR-0005 governs registration order and the duplicate policy (no registration
semantics change — the override reuses the ordinary setter). This decision is
about the embed facade's option surface and its application window — a
concept no existing ADR hosts.

## Consequences

- Unknown ids and invalid values fail initialization with the error screen —
  a misconfigured deployment is loud, consistent with the duplicate-id policy.
- `restart()` re-applies the overrides for free: it re-runs `bootstrap()` with
  the same options.
- Overrides reach whatever is registered by the end of boot, including
  consumer-module settings — the last wave is the deadline.
- The facade gains no per-setting shortcuts: a value already expressible as a
  setting travels through this dictionary.
