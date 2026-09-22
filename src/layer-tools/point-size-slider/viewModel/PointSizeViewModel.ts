import { makeAutoObservable } from "mobx";
import { isLayerNode, type LayerStyle } from "@core/contracts";
import { setPointSize } from "@core/domain/layer-tree";
import type { StoreRegistry } from "@core/store-registry";

/** How long a slider drag stays uncommitted to the layer style. */
const COMMIT_DELAY_MS = 150;

/**
 * View model of the point-size slider (ADR-0002 case-2): a debounced
 * style write with a pending indicator. The timer is domain-specific on
 * purpose — the pending flag is observable for the view, and each write
 * reads the node's current style so the model stays safe to cache per
 * node across panel remounts.
 */
export class PointSizeViewModel {
    isPending = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private lastSize: number | null = null;

    constructor(
        private readonly rootStore: StoreRegistry,
        private readonly nodeId: string,
    ) {
        makeAutoObservable<this, "timer" | "rootStore" | "nodeId" | "lastSize">(
            this,
            {
                timer: false,
                rootStore: false,
                nodeId: false,
                lastSize: false,
            },
        );
    }

    /** Queues a size from an ongoing drag; NaN never reaches the style. */
    update(size: number): void {
        if (Number.isNaN(size)) return;
        this.lastSize = size;
        this.isPending = true;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.fire(), COMMIT_DELAY_MS);
    }

    /** Commits a pending size now — the drag gesture's end. */
    commit(): void {
        if (!this.timer) return;
        clearTimeout(this.timer);
        this.fire();
    }

    private fire(): void {
        this.timer = null;
        this.isPending = false;
        if (this.lastSize === null) return;

        const node = this.rootStore.treeStore.node(this.nodeId);
        if (!node || !isLayerNode(node)) return;
        const style: LayerStyle | undefined = node.style;
        this.rootStore.treeStore.updateLayerStyle(
            this.nodeId,
            setPointSize(style ?? {}, this.lastSize),
        );
    }
}
