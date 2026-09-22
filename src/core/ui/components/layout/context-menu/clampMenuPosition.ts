import type { MenuSize } from "./useContextMenu";

/**
 * Pull a menu position back into the viewport when the menu would overflow
 * its bottom-right corner, leaving a margin; an on-screen position is unchanged.
 */
export function clampMenuPosition(
    position: { x: number; y: number },
    menuSize: MenuSize,
    viewport: { width: number; height: number },
): { x: number; y: number } {
    return {
        x:
            position.x + menuSize.width > viewport.width
                ? viewport.width - menuSize.width - menuSize.margin
                : position.x,
        y:
            position.y + menuSize.height > viewport.height
                ? viewport.height - menuSize.height - menuSize.margin
                : position.y,
    };
}
