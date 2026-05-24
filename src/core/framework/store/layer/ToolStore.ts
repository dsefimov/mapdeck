import { makeAutoObservable } from "mobx";
import {
    type LayerRole,
    type LayerAdapter,
    type LayerConfig,
    BUILT_IN_ROLES,
    type LayerTool,
    type LayerToolRole,
} from "@core/framework/types";
import { registerDefaultConfig } from "@core/domain/adapters";
import type { RootStore } from "@core/framework/store";

export class ToolStore {
    private layerTools = new Map<LayerRole, LayerTool[]>();

    /** Dynamic set of known roles — built-in + module-registered */
    private _knownRoles = new Set<LayerRole>(BUILT_IN_ROLES);

    constructor(readonly rootStore: RootStore) {
        makeAutoObservable(this, { rootStore: false });
    }

    /**
     * Register a new layer role with its adapter and default config.
     * This is the single entry point for extending the system with a new role.
     *
     * - Adds the role to the known-roles set (so tools with role="all" apply)
     * - Registers the default config factory for this role
     * - Registers the adapter to handle this role at runtime
     *
     * Called from module.setRootStore() or during module.register().
     */
    async registerRole(
        role: LayerRole,
        adapter: LayerAdapter,
        defaultConfig: () => LayerConfig,
    ): Promise<void> {
        this._knownRoles.add(role);
        registerDefaultConfig(role, defaultConfig);
        await this.rootStore.layerAdapterFactory.register(role, adapter);
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
            return Array.from(this._knownRoles);
        }

        if (Array.isArray(roleSpec)) {
            return roleSpec;
        }

        return [roleSpec];
    }
}
