// mapdeck/src/core/utils/MinHeap.ts
// Generic binary min-heap with O(log n) push/pop.
// Used for priority queue in point cloud node loading.

export class MinHeap<T> {
    protected heap: T[] = [];

    constructor(protected readonly compare: (a: T, b: T) => number) {}

    get size(): number {
        return this.heap.length;
    }

    push(item: T): void {
        this.heap.push(item);
        this._bubbleUp(this.heap.length - 1);
    }

    pop(): T | undefined {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0]!;
        const last = this.heap.pop()!;
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    peek(): T | undefined {
        return this.heap[0];
    }

    clear(): void {
        this.heap = [];
    }

    protected _bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.compare(this.heap[i]!, this.heap[parent]!) < 0) {
                [this.heap[i], this.heap[parent]] = [
                    this.heap[parent]!,
                    this.heap[i]!,
                ];
                i = parent;
            } else break;
        }
    }

    protected _sinkDown(i: number): void {
        const n = this.heap.length;
        while (true) {
            let smallest = i;
            const l = 2 * i + 1;
            const r = 2 * i + 2;
            if (l < n && this.compare(this.heap[l]!, this.heap[smallest]!) < 0)
                smallest = l;
            if (r < n && this.compare(this.heap[r]!, this.heap[smallest]!) < 0)
                smallest = r;
            if (smallest === i) break;
            [this.heap[i], this.heap[smallest]] = [
                this.heap[smallest]!,
                this.heap[i]!,
            ];
            i = smallest;
        }
    }
}
