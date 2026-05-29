# Settings System

## Concept

A centralized registry for application settings. Tools and widgets declare their settings declaratively; `SettingsStore` manages values and groups them by owner.

SettingType is a discriminated union: `StringSetting | NumberSetting | SelectSetting | BooleanSetting`.

---

## Setting Types

Discriminated union for type-safe settings with `SettingType = "string" | "number" | "select" | "boolean"`.

```ts
// Current structure
interface BaseSettingMetadata {
    id: string;
    label: string;
}

interface StringSettingMetadata extends BaseSettingMetadata {
    type: "string";
    defaultValue: string;
}

interface NumberSettingMetadata extends BaseSettingMetadata {
    type: "number";
    defaultValue: number;
    min?: number;
    max?: number;
    step?: number;
}

interface SelectSettingMetadata extends BaseSettingMetadata {
    type: "select";
    defaultValue: string;
    options: SettingOption[];
}

interface BooleanSettingMetadata extends BaseSettingMetadata {
    type: "boolean";
    defaultValue: boolean;
}

type SettingMetadata =
    | StringSettingMetadata
    | NumberSettingMetadata
    | SelectSettingMetadata
    | BooleanSettingMetadata;
```

This eliminates `unknown` — `defaultValue` type is enforced by `type` discriminator.

See: [`src/core/framework/types/framework/settings.ts`](../../../src/core/framework/types/framework/settings.ts)

---

## Registration

### MapTools — auto-registration

`MapToolStore.registerTool()` automatically registers any `tool.settings[]`:

```ts
class BasemapTool implements MapTool {
    readonly settings: SettingMetadata[] = [
        { id: "basemap-tool.basemap", label: "Basemap", type: "select", defaultValue: "osm", options: [...] },
    ];
}
```

### Widgets — auto-registration

Widgets automatically register settings via the `settings` field in `Widget` interface:

```ts
const MyWidget: Widget<MyProps> = {
    id: "my-widget",
    name: "My Widget",
    icon: "...",
    component: MyWidgetComponent,
    settings: [
        { 
            id: "my-widget.theme", 
            label: "Theme", 
            type: "select", 
            defaultValue: "light", 
            options: [
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" }
            ] 
        },
    ],
};
```

Settings are automatically registered when the widget is registered in `WidgetCatalogStore`.

---

## SettingsStore API

| Method | Purpose |
|--------|---------|
| `registerSetting(ownerId, ownerName, metadata)` | Register a single setting |
| `getStringSetting(settingId)` | Type-safe getter for string settings |
| `getNumberSetting(settingId)` | Type-safe getter for number settings |
| `getBooleanSetting(settingId)` | Type-safe getter for boolean settings |
| `setSetting(settingId, value)` | Update value with type validation |
| `resetSetting(settingId)` | Reset to default |
| `resetOwnerSettings(ownerId)` | Reset all settings for an owner |
| `getOwnerSettings(ownerId)` | All settings for one owner |
| `allSettingsGrouped` | Settings grouped by owner for UI rendering |
| `allSettings` | Flat list of all registered settings |
| `hasSetting(settingId)` | Check if a setting exists |

See: [`src/core/framework/store/settings/SettingsStore.ts`](../../../src/core/framework/store/settings/SettingsStore.ts)

---

## Settings UI

Settings render as form controls based on `type`:

| Type | UI Control |
|------|-----------|
| `string` | Text input |
| `number` | Number input with min/max/step |
| `select` | Dropdown with options |
| `boolean` | Checkbox or toggle switch |

See: [`src/widgets/settings/SettingsGroup.tsx`](../../../src/widgets/settings/SettingsGroup.tsx)

---

## Current Limitations

- **No persistence**: Settings live in memory only. No localStorage or server sync.

---

## Related

- [state-management.md](./state-management.md) — MobX store patterns
- [widgets.md](../dev/widgets.md) — How to add a widget with settings
