import type { ModuleContext } from "@core/contracts";
import type { Module } from "@core/contracts";
import { logger } from "@core/lib/logger";
import { stacModule } from "./stac";

const MODULES: Module[] = [
    stacModule,
];

/** Explicit registration of modules through the declared-points context (ADR-0004). */
export async function registerModules(
    context: ModuleContext,
): Promise<void> {
    const ids = new Set(MODULES.map((m) => m.id));

    for (const module of MODULES) {
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
