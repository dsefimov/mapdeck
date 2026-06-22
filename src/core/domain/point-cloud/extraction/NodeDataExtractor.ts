import type { View } from "copc";
import type { CachedNode, BBox3D } from "@core/framework/types";
import { WorkerPool } from "../workers/WorkerPool";
import type { ProcessResult } from "../workers/pointProcessing.types";
import {
    readRawLasFields,
    buildWorkerPayload,
    type WorkerPayloadContext,
} from "./rawExtraction";

/** Immutable extraction context — set once at initialization. */
export interface ExtractionContext {
    hasColor: boolean;
    needsTransform: boolean;
    wkt: string | null;
    coordinateOrigin: [number, number, number];
    bounds: BBox3D;
}

/**
 * Extracts raw LAS fields from a COPC View, builds the worker payload,
 * dispatches to WorkerPool, and assigns result arrays to the node.
 */
export class NodeDataExtractor {
    private readonly _payloadCtx: WorkerPayloadContext;

    constructor(
        private readonly _workerPool: WorkerPool,
        ctx: ExtractionContext,
    ) {
        this._payloadCtx = {
            hasColor: ctx.hasColor,
            needsTransform: ctx.needsTransform,
            wkt: ctx.wkt,
            coordinateOrigin: ctx.coordinateOrigin,
            bounds: ctx.bounds,
        };
    }

    /**
     * Extract raw LAS fields from a COPC View, process via worker pool,
     * and assign result arrays to the node (zero-copy Transferable).
     */
    async extract(view: View, node: CachedNode): Promise<void> {
        const N = node.pointCount;
        const raw = readRawLasFields(view, N, this._payloadCtx.hasColor);

        const transferList: Transferable[] = [
            raw.x.buffer,
            raw.y.buffer,
            raw.z.buffer,
            raw.intensity.buffer,
            raw.classification.buffer,
        ];
        if (raw.r) {
            transferList.push(raw.r.buffer, raw.g!.buffer, raw.b!.buffer);
        }

        const payload = buildWorkerPayload(raw, this._payloadCtx);

        const result = await this._workerPool.post<
            Record<string, unknown>,
            ProcessResult
        >(payload, transferList);

        node.positions = result.positions;
        node.colorsRgb = result.colorsRgb;
        node.colorsElevation = result.colorsElevation;
        node.colorsIntensity = result.colorsIntensity;
        node.colorsClassification = result.colorsClassification;
        node.intensities = result.intensities;
        node.classifications = result.classifications;
    }
}
