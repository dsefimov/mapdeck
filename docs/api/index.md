# API reference

This section documents the public package API. Use the guides for implementation
examples and the reference pages for exact contracts and runtime behavior.

## Package entry points

| Entry point | Contents |
|---|---|
| `mapdeck` | Instance creation, React root component, module and extension types, and the tool-panel widget factory. |
| `mapdeck/contracts` | Public interfaces and types for modules, tools, protocols, source adapters, feature access and point-cloud data. |
| `mapdeck/ui` | UI components, panel primitives, hooks and theme helpers for extension interfaces. |
| `mapdeck/utils` | Public utility functions. |
| `mapdeck/styles.css` | Styles and design tokens for the built-in interface and extensions. |
| `mapdeck/laz-perf.wasm` | LazPerf WebAssembly binary used for COPC decoding. |
| `mapdeck/package.json` | Package manifest exposed for package metadata inspection. |

The package manifest `exports` map is the authoritative list of supported entry
points.

## Reference pages

- [Configuration](configuration.md) — `createMapdeck` options, settings and deployment overrides.
- [Extension API](extensions.md) — module contexts, registration APIs, protocols, source adapters, tools and resource ownership.
- [Instance lifecycle](lifecycle.md) — initialization, retry, restart, disposal and error reporting.
- [Protocols](protocols.md) — built-in data formats, endpoint requirements, capabilities and implementation limits.

## Guides

- [Extending Mapdeck](../extending.md) — end-to-end examples for modules, map tools, layer tools and custom protocols.
- [Architecture](../architecture.md) — internal component boundaries and data flow.
- [Compatibility](../compatibility.md) — browser, host, distribution and CSP requirements.
