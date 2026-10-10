/**
 * The context family — the declared extension points of the extension model.
 *
 * One shape, two slices: every consumer sees the runtime slice (services and
 * read ports); modules additionally see the registration slice. The map-tool
 * contract hands the runtime slice to tool panels. Members are
 * typed by ports declared in `contracts/` — the family imports neither
 * `common/` nor a domain, so `contracts/` keeps no edge into the store graph.
 */

import type { StateStore } from "@core/lib/state/StateStore";
import type { RegisterOptions } from "@core/lib/registry";
import type {
    ProtocolRegistry,
    ProtocolRegistrationPort,
} from "../domain/protocol";
import type { SourceAdapterFactory } from "../domain/source";
import type {
    FeatureProviderRegistry,
    FeatureProviderRegistrationPort,
} from "../domain/feature-info";
import type { LayerCatalogPort, BindingSlot } from "../domain/tree";
import type { BasemapPort } from "../domain/basemap";
import type { LocaleApi, LocaleRegistrationPort } from "./locale";
import type { SettingsRegistrationPort } from "./settings";
import type { MapTool, MapToolStatePort } from "./map-tool";
import type { LayerTool } from "./layer-tool";
import type { Widget } from "./widget";

/** Registration surface for widgets (the WidgetStore mechanism). */
export interface WidgetRegistrationPort {
    registerWidget<TProps extends { widgetId: string }>(
        widget: Widget<TProps>,
        opts?: RegisterOptions,
    ): void;
}

/**
 * Registration surface for layer tools — register, the single link mechanism
 *, and the link-table reads the capability assignment verifies
 * against.
 */
export interface LayerToolRegistrationPort {
    registerTool(tool: LayerTool, opts?: RegisterOptions): void;
    bindToolToProtocol(
        protocolId: string,
        slot: BindingSlot,
        toolId: string,
    ): void;
    /** Ids of the tools linked to a protocol in a slot, in binding order. */
    linkedToolIds(protocolId: string, slot: BindingSlot): string[];
    /** Whether a link `(protocolId, slot, toolId)` exists. */
    hasLink(protocolId: string, slot: BindingSlot, toolId: string): boolean;
}

/** Registration surface for map tools (the MapToolStore mechanism). */
export interface MapToolRegistrationPort {
    registerTool(tool: MapTool, opts?: RegisterOptions): void;
}

/**
 * The runtime slice: services and read ports shared by every context
 * consumer. Membership is exactly what today's consumers need — a new need is
 * a new declared point, not a silent widening.
 */
export interface ToolRuntimeContext {
    readonly stateStore: StateStore;
    readonly locale: LocaleApi;
    readonly protocols: ProtocolRegistry;
    readonly featureProviders: FeatureProviderRegistry;
    readonly layerTree: LayerCatalogPort;
    readonly mapToolState: MapToolStatePort;
    readonly basemap: BasemapPort;
}

/**
 * The module registration context: the runtime slice plus every
 * registration surface. A module changes kernel behavior through these
 * points — never by reaching into store internals.
 */
export interface ModuleContext extends ToolRuntimeContext {
    readonly protocols: ProtocolRegistrationPort;
    readonly featureProviders: FeatureProviderRegistrationPort;
    readonly locale: LocaleRegistrationPort;
    readonly settings: SettingsRegistrationPort;
    readonly sourceAdapterFactory: SourceAdapterFactory;
    readonly widgets: WidgetRegistrationPort;
    readonly layerTools: LayerToolRegistrationPort;
    readonly mapTools: MapToolRegistrationPort;
}
