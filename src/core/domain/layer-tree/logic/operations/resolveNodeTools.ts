import type { LayerTool, NodeCapability } from "@core/contracts";

/**
 * Resolves assigned capabilities to tool instances in list order,
 * deduplicated by id; unknown tool ids are skipped defensively
 * (verified capabilities always resolve, the skip guards
 * future registration changes). The menu operation itself.
 */
export function resolveNodeTools(
    capabilities: readonly NodeCapability[],
    getTool: (toolId: string) => LayerTool | undefined,
): LayerTool[] {
    const seen = new Set<string>();
    const result: LayerTool[] = [];
    for (const { toolId } of capabilities) {
        if (seen.has(toolId)) continue;
        const tool = getTool(toolId);
        if (!tool) continue;
        seen.add(toolId);
        result.push(tool);
    }
    return result;
}
