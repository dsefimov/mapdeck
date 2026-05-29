# State Management

## Principles

- **React `useState` → UI presentation. MobX → domain logic.**
- `useState`/`useReducer` exclusively for: UI-only state (modal open, form value, hover), local animation, frequent transient updates (scroll, mouse)
- MobX stores for: state shared by ≥2 unrelated components, state that survives navigation, business logic (async, validation, `@computed`), imperative API handles (map, WebGL, WebSocket)
- **Never `useState` for business data** (layer config, attribute data, tool state, feature info, settings). Business state always goes to MobX.
- **Rule of extraction**: if state starts as `useState` and later needs cross-component access, async handling, or computed values — extract to MobX immediately. Don't extend the `useState` version.
- **Strict actions** — `enforceActions: "always"`
- **Safe computed access** — Computed values must not be read outside a reactive context
  (`observer`, `autorun`, `reaction`, or another computed). Reading plain observables in actions
  is unrestricted — only computed access is guarded to prevent stale reads.

### Decision guide (3 steps)
1. **Needs other components?** → Yes → MobX
2. **Survives navigation?** → Yes → MobX
3. **Temporary UI flag or form value?** → Yes → `useState`

See: [`src/core/framework/store/root/mobxConfig.ts`](../../../src/core/framework/store/root/mobxConfig.ts)

---

## RootStore

Single hub. All stores are created directly in the constructor. Components access via `useRootStore()`.

See: [`src/core/framework/store/root/rootStore.ts`](../../../src/core/framework/store/root/rootStore.ts)

```
RootStore
├── treeStore          { LayerTreeStore — tree + search + panel }
├── visibilityStore    { LayerVisibilityStore }
├── attributeDataStore { AttributeDataStore }
├── layerToolStore     { ToolStore }
├── mapStore           { MapStore }
├── mapToolStore       { MapToolStore }
├── settingsStore      { SettingsStore }
├── catalogStore       { WidgetCatalogStore }
├── overlayStore       { WidgetOverlayStore }
├── localeStore        { LocaleStore }
├── isInitialized      { boolean }
└── initError          { string | null }
```

### Shared state on RootStore

`isInitialized` / `initError` — needed by `App` and `ErrorScreen` (read before other stores are ready).

**Rule**: if two stores need shared state → put it on RootStore.

Layout methods (`syncLayout`, `updateLayout`) live on `overlayStore`, not on `RootStore` directly.

### Rules

1. **Stores depend on RootStore** — never on each other directly
2. **Cross-store access** via `rootStore.otherStore`
3. **`rootStore: false`** in `makeAutoObservable` to exclude from tracking
4. **Non-observable internals** explicitly excluded (e.g. `_currentMap: false`)

---

## Global vs Local Store

### Global Stores
- Created once in RootStore constructor
- Live for entire app lifecycle
- Examples: `catalogStore`, `mapToolStore`, `settingsStore`, `treeStore`
- Access: `rootStore.<storeName>`

### Local Stores
- Created on-demand via factory methods (`getWidgetStore()`)
- Live in widget/tool context
- Persist state across open/close cycles
- Examples: widget-local stores, `AttributeTableStore`

---

## Accessing State

### In components

```tsx
import { useRootStore } from "@core/store";

const MyComponent = observer(() => {
    const rootStore = useRootStore();
    const widgets = rootStore.catalogStore.allWidgets;
    return <div>{/* ... */}</div>;
});
```

### In stores

```ts
class MyStore {
    constructor(readonly rootStore: RootStore) {
        makeAutoObservable(this, { rootStore: false });
    }
}
```

---

## Async Pattern

```ts
@action
async fetchData(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
        const data = await api.fetch();
        runInAction(() => { this.data = data; });
    } catch (e) {
        runInAction(() => { this.error = String(e); });
    } finally {
        runInAction(() => { this.loading = false; });
    }
}
```

Pattern: `loading` → `error` → `clearError()`. All mutations inside `runInAction()`.

---

## Reactions

Named reactions with disposer in `dispose()`:

```ts
private reactionDisposer: (() => void) | null = null;

setupReaction(): void {
    this.reactionDisposer = reaction(
        () => this.someObservable,
        (value) => { /* side effect */ },
        { name: "MyStore.someReaction" },
    );
}

dispose(): void {
    this.reactionDisposer?.();
}
```

---

## Related

- [extending.md](../dev/extending.md) — General extension guide
