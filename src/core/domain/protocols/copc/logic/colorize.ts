/**
 * Pure color-scheme derivations shared by the point-processing worker and
 * the recolor path: raw LAS fields (or already-retained per-point arrays)
 * in, RGBA Uint8 buffers out. No state, no side effects.
 */

/** LAS classification code → RGB palette; unknown codes fall back to gray. */
const CLASSIFICATION_COLORS: Record<number, [number, number, number]> = {
    0: [128, 128, 128],
    1: [128, 128, 128],
    2: [165, 113, 78],
    3: [144, 238, 144],
    4: [34, 139, 34],
    5: [0, 100, 0],
    6: [255, 165, 0],
    7: [255, 0, 0],
    8: [128, 128, 128],
    9: [0, 0, 255],
    10: [139, 90, 43],
    11: [128, 128, 128],
    13: [255, 255, 0],
    14: [255, 200, 0],
    15: [200, 200, 0],
    16: [100, 100, 100],
    17: [0, 128, 255],
    18: [255, 0, 255],
};

/** Bounds tuple layout used by the streaming engine. */
export type GlobalBounds =
    | [number, number, number, number, number, number]
    | null;

/** Normalization parameters for the elevation ramp. */
export interface ElevationParams {
    minZ: number;
    invRange: number;
}

/**
 * Elevation normalization against the file-wide Z range: `t = (z - minZ) * invRange`.
 */
export function getElevationParams(globalBounds: GlobalBounds): ElevationParams {
    const minZ = globalBounds ? globalBounds[2] : 0;
    const maxZ = globalBounds ? globalBounds[5] : 1;
    const invRange = 1 / (maxZ - minZ || 1);
    return { minZ, invRange };
}

/** Raw per-point color channels as they arrive from a LAS record. */
export interface RgbChannels {
    r: Uint16Array | null;
    g: Uint16Array | null;
    b: Uint16Array | null;
}

/**
 * True-color buffer from 16-bit LAS RGB channels: values above 255 fold down
 * by a byte; missing channels paint an opaque white fallback.
 */
export function deriveRgbColors(
    channels: RgbChannels,
    hasColor: boolean,
    pointCount: number,
): Uint8Array {
    const { r, g, b } = channels;
    const hasSource = hasColor && r !== null && g !== null && b !== null;
    const colors = new Uint8Array(pointCount * 4);

    for (let i = 0; i < pointCount; i++) {
        const off = i * 4;
        if (hasSource) {
            colors[off] = foldChannel(r![i]!);
            colors[off + 1] = foldChannel(g![i]!);
            colors[off + 2] = foldChannel(b![i]!);
        } else {
            colors[off] = 255;
            colors[off + 1] = 255;
            colors[off + 2] = 255;
        }
        colors[off + 3] = 255;
    }
    return colors;
}

/** Folds a 16-bit channel down to 8 bits when the file stores wide colors. */
function foldChannel(value: number): number {
    return value > 255 ? value >> 8 : value;
}

/**
 * Grayscale buffer from unit intensities (value replicated across RGB).
 */
export function deriveIntensityColors(
    intensities: Float32Array,
): Uint8Array {
    const n = intensities.length;
    const colors = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
        const off = i * 4;
        const v = (intensities[i]! * 255) | 0;
        colors[off] = v;
        colors[off + 1] = v;
        colors[off + 2] = v;
        colors[off + 3] = 255;
    }
    return colors;
}

/**
 * Palette buffer from LAS classification codes.
 */
export function deriveClassificationColors(
    classifications: Uint8Array,
): Uint8Array {
    const n = classifications.length;
    const colors = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
        const off = i * 4;
        const rgb = CLASSIFICATION_COLORS[classifications[i]!] ?? [
            128, 128, 128,
        ];
        colors[off] = rgb[0];
        colors[off + 1] = rgb[1];
        colors[off + 2] = rgb[2];
        colors[off + 3] = 255;
    }
    return colors;
}

/**
 * Blue→red ramp over normalized height. `heights` holds one z per point —
 * see `extractHeights` for producing it from packed render positions.
 */
export function deriveElevationColors(
    heights: Float32Array,
    params: ElevationParams,
): Uint8Array {
    const n = heights.length;
    const colors = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
        const off = i * 4;
        const t = Math.max(0, Math.min(1, (heights[i]! - params.minZ) * params.invRange));
        colors[off] = (t * 255) | 0;
        colors[off + 1] = 0;
        colors[off + 2] = ((1 - t) * 255) | 0;
        colors[off + 3] = 255;
    }
    return colors;
}

/**
 * Copies the z component out of stride-3 render positions into a flat
 * per-point array (the input to `deriveElevationColors`).
 */
export function extractHeights(positions: Float32Array): Float32Array {
    const n = positions.length / 3;
    const heights = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        heights[i] = positions[i * 3 + 2]!;
    }
    return heights;
}
