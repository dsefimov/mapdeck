import type { CachedNode } from "../../types";
import type { PriorityState } from "../priority";
import type { CameraSnapshot } from "../geometry";
import type { HierarchyLoadTracker } from "../octree/HierarchyLoadTracker";
import type { NodeBBoxEntry } from "./traverseOctree";
import { traverseOctree } from "./traverseOctree";
import { DEFAULT_MAX_OCTREE_DEPTH } from "../streamingConfig";
import type RBush from "rbush";

/** Maximum hierarchy pages to expand per cycle. */
const MAX_HIERARCHY_EXPANSIONS = 32;

/** Result of one octree traversal — the return of {@link traverseOctree}. */
export type TraversalResult = ReturnType<typeof traverseOctree>;

/** Dependencies needed by TraversalOrchestrator. */
export interface TraversalDeps {
    nodeCache: Map<string, CachedNode>;
    spatialIndex: RBush<NodeBBoxEntry>;
    hierarchyTracker: HierarchyLoadTracker;
    priorityStateMap: WeakMap<CachedNode, PriorityState>;
    maxOctreeDepth?: number;
}

/** Immutable input for a single traversal. */
export interface TraversalInput {
    camera: CameraSnapshot;
    viewportBounds: [number, number, number, number];
    maxScreenErrorPx: number;
    geometricErrorByDepth: (depth: number) => number;
}

/**
 * Encapsulates octree traversal + hierarchy expansion logic.
 */
export class TraversalOrchestrator {
    constructor(private readonly _deps: TraversalDeps) {}

    private runTraversal(input: TraversalInput): TraversalResult {
        return traverseOctree({
            rootKey: "0-0-0-0",
            nodeCache: this._deps.nodeCache,
            spatialIndex: this._deps.spatialIndex,
            priorityStateMap: this._deps.priorityStateMap,
            maxOctreeDepth: this._deps.maxOctreeDepth ?? DEFAULT_MAX_OCTREE_DEPTH,
            camera: input.camera,
            viewportBounds: input.viewportBounds,
            maxScreenErrorPx: input.maxScreenErrorPx,
            geometricErrorByDepth: input.geometricErrorByDepth,
        });
    }

    async run(input: TraversalInput): Promise<TraversalResult> {
        let result = this.runTraversal(input);

        if (result.pendingHierarchyExpansions.length > 0) {
            const expansions = result.pendingHierarchyExpansions.slice(
                0,
                MAX_HIERARCHY_EXPANSIONS,
            );

            const rootPages = new Map<string, import("copc").Hierarchy.Page>();
            for (const key of expansions) {
                const page = this._deps.hierarchyTracker.pageByKey.get(key);
                if (page) rootPages.set(key, page);
            }

            const cacheSizeBefore = this._deps.nodeCache.size;
            const loaded = await this._deps.hierarchyTracker.ensureLoadedMany(
                expansions.filter((k) => rootPages.has(k)),
                rootPages,
            );

            if (loaded > 0 || this._deps.nodeCache.size > cacheSizeBefore) {
                result = this.runTraversal(input);
            }
        }

        return result;
    }
}
