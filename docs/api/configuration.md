# Configuration reference

Every public `createMapdeck` option, the settings system, and the `settingsOverrides`
channel. The instance lifecycle (when options are read, restart behavior) is in
[lifecycle.md](lifecycle.md); extension registration surfaces in
[extensions.md](extensions.md).

## `createMapdeck(options)`

`options` is a plain object (`MapdeckOptions`); every field is optional. Options are
read once at `createMapdeck` and re-derived on every `restart()` — they are fixed for
the instance's lifetime, so changing an option means creating a new instance.

| Option | Type | Default | Purpose and constraints |
|---|---|---|---|
| `defaultSourceType` | `string` | `"stac"` | which registered source adapter serves nodes that name none. Checked at the end of bootstrap: a type with no registered adapter fails initialization through `initError`. |
| `builtinBasemaps` | `boolean` | `true` | whether the built-in basemap set (OpenStreetMap Standard, Esri World Imagery) registers. Set `false` when a module provides its own basemaps; with none registered the map renders without a base layer and bootstrap logs a warning. |
| `lazPerfWasmUrl` | `string` | `"laz-perf.wasm"` | URL of the LazPerf WebAssembly binary (point clouds only). Resolved against the page's base URI at runtime, because the decode worker runs from an inline blob where relative URLs cannot resolve. Serve the shipped copy from `mapdeck/laz-perf.wasm`. |
| `language` | `string` | — (runtime default `"en"`) | initial UI language, applied after bootstrap completes. Other languages exist only as registered translations ([extensions.md](extensions.md#locale)); a language without registrations falls back to English dictionaries. |
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | `"warn"` | threshold for the package logger. Configured synchronously at `createMapdeck`, before the instance is built; the setting is module-global (the last call wins). |
| `settingsOverrides` | `Readonly<Record<string, string \| number \| boolean>>` | — | per-deployment values for registered settings; see below. |
| `modules` | `readonly Module[]` | `[]` | consumer modules, executed in array order after the built-in registrations; a later module may replace a built-in registration with `{ override: true }`. |

## `settingsOverrides`

Values for registered settings, applied after all registrations (built-ins and
modules) and before the first source fetch.

- **Shape**: `settingId → value`, where a value is a string, number, or boolean.
- **Validation**: each value is checked against the registered setting metadata —
  declared type first, then `min`/`max` for numbers, then option membership for
  selects.
- **Unknown id**: rejected with reason `notfound`.
- **Failure behavior**: every rejection is collected into one error
  (`settingsOverrides rejected: <id> (<reason>)`) that fails initialization —
  `initError` is set and the error screen shows. No value is partially applied.
- **Precedence**: values initialize from the owner's declared default; a host
  override applied at the end of bootstrap wins over every default.
- **Restart**: overrides are re-applied on every `restart()`, after the fresh
  registrations.
- **Coverage**: whatever is registered by the end of bootstrap, including settings
  registered by consumer modules.

### Built-in settings

| Id | Kind | Default | Purpose |
|---|---|---|---|
| `layer-tree.data-source-url` | string | `"./catalog.json"` | catalog URL for the configured source adapter |
| `basemap.basemap` | select | first registered basemap | the active basemap id; options come from the registered basemap configs |

A module's own settings register through the same mechanism, so the full id set is
whatever the assembled modules declared.

## The settings system

Settings are declared by their owner (a widget, a map tool, a module) with metadata
and initialize to their declared default:

```ts
context.settings.registerSettings(ownerId, ownerName, [
    { id: "my-tool.precision", label: "Precision", type: "number", defaultValue: 2, min: 0, max: 6 },
]);
```

Every variant carries `id` and `label`; the `type` field discriminates:

| Type | Metadata | Value validation |
|---|---|---|
| `string` | `defaultValue: string` | must be a string |
| `number` | `defaultValue: number`, optional `min`/`max`/`step` | finite number within range |
| `select` | `defaultValue: string`, `options: {label, value}[]` | a listed option (an empty options list accepts any string) |
| `boolean` | `defaultValue: boolean` | boolean |

Re-declaring an owner's settings follows the registration policy: a colliding id
throws unless `{ override: true }` is passed, in which case the new batch replaces
the owner's previous settings (ids dropped from the batch are removed). Runtime value
changes go through the same validation and are observable (MobX) — the settings
widget renders them automatically. Runtime consumers read values through the
context's settings read port ([extensions.md](extensions.md#settings)).
