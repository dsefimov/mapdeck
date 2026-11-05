# Instance lifecycle and errors

The public lifecycle of a `mapdeck` instance: creation, bootstrap, initialization
states, retry, restart, and disposal. The configuration options are documented in
[configuration.md](configuration.md).

## Creation

```ts
import { createMapdeck, MapdeckRoot } from "mapdeck";

const mapdeck = createMapdeck({ /* MapdeckOptions */ });
```

`createMapdeck` is synchronous. It configures the logger (when `logLevel` is set) and
MobX (page-wide — see [configuration.md](configuration.md)), constructs the instance,
and starts the bootstrap in the background: no step of the bootstrap blocks the call,
and its failures never surface as an unhandled rejection — they land in `initError`.

The instance exposes:

| Member | Type | Purpose |
|---|---|---|
| `isInitialized` | `boolean` | true after a completed bootstrap |
| `initError` | `string \| null` | the bootstrap failure message, if any |
| `restart()` | `() => Promise<void>` | re-run the bootstrap on a fresh store |
| `dispose()` | `() => void` | release everything; terminal |
| `store` | internal | reserved for `MapdeckRoot`; do not read from embedder code |
| `moduleContext` | internal | the context built-ins register through |

`isInitialized` and `initError` are MobX observables; `MapdeckRoot` (an `observer`
component) renders from them. `restart()` is asynchronous and resolves when the
bootstrap attempt finishes — check the fields afterwards, it does not reject on
bootstrap failure. `dispose()` is synchronous.

## Initialization states

The instance is in exactly one of three states:

| State | `isInitialized` | `initError` | `MapdeckRoot` renders |
|---|---|---|---|
| initializing | `false` | `null` | loading screen |
| error | `false` | message | error screen with a Retry button |
| initialized | `true` | `null` | the workspace |

A non-React host reads the two fields directly (they are plain observable getters);
the completion signal is the state, not a promise.

## Retry and restart

The error screen's Retry button calls `restart()`. `restart()` disposes the current
store graph, builds a fresh one, and re-runs the full bootstrap with the same options:
built-in registrations, module registrations (modules may fail on a clean run only if
the environment changed), `settingsOverrides` re-application, and the initial source
fetch. Everything observable is rebuilt; widget layouts and z-order reset.

Failed initialization can always be retried this way. Options are fixed for the
instance's lifetime — changing them requires creating a new instance.

## Disposal

```ts
root.unmount();          // React teardown
mapdeck.dispose();       // release the instance
```

`dispose()` releases the store graph in reverse construction order: the basemap
synchronization, the map (render units, the overlay, the MapLibre map), the layer
tree (in-flight requests aborted, source adapter disposed), the active map tool, and
keyed instance state such as tool controllers. Calling `dispose()` twice is safe.

After `dispose()` the instance must not be used. The implementation keeps no runtime
guard: calling `restart()` on a disposed instance would build a fresh store, but that
path is unsupported — create a new instance instead.

### Unmounting without disposal

Unmounting `MapdeckRoot` alone does not dispose the instance. The map viewer's
lifecycle hook tears down the MapLibre map, the layer manager and the basemap sync,
but the registries, the source adapter and the instance state keep living. Call
`dispose()` when the embed is removed for good; skip it only if the page is about to
unload anyway.

## Error categories

Where a consumer observes failures:

| Category | Surfaces as | Where |
|---|---|---|
| Initialization | `initError`, error screen | registration failures (duplicate ids, invalid basemap configs), rejected `settingsOverrides`, unknown `defaultSourceType`, first source fetch failure |
| Source loading | widget loading/error states | tree refresh and children fetches report per operation in the Layers widget; the attribute table shows its own busy/error state |
| Protocol/data | thrown messages | protocol HTTP errors read `<label> returned <status> <statusText>` (e.g. "WFS GetFeature returned 404 Not Found"); failed queries show in the widget that issued them |
| Rendering | per-node marker in the tree | a render unit that fails (bad URL, unsupported format) marks its node with the error; the layer manager retries with a gate |
| Extension registration | `initError` | a module `register` that throws fails initialization; registrations already performed stay (no rollback), and retry rebuilds from empty |

Quiet degradation (best-effort paths that do not report): report download falls back
to direct navigation, a failed point-cloud recolor keeps the current colors until the
next scheme change, and picking falls back to surface coordinates. Each site carries
a comment in the source.

The library installs no global handlers — the host owns `window.onerror` and
`unhandledrejection`.
