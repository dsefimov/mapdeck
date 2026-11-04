import { describe, expect, it } from "vitest";
import { cachedNode } from "../__testFactories";
import { DecodedNodeCache } from "./DecodedNodeCache";

const KEY = "1-0-0-0";

/** A decoded node with `points` points and optional derived buffers. */
function decodedNode(
    key: string,
    points: number,
    extras: "none" | "intensity" = "none",
) {
    return cachedNode(key, {
        state: "loaded",
        pointCount: points,
        positions: new Float32Array(points * 3),
        colorsRgb: new Uint8Array(points * 4),
        intensities: new Float32Array(points),
        classifications: new Uint8Array(points),
        ...(extras === "intensity" && {
            colorsIntensity: new Uint8Array(points * 4),
        }),
    });
}

describe("DecodedNodeCache", () => {
    it("returns a salvaged payload on take, and only once", () => {
        const cache = new DecodedNodeCache(1024 * 1024);
        const node = decodedNode(KEY, 10);

        cache.salvage(node);
        const payload = cache.take(KEY, 10);

        expect(payload?.positions).toBe(node.positions);
        expect(cache.take(KEY, 10)).toBeNull();
        expect(cache.bytes).toBe(0);
    });

    it("drops a mismatched entry instead of restoring it", () => {
        const cache = new DecodedNodeCache(1024 * 1024);
        cache.salvage(decodedNode(KEY, 10));

        expect(cache.take(KEY, 99)).toBeNull();
        expect(cache.size).toBe(0);
    });

    it("ignores nodes that were never fully decoded", () => {
        const cache = new DecodedNodeCache(1024 * 1024);
        cache.salvage(cachedNode(KEY, { state: "pending", pointCount: 5 }));

        expect(cache.size).toBe(0);
    });

    it("sheds the least recently salvaged payloads on overflow", () => {
        // One decoded point ≈ 21 bytes (12 pos + 4 rgb + 4 intensity + 1 cls);
        // a 1050-byte budget holds one 40-point payload (840 B) but not two.
        const cache = new DecodedNodeCache(21 * 50);
        cache.salvage(decodedNode("1-0-0-0", 40));
        cache.salvage(decodedNode("1-0-0-1", 40));
        cache.salvage(decodedNode("1-0-0-2", 40));

        // The oldest two were shed; the newest is intact.
        expect(cache.take("1-0-0-0", 40)).toBeNull();
        expect(cache.take("1-0-0-1", 40)).toBeNull();
        expect(cache.take("1-0-0-2", 40)).not.toBeNull();
    });

    it("accounts derived scheme buffers in the byte budget", () => {
        // 40 points with the intensity scheme buffer cost 25 B/pt = 1000 B;
        // the 840-byte budget sheds the payload.
        const cache = new DecodedNodeCache(21 * 40);
        cache.salvage(decodedNode("1-0-0-0", 40, "intensity"));

        expect(cache.size).toBe(0);
    });

    it("keeps nothing when disabled", () => {
        const cache = new DecodedNodeCache(0);
        cache.salvage(decodedNode(KEY, 10));

        expect(cache.size).toBe(0);
        expect(cache.take(KEY, 10)).toBeNull();
    });
});
