import { makeAutoObservable } from "mobx";
import {
    type LayerRole,
    BUILT_IN_ROLES,
    type LayerTool,
    type LayerToolRole,
} from "@core/framework/types";
import type { RootStore } from "@core/framework/store";

export class ToolStore {
    private layerTools = new Map<LayerRole, LayerTool[]>();

    constructor(readonly rootStore: RootStore) {
        makeAutoObservable(this, { rootStore: false });
    }

    /**
     * Register a single layer tool. The tool's role is declared in the tool itself.
     * Supports single role, array of roles, or "all" for all roles.
     */
    registerTool(tool: LayerTool): void {
        const roles = this.resolveRoles(tool.role);

        for (const role of roles) {
            const existing = this.layerTools.get(role) ?? [];
            if (existing.some((t) => t.id === tool.id)) {
                continue;
            }
            this.layerTools.set(role, [...existing, tool]);
        }
    }

    getLayerTools(role: LayerRole): LayerTool[] {
        return this.layerTools.get(role) ?? [];
    }

    /**
     * Resolve LayerToolRole to an array of LayerRole values.
     * @param roleSpec - Role specification (single, array, or "all")
     * @returns Array of LayerRole values
     */
    private resolveRoles(roleSpec: LayerToolRole): LayerRole[] {
        if (roleSpec === "all") {
            return [...BUILT_IN_ROLES];
        }

        if (Array.isArray(roleSpec)) {
            return roleSpec;
        }

        return [roleSpec];
    }
}
