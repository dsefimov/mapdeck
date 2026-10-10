/**
 * The library's public surface: the embed facade, the root component, and
 * the types an embedding app needs. Deep integration goes through the
 * `mapdeck/contracts` subpath, which re-exports the full contract barrel.
 */
export { createMapdeck } from "./embed";
export type { MapdeckOptions, MapdeckInstance } from "./embed";
export { MapdeckRoot } from "./MapdeckRoot";
export type {
    Module,
    ModuleContext,
    ToolRuntimeContext,
    Widget,
    MapTool,
    LayerTool,
    SourceAdapter,
    SettingMetadata,
    BaseMapConfig,
    Feature,
} from "@core/contracts";
export type { RegisterOptions } from "@core/lib/registry";
export { StoreProvider, useRootStore } from "@core/shell";
export type { StoreRegistry } from "@core/store-registry";
