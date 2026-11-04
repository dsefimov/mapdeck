import type { View } from "copc";
import { ColorScheme } from "@core/contracts";
import type { BBox3D } from "@core/lib/geo";
import type { CachedNode } from "../../types";
import { WorkerPool } from "../workers/WorkerPool";
import type {
    DerivableScheme,
    ProcessResult,
} from "../workers/pointProcessing.types";
import { setNodeColors } from "../render/schemeBuffers";
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
     * When `activeScheme` is a derivable scheme, its color buffer rides the
     * same worker job — the node lands with the scheme already applied and
     * needs no follow-up recolor.
     */
    async extract(
        view: View,
        node: CachedNode,
        activeScheme: ColorScheme = ColorScheme.RGB,
    ): Promise<void> {
        const pointCount = node.pointCount;
        const raw = readRawLasFields(view, pointCount, this._payloadCtx.hasColor);

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

        const payload = {
            ...buildWorkerPayload(raw, this._payloadCtx),
            activeScheme: toDerivableScheme(activeScheme),
        };

        const result = await this._workerPool.post<
            Record<string, unknown>,
            ProcessResult
        >(payload, transferList);

        node.positions = result.positions;
        node.colorsRgb = result.colorsRgb;
        node.intensities = result.intensities;
        node.classifications = result.classifications;
        if (result.colorsActive) {
            setNodeColors(node, activeScheme, result.colorsActive);
        }
    }
}

function toDerivableScheme(scheme: ColorScheme): DerivableScheme | null {
    switch (scheme) {
        case ColorScheme.ELEVATION:
            return "elevation";
        case ColorScheme.INTENSITY:
            return "intensity";
        case ColorScheme.CLASSIFICATION:
            return "classification";
        default:
            return null;
    }
}
