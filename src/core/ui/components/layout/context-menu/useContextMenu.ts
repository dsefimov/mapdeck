import { useLocalObservable } from "mobx-react-lite";

export interface ContextMenuPosition {
    x: number;
    y: number;
}

export interface MenuSize {
    width: number;
    height: number;
    margin: number;
}

export interface MapContextMenuAPI {
    isOpen: boolean;
    position: ContextMenuPosition | null;
    open: (pos: ContextMenuPosition) => void;
    close: () => void;
}

export function useMapContextMenu(): MapContextMenuAPI {
    return useLocalObservable<MapContextMenuAPI>(() => ({
        isOpen: false,
        position: null,
        open(pos: ContextMenuPosition): void {
            this.isOpen = true;
            this.position = pos;
        },
        close(): void {
            this.isOpen = false;
            this.position = null;
        },
    }));
}
