import { useCallback } from "react";
import type { PointCloudData, ToolRuntimeContext } from "@core/contracts";
import { findPointCloudDataAdapter } from "@core/contracts";

/**
 * Returns a stable accessor for the loaded point data of a cloud layer —
 * capability-based (ADR-0012): the adapter is found by narrowing across the
 * protocol registry, naming no protocol id.
 */
export function usePointCloudData(
    context: ToolRuntimeContext,
): (layerId: string) => PointCloudData | undefined {
    const registry = context.protocols;
    return useCallback(
        (layerId: string) =>
            findPointCloudDataAdapter(registry, layerId)?.getLoadedData(
                layerId,
            ),
        [registry],
    );
}
