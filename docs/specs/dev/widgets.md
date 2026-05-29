# How to Add a Widget

## Interface

`Widget<TProps>` — required: `id`, `name`, `icon`, `component`. Optional: size constraints, `initialize()`, `destroy()`.

See: [`src/core/framework/types/framework/widget.ts`](../../../src/core/framework/types/framework/widget.ts)

---

## Step-by-Step

### 1. Create directory

```
src/widgets/<widget-name>/
├── index.ts               # Public API (barrel)
├── config.json            # Size + visibility + settings config
├── locale.ts              # Translations (optional)
├── types.ts               # Props & local types
├── components/            # UI
│   ├── Widget.tsx
│   ├── Widget.module.css
│   └── ...
├── store/                 # Local MobX store (optional)
│   └── WidgetStore.ts
└── utils/                 # Pure functions, helpers (optional)
    └── ...
```

**Inside the widget, file names omit the widget prefix** — `Widget.tsx`, `Store.ts`, not `MyWidget.tsx`, `MyWidgetStore.ts`.

**Rule of three**: if a widget has ≤3 source files, keep everything in the root directory. Folders `components/`, `store/`, `utils/` only when they'd contain 2+ files.

### 2. Define the React component

Put in `components/Widget.tsx`. Pure view wrapped in `observer()`. All logic in MobX stores.

```tsx
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/store";

export interface WidgetProps {
    className?: string;
}

export const Widget = observer(({ className }: WidgetProps) => {
    const rootStore = useRootStore();
    return <div className={className}>...</div>;
});
```

### 3. Define the widget object

Stateless object implementing `Widget<TProps>`. Import from `components/Widget`, use `config.base`, `config.size`.

```ts
import type { Widget } from "@core/types";
import icon from "@core/ui/icons/my-icon.svg";
import { Widget as WidgetComponent } from "./components/Widget";
import type { WidgetProps } from "./types";
import config from "./config.json";

const MyWidgetDef: Widget<WidgetProps> = {
    id: "my-widget",
    icon,
    localeTranslations: myTranslations,
    component: WidgetComponent,
    showInSidebar: config.base?.showInSidebar ?? true,
    ...config.size,
};

export default MyWidgetDef;
```

### 4. Add config.json

Size, visibility, and settings config as JSON — separate from code so it can change without rebuild.

```json
{
    "base": {
        "showInSidebar": true
    },
    "size": {
        "defaultWidth": 20,
        "defaultHeight": 15,
        "minWidth": 10,
        "minHeight": 8,
        "maxWidth": 40,
        "maxHeight": 30
    },
    "settings": [
        {
            "id": "my-widget.setting-key",
            "type": "string",
            "defaultValue": "default value",
            "label": "Setting Label",
            "description": "Optional description of the setting"
        }
    ]
}
```

Settings metadata lives in `config.json`. Settings are auto-registered by `catalogStore.registerWidget()` into `SettingsStore` — no manual registration needed.

### 5. Register

Add import + `registerWidget()` call in [`src/widgets/registerWidgets.ts`](../../../src/widgets/registerWidgets.ts). Registration is async — `await rootStore.catalogStore.registerWidget(widgetDef)`.

---

## Lifecycle

| Method | When | Purpose |
|--------|------|---------|
| `initialize(context)` | On registration (async) | Set up subscriptions, one-time async init |
| `destroy()` | On unregistration (async) | Clean up, dispose reactions |

`initialize()` is optional — for widgets that need async setup beyond what the constructor provides.

---

## Widget-Local Stores

Persist state across open/close cycles:

```tsx
const myStore = rootStore.overlayStore.getWidgetStore(
    "my-widget",
    () => new WidgetLocalStore(rootStore),
);
```

Store survives `closeWidget()` → `openWidget()` cycles. Use for filters, selections, UI preferences.

Store files live in `store/` inside the widget directory.

See: [`src/core/framework/store/widget/WidgetOverlayStore.ts`](../../../src/core/framework/store/widget/WidgetOverlayStore.ts) — `getWidgetStore()` method

---

## Utilities

Pure functions (validation, formatting, filtering) go in `utils/`.

---

## Sidebar Visibility

Widgets appear as sidebar buttons by default. To exclude, set `showInSidebar: false` in the `base` section of `config.json`:

```json
{
    "base": {
        "showInSidebar": false
    }
}
```

---

## Styles & Theming

- Use **CSS Modules** (`.module.css` files) co-located with their component in `components/`
- Use **CSS custom properties** from theme — never hardcode colors, spacing, or typography
- Full token list: [`src/core/ui/styles/theme.css`](../../../src/core/ui/styles/theme.css)

---

## Grid System

Widgets render in a `80×45` grid via `react-grid-layout`. Edge snapping: drag to any edge to expand to full width/height.

---

## Related

- [extending.md](./extending.md) — General extension guide
- [state-management.md](../domain/state-management.md) — MobX store patterns
