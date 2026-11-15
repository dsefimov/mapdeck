import { makeAutoObservable } from "mobx";
import type { SelectionMode } from "@core/common/selection";

/** A drag in progress, in screen pixels (canvas coordinates). */
export interface DragRect {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
}

/**
 * Session state of the selection tool: the one target layer, the active
 * combine mode and the rectangle being dragged. Lives in the state
 * container keyed by tool id, so a deactivate → activate keeps the setup.
 */
export class SelectionToolStore {
    targetLayerId: string | null = null;
    mode: SelectionMode = "new";
    dragRect: DragRect | null = null;

    constructor() {
        makeAutoObservable(this);
    }

    setTargetLayer(layerId: string | null): void {
        this.targetLayerId = layerId;
    }

    setMode(mode: SelectionMode): void {
        this.mode = mode;
    }

    setDragRect(rect: DragRect | null): void {
        this.dragRect = rect;
    }
}
