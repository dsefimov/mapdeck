import { ColorScheme } from "@core/contracts";
import type { BBox3D } from "@core/lib/geo";
import type { CachedNode } from "../../types";
import { WorkerPool } from "../workers/WorkerPool";
import type {
    DerivableScheme,
    ProcessResult,
} from "../workers/pointProcessing.types";
import { setNodeColors } from "../render/schemeBuffers";
import { toBoundsTuple } from "./rawExtraction";

/**
 * Immutable extraction context — set once at initialization. Carries the
 * LAS point record layout so the worker can decode compressed node data,
 * plus the wasm URL for its laz-perf instance.
 */
export interface ExtractionContext {
    hasColor: boolean;
    needsTransform: boolean;
    wkt: string | null;
    coordinateOrigin: [number, number, number];
    bounds: BBox3D;
    wasmUrl: string;
    pointDataRecordFormat: number;
    pointDataRecordLength: number;
    scale: [number, number, number];
    offset: [number, number, number];
    extraBytes: readonly unknown[];
}

/**
 * Takes a node's fetched point-data bytes through the worker pool: decode,
 * raw extraction, reprojection and color derivation all run inside the
 * job, and the result arrays are assigned to the node (zero-copy
 * Transferable). When `activeScheme` is a derivable scheme, its color
 * buffer rides the same worker job — the node lands with the scheme
 * already applied and needs no follow-up recolor.
 */
export class NodeDataExtractor {
    constructor(
        private readonly _workerPool: WorkerPool,
        private readonly _ctx: ExtractionContext,
    ) {}

    async extract(
        node: CachedNode,
        compressed: Uint8Array,
        activeScheme: ColorScheme = ColorScheme.RGB,
    ): Promise<void> {
        // A memory-backed getter may hand out a view into a larger buffer —
        // transfer requires sole ownership, so copy those. HTTP responses
        // arrive as exact-fit buffers and transfer zero-copy.
        const bytes =
            compressed.byteOffset === 0 &&
            compressed.byteLength === compressed.buffer.byteLength
                ? compressed
                : compressed.slice();

        const result = await this._workerPool.post<
            Record<string, unknown>,
            ProcessResult
        >(
            {
                kind: "process",
                pointCount: node.pointCount,
                hasColor: this._ctx.hasColor,
                activeScheme: toDerivableScheme(activeScheme),
                wkt: this._ctx.needsTransform ? (this._ctx.wkt ?? null) : null,
                coordinateOrigin: this._ctx.coordinateOrigin,
                globalBounds: toBoundsTuple(this._ctx.bounds),
                source: {
                    compressed: bytes,
                    wasmUrl: this._ctx.wasmUrl,
                    pointCount: node.pointCount,
                    pointDataRecordFormat: this._ctx.pointDataRecordFormat,
                    pointDataRecordLength: this._ctx.pointDataRecordLength,
                    scale: this._ctx.scale,
                    offset: this._ctx.offset,
                    extraBytes: this._ctx.extraBytes,
                },
            },
            [bytes.buffer],
        );

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
