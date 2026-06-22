/** Octree key "D-X-Y-Z" parsing and child-key generation — single source of truth. */

export type OctreeKey = [number, number, number, number];

/** Parse an octree key string "D-X-Y-Z" into [depth, x, y, z]. Throws on invalid input. */
export function parseOctreeKey(key: string): OctreeKey {
    const parts = key.split("-").map(Number);
    if (parts.length !== 4 || parts.some((v) => isNaN(v))) {
        throw new Error(`Invalid octree key: "${key}"`);
    }
    return parts as OctreeKey;
}

/** Generate the 8 child keys of an octree node "D-X-Y-Z". */
export function getOctreeChildKeys(key: string): string[] {
    const [d, x, y, z] = parseOctreeKey(key);
    const dc = d + 1;
    const children: string[] = [];
    for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
            for (let dz = 0; dz <= 1; dz++) {
                children.push(`${dc}-${x * 2 + dx}-${y * 2 + dy}-${z * 2 + dz}`);
            }
        }
    }
    return children;
}

/** Compute the parent key for an octree node key "D-X-Y-Z". Returns null for depth 0. */
export function getOctreeParentKey(key: string): string | null {
    const [d, x, y, z] = parseOctreeKey(key);
    if (d === 0) return null;
    return `${d - 1}-${Math.floor(x / 2)}-${Math.floor(y / 2)}-${Math.floor(z / 2)}`;
}
