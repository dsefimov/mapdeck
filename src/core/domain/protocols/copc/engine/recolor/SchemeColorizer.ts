import { ColorScheme } from "@core/contracts";
import type { CachedNode } from "../../types";
import type { RecolorRequest, RecolorResult } from "../workers/pointProcessing.types";
import type { WorkerPool } from "../workers/WorkerPool";
import { extractHeights } from "../../logic/colorize";
import { pickNodeColors, setNodeColors } from "../render/schemeBuffers";

/** File-wide bounds tuple for elevation normalization. */
type GlobalBounds = [number, number, number, number, number, number] | null;

/**
 * Fills lazily-computed color buffers for loaded nodes through the worker
 * pool. Jobs operate on copies of the source arrays, so main-thread-owned
 * buffers never detach while a job is in flight; a result is assigned only
 * if the node still holds the same load (no eviction/reload race).
 */
export class SchemeColorizer {
    private readonly _pending = new WeakMap<
        CachedNode,
        Map<ColorScheme, Promise<void>>
    >();

    constructor(
        private readonly _pool: WorkerPool,
        private readonly _getGlobalBounds: () => GlobalBounds,
    ) {}

    /**
     * Queues recolor jobs for every loaded node still missing `scheme`'s
     * buffer and resolves when they all settle. Duplicate jobs for the same
     * node+scheme are coalesced.
     */
    ensure(scheme: ColorScheme, nodes: Iterable<CachedNode>): Promise<void> {
        const jobs: Promise<void>[] = [];
        if (scheme !== ColorScheme.RGB) {
            for (const node of nodes) {
                const job = this._ensureOne(scheme, node);
                if (job) jobs.push(job);
            }
        }
        return Promise.all(jobs).then(() => undefined);
    }

    private _ensureOne(
        scheme: ColorScheme,
        node: CachedNode,
    ): Promise<void> | null {
        if (node.state !== "loaded") return null;
        if (pickNodeColors(node, scheme)) return null;

        let pending = this._pending.get(node);
        const existing = pending?.get(scheme);
        if (existing) return existing;

        if (!pending) {
            pending = new Map();
            this._pending.set(node, pending);
        }
        const job = this._run(scheme, node).finally(() => {
            pending!.delete(scheme);
        });
        pending.set(scheme, job);
        return job;
    }

    private async _run(scheme: ColorScheme, node: CachedNode): Promise<void> {
        // Identity guard: eviction or reload swaps/deletes positions — such
        // a result must not land in the replaced node's slot.
        const positionsAtEnqueue = node.positions;
        const request = buildRecolorRequest(scheme, node, this._getGlobalBounds());

        const result = await this._pool.post<RecolorRequest, RecolorResult>(
            request,
            transferList(request),
        );

        if (
            node.state !== "loaded" ||
            node.positions !== positionsAtEnqueue
        ) {
            return;
        }
        setNodeColors(node, scheme, result.colors);
    }
}

function buildRecolorRequest(
    scheme: ColorScheme,
    node: CachedNode,
    globalBounds: GlobalBounds,
): RecolorRequest {
    return {
        kind: "recolor",
        requestId: "",
        scheme: scheme as RecolorRequest["scheme"],
        intensities: node.intensities ? node.intensities.slice() : null,
        classifications: node.classifications
            ? node.classifications.slice()
            : null,
        heights: node.positions ? extractHeights(node.positions) : null,
        globalBounds,
    };
}

function transferList(request: RecolorRequest): Transferable[] {
    const list: Transferable[] = [];
    if (request.intensities) list.push(request.intensities.buffer);
    if (request.classifications) list.push(request.classifications.buffer);
    if (request.heights) list.push(request.heights.buffer);
    return list;
}
