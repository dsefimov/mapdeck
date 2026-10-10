/**
 * Core module interface that all modules must implement.
 * This defines the metadata and contract for modules in the Mapdeck system.
 */

import type { ModuleContext } from "./context";

/** Contract every module implements: metadata plus its register hook. */
export interface Module<TConfig = Record<string, unknown>> {
    // === Required Properties ===
    /** Unique identifier for the module (kebab-case) */
    readonly id: string;

    /** Human-readable display name */
    readonly name: string;

    // === Optional Properties ===
    /**
     * Ids of modules this module depends on (extension→extension coupling).
     * Informational: documents the dependency and drives registration
     * order (array order); an id unknown to the registry logs a warning —
     * there is no manifest to validate against.
     */
    readonly dependencies?: string[];

    // === Required Methods ===
    /**
     * Register the module with the provided configuration.
     * Receives the declared-points context: registration surfaces
     * for every extension kind plus the runtime services. Domain stores are
     * deliberately absent — behavior changes through the declared points.
     */
    register(
        context: ModuleContext,
        config?: TConfig,
    ): Promise<void> | void;
}
