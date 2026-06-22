/**
 * LOD separation: base traversal vs skip traversal, and ancestor content links.
 */

import type { CachedNode } from "@core/framework/types";
import type { NodeMetadataRegistry } from "../metadata/NodeMetadataRegistry";

/**
 * Per-node ancestor metadata stored via WeakMap side-car.
 * Replaces _ancestorWithContent, _ancestorWithContentAvailable, _requestedFrame
 * on the public CachedNode type.
 */
export interface AncestorLinks {
    ancestorWithContent: CachedNode | undefined;
    ancestorWithContentAvailable: CachedNode | undefined;
    requestedFrame: number | undefined;
}

/**
 * Propagate ancestor content links from parent to child.
 *
 * Two ancestor chains are maintained:
 * - ancestorWithContent: nearest ancestor that has content (loaded OR loading).
 * - ancestorWithContentAvailable: nearest ancestor with content in READY state.
 */
export function updateTileAncestorContentLinks(
    tile: CachedNode,
    frameNumber: number,
    registry: NodeMetadataRegistry,
): void {
    const links = registry.ancestorLinks(tile);
    links.ancestorWithContent = undefined;
    links.ancestorWithContentAvailable = undefined;

    const parent = tile.parent;
    if (!parent) return;

    const parentLinks = registry.ancestorLinks(parent);

    // Parent has content if it doesn't have unloaded renderable content,
    // OR if it was requested this frame.
    const parentHasContent =
        !parent.hasUnloadedRenderableContent ||
        parentLinks.requestedFrame === frameNumber;

    links.ancestorWithContent = parentHasContent
        ? parent
        : parentLinks.ancestorWithContent;

    links.ancestorWithContentAvailable = parent.contentAvailable
        ? parent
        : parentLinks.ancestorWithContentAvailable;
}
