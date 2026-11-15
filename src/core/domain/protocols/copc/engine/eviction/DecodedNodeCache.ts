import type { CachedNode } from "../../types";

/**
 * The decoded arrays of one evicted node, held for a possible revisit.
 * A payload exists only for fully decoded nodes — positions plus whatever
 * scheme buffers had been derived at eviction time.
 */
export interface DecodedNodePayload {
    pointCount: number;
    positions: Float32Array;
    colorsRgb: Uint8Array;
    intensities: Float32Array;
    classifications: Uint8Array;
    colorsElevation?: Uint8Array;
    colorsIntensity?: Uint8Array;
    colorsClassification?: Uint8Array;
}

/**
 * Byte-budgeted LRU of decoded node payloads. Eviction salvages a node's
 * buffers here instead of dropping them; a reload of the same node takes
 * the payload back without touching the network. When the byte budget
 * overflows, the least recently salvaged/touched payloads are dropped —
 * their arrays are then garbage like before this cache existed.
 *
 * A Map drives recency: insertion order is the LRU order, and every
 * touch re-inserts the key.
 */
export class DecodedNodeCache {
    private readonly _entries = new Map<string, DecodedNodePayload>();
    private _bytes = 0;

    constructor(private readonly _maxBytes: number) {}

    get bytes(): number {
        return this._bytes;
    }

    get size(): number {
        return this._entries.size;
    }

    /**
     * Only fully decoded nodes are worth keeping — a partially loaded
     * node has nothing to salvage.
     */
    salvage(node: CachedNode): void {
        if (this._maxBytes <= 0) return;
        if (node.state !== "loaded" || !node.positions) return;
        if (
            !node.colorsRgb ||
            !node.intensities ||
            !node.classifications
        ) {
            return;
        }

        const payload: DecodedNodePayload = {
            pointCount: node.pointCount,
            positions: node.positions,
            colorsRgb: node.colorsRgb!,
            intensities: node.intensities!,
            classifications: node.classifications!,
            ...(node.colorsElevation && { colorsElevation: node.colorsElevation }),
            ...(node.colorsIntensity && {
                colorsIntensity: node.colorsIntensity,
            }),
            ...(node.colorsClassification && {
                colorsClassification: node.colorsClassification,
            }),
        };

        this._entries.delete(node.key);
        this._entries.set(node.key, payload);
        this._bytes += payloadBytes(payload);
        this._trim();
    }

    /**
     * A pointCount mismatch means the entry describes a different load —
     * dropped, not returned.
     */
    take(key: string, pointCount: number): DecodedNodePayload | null {
        const payload = this._entries.get(key);
        if (!payload) return null;
        this._entries.delete(key);
        this._bytes -= payloadBytes(payload);
        if (payload.pointCount !== pointCount) return null;
        return payload;
    }

    clear(): void {
        this._entries.clear();
        this._bytes = 0;
    }

    private _trim(): void {
        while (this._bytes > this._maxBytes) {
            const oldest = this._entries.keys().next();
            if (oldest.done) break;
            const payload = this._entries.get(oldest.value)!;
            this._entries.delete(oldest.value);
            this._bytes -= payloadBytes(payload);
        }
    }
}

function payloadBytes(payload: DecodedNodePayload): number {
    return (
        payload.positions.byteLength +
        payload.colorsRgb.byteLength +
        payload.intensities.byteLength +
        payload.classifications.byteLength +
        (payload.colorsElevation?.byteLength ?? 0) +
        (payload.colorsIntensity?.byteLength ?? 0) +
        (payload.colorsClassification?.byteLength ?? 0)
    );
}
