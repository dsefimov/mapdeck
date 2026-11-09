# ADR-0016: Embed settings overrides

Status: Accepted · Date: 2026-10-13

## Context

The embedding facade (`createMapdeck`) serves prebuilt-library consumers that must
point the map at their own deployment's data sources. Settings — e.g.
`layer-tree.data-source-url` — are registered by extensions during `bootstrap()`; the
first tree fetch runs in `rootStore.initialize()` immediately after. From outside the
boot there is no correct moment to inject a value: before boot the setting does not
exist yet (`setSetting` returns `notfound`); after boot the default-address fetch has
already failed into `initError`; and `restart()` builds a fresh store that re-reads
defaults. The injection point is inside `bootstrap()`: after the last registration
wave, before `initialize()`.

Settings follow the common registration policy (ADR-0005): a colliding id throws
unless the owner re-declares its batch with `{ override: true }`. An owner's override
replaces the owner's own settings — per-deployment *values* are not overrides but data,
and `settingsOverrides` is their channel.

## Decision

The facade option `settingsOverrides` carries a generic map `settingId → value` as
deployment data, alongside `lazPerfWasmUrl` rather than as module content. Bootstrap
applies it through the ordinary validating setter (`SettingsStore.setSetting`) after
all registrations and before the first fetch; every rejected id (unknown, wrong type,
out of range, outside select options) is collected into one error that surfaces through
`initError`, failing initialization visibly. The full public behavior — shape,
precedence, validation, restart — is documented in
[docs/api/configuration.md](../api/configuration.md).

A generic dictionary, not a narrow `dataSourceUrl` option: the core carries no
constants naming a concrete extension (ADR-0004 contract hygiene), so the facade must
not hardcode knowledge of the layer-tree setting; the same mechanism can support
additional deployment-specific values (e.g. a deployment's default basemap).

## Consequences

- Unknown ids and invalid values fail initialization with the error screen, consistent
  with the duplicate-id policy.
- `restart()` re-applies the overrides: it re-runs `bootstrap()` with the same options.
- Overrides reach whatever is registered by the end of boot, including consumer-module
  settings.
- The facade gains no per-setting shortcuts: a value already expressible as a setting
  travels through this dictionary.
