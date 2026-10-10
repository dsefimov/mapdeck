import type { ModuleContext } from "@core/contracts";
import type { Module } from "@core/contracts";
import { logger } from "@core/lib/logger";
import { stacModule } from "./stac";

/** The built-in module set — assemblies prepend it to the consumer's modules. */
export const builtInModules: readonly Module[] = [stacModule];

/**
 * Explicit registration of modules through the declared-points context.
 * Array order is execution order — built-ins first, the
 * consumer's modules after, so the latter may override.
 */
export async function registerModules(
    context: ModuleContext,
    modules: readonly Module[],
): Promise<void> {
    const ids = new Set(modules.map((m) => m.id));

    for (const module of modules) {
        for (const dep of module.dependencies ?? []) {
            if (!ids.has(dep)) {
                logger.warn(
                    `Module "${module.id}" depends on unknown module "${dep}"`,
                );
            }
        }
        await module.register(context);
    }
}
