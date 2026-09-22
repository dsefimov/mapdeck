import { makeAutoObservable } from "mobx";
import {
    type BindingSlot,
    type LayerTool,
    type LayerNode,
} from "@core/contracts";
import { resolveNodeTools } from "../logic/operations/resolveNodeTools";
import { Registry, GroupedRegistry, type RegisterOptions } from "@core/lib/registry";
import type { StoreRegistry } from "@core/store-registry";

export class ToolStore {
    private toolsById = new Registry<LayerTool>();
    private rendererTools = new GroupedRegistry<LayerTool>();
    private dataTools = new GroupedRegistry<LayerTool>();

    constructor(readonly rootStore: StoreRegistry) {
        makeAutoObservable<this, "toolsById" | "rendererTools" | "dataTools">(
            this,
            {
                rootStore: false,
                toolsById: false,
                rendererTools: false,
                dataTools: false,
            },
        );
    }

    /**
     * Register a tool by id and auto-register its `localeTranslations`
     * (the WidgetStore precedent). A tool becomes available to nodes only
     * after `bindToolToProtocol` links it to protocols. Duplicate ids throw
     * unless `opts.override` (ADR-0005).
     */
    registerTool(tool: LayerTool, opts?: RegisterOptions): void {
        this.toolsById.register(tool, opts);

        if (tool.localeTranslations) {
            this.rootStore.localeStore.registerTranslations(
                tool.id,
                tool.localeTranslations,
            );
        }
    }

    /**
     * The single mechanism linking a protocol to a tool: makes the tool
     * available to nodes using `protocolId` in the given slot. Called from the
     * tool's own registration code — core tools in `layer-tools/registerTools.ts`,
     * module tools in their module's `register(context)`.
     * Throws when the tool id is not registered.
     */
    bindToolToProtocol(
        protocolId: string,
        slot: BindingSlot,
        toolId: string,
    ): void {
        const tool = this.toolsById.get(toolId);
        if (!tool) {
            throw new Error(
                `Cannot bind tool "${toolId}": no such tool is registered.`,
            );
        }
        this.registryForSlot(slot).add(protocolId, tool);
    }

    /**
     * Every protocol id a tool is bound to, in either slot, deduplicated —
     * the data the bootstrap validation pass checks against the protocol
     * registry.
     */
    get boundProtocolIds(): string[] {
        return Array.from(
            new Set([...this.rendererTools.keys(), ...this.dataTools.keys()]),
        );
    }

    /** Whether a link `(protocolId, slot, toolId)` exists — the tool-link table capability verification consults (ADR-0009). */
    hasLink(protocolId: string, slot: BindingSlot, toolId: string): boolean {
        const group = this.registryForSlot(slot);
        return group.get(protocolId).some((tool) => tool.id === toolId);
    }

    /** Ids of the tools linked to a protocol in a slot, in binding order. */
    linkedToolIds(protocolId: string, slot: BindingSlot): string[] {
        const group = this.registryForSlot(slot);
        return group.get(protocolId).map((tool) => tool.id);
    }

    /** The slot's registry — the one place a BindingSlot maps to storage. */
    private registryForSlot(slot: BindingSlot): GroupedRegistry<LayerTool> {
        return slot === "renderer" ? this.rendererTools : this.dataTools;
    }

    /**
     * The node's menu: capability ids resolved to tools in list order,
     * deduplicated, unknown ids skipped defensively (ADR-0009).
     */
    getToolsForNode(node: LayerNode): LayerTool[] {
        return resolveNodeTools(
            node.capabilities,
            (toolId) => this.toolsById.get(toolId),
        );
    }
}
