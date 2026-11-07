import { useMemo, useState } from "react";

export interface ContextMenuPosition {
    x: number;
    y: number;
}

export interface MenuSize {
    width: number;
    height: number;
    margin: number;
}

export interface ContextMenuApi {
    position: ContextMenuPosition | null;
    open: (pos: ContextMenuPosition) => void;
    close: () => void;
}

export function useContextMenu(): ContextMenuApi {
    const [position, setPosition] = useState<ContextMenuPosition | null>(
        null,
    );

    // Memoized so consumers that park the API in an effect keep a stable
    // object between position changes.
    return useMemo<ContextMenuApi>(
        () => ({
            position,
            open: setPosition,
            close: () => setPosition(null),
        }),
        [position],
    );
}
