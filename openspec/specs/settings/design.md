## Context

The portal has a centralized settings system. Extensions (widgets, map tools) declare their configurable parameters as settings; `SettingsStore` manages values, groups them by owner, and surfaces them for the settings UI. Every extension developer who adds configurable options needs to understand the settings contract.

## Goals / Non-Goals

**Goals:**
- Document the four setting types and their metadata structures
- Document auto-registration flow through widget and map tool stores
- Document `SettingsStore` API and type-safe accessors
- Document the settings UI rendering contract
- Explicitly state the no-persistence limitation

**Non-Goals:**
- Adding persistence (localStorage, server sync) — tracked in PLAN.md
- Specifying which specific settings each extension must declare
- Changing any runtime setting behavior

## Decisions

### Discriminated union over single flat type

`SettingMetadata` is a discriminated union with `type` as the discriminator, rather than a single interface with optional fields.

**Why**: A single type with optional `min`, `max`, `step`, and `options` would require runtime checks to determine which fields are valid. The discriminated union makes it impossible to declare contradictory settings (e.g., a `"string"` type with `min` and `max`). TypeScript narrows on the `type` field, giving compile-time safety.

**The four variants and their unique fields:**

| Type | Unique fields | defaultValue type |
|------|---------------|-------------------|
| `"string"` | (none) | `string` |
| `"number"` | `min?`, `max?`, `step?` | `number` |
| `"select"` | `options: SettingOption[]` | `string` |
| `"boolean"` | (none) | `boolean` |

**Common fields**: All variants share `id: string` and `label: string`.

**Alternatives considered**: Single interface with `type` and optional fields — rejected because it allows `{ type: "string", min: 0 }` which is nonsensical.

Source: `src/core/framework/types/framework/settings.ts`

### Auto-registration over manual registration

Settings are registered automatically when the owning extension is registered — no separate `settingsStore.registerSetting()` call needed.

**Flow for widgets:**
```
catalogStore.registerWidget(widgetDef)
  └─ for each setting in widgetDef.settings:
       └─ settingsStore.registerSetting(widgetDef.id, widgetDef.name, setting)
```

**Flow for map tools:**
```
mapToolStore.registerTool(tool)
  └─ for each setting in tool.settings:
       └─ settingsStore.registerSetting(tool.id, tool.name, setting)
```

**Why**: Manual registration would require extension developers to remember an additional step. Auto-registration guarantees settings are always registered when the extension is. The extension definition is the single source of truth.

**Alternatives considered**: Separate `registerSetting()` call per setting — rejected because it creates a synchronization risk (extension registered but settings forgotten).

### Owner-based grouping

Settings are grouped by owner (extension id) for UI presentation. Each owner appears as a titled section in the settings UI.

**Why**: Grouping by owner makes the settings UI navigable when many extensions have settings. The owner's `name` field provides a human-readable section header.

Source: `src/core/framework/store/settings/SettingsStore.ts` — `allSettingsGrouped` computed

### Type-safe accessors

`SettingsStore` provides typed getters (`getStringSetting`, `getNumberSetting`, `getBooleanSetting`) rather than a single generic `getSetting(id)` returning `unknown`.

**Why**: Typed getters eliminate the need for consumers to cast or narrow the return type. The getter name encodes the expected type. If a consumer calls `getNumberSetting` on a string setting, the runtime behavior is predictable (returns the stored number value, or undefined if not a number setting).

**There is no `getSelectSetting`** — select values are strings, accessed via `getStringSetting`.

### Validation on set

`setSetting(id, value)` validates the value against the setting's declared type. Invalid types are rejected. Number values outside `min`/`max` are clamped. Select values not in `options` are rejected.

**Why**: Rejecting invalid values early prevents downstream components from receiving unexpected data. Clamping rather than rejecting for out-of-range numbers provides a better experience for slider-based UI where intermediate drag values might temporarily exceed bounds.

Source: `src/core/framework/store/settings/SettingsStore.ts` — `setSetting()`

### Reset to defaults

Settings can be reset individually or per-owner. Reset restores the declared `defaultValue`, not a hardcoded blank value.

**Why**: Per-owner reset enables a "Reset all settings for this widget" button in the UI. Individual reset enables per-field restore. The `defaultValue` from the extension definition is the single source of truth for what "default" means.

### In-memory only, no persistence

Settings are stored in a MobX observable map. On page refresh, all values revert to defaults.

**Why**: The portal currently has no backend or localStorage integration for settings. This is a known limitation, documented explicitly so extension developers don't build features that depend on persistence.

**Risk**: A user who customizes 10 settings loses all changes on refresh. Mitigation: the limitation is clearly documented; persistence is tracked in PLAN.md.

## Directory

```
src/core/
├── framework/
│   ├── types/framework/settings.ts         # SettingMetadata union, RegisteredSetting, SettingsGroup
│   └── store/settings/SettingsStore.ts     # registerSetting, get*/setSetting, reset*, allSettingsGrouped
│
UI:
src/widgets/settings/SettingsGroup.tsx       # Settings rendering component
```

## Risks / Trade-offs

- **No cross-owner setting deduplication**: If two extensions use the same setting id, the last registration wins. Mitigation: convention uses extension id as prefix (e.g., `"my-widget.size"`).
- **In-memory only**: Settings don't survive page refresh. Mitigation: documented limitation; persistence in PLAN.md.
- **No reactive subscriptions to individual setting changes**: Components that depend on a specific setting must read the entire store and react to any change. Trade-off: simpler than per-setting observability; acceptable for current usage patterns.
