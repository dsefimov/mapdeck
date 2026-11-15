/**
 * Generic binary min-heap with O(log n) push/pop.
 * A priority queue for ordered scheduling (load queues, timers).
 * The relative order of equal-priority items is not guaranteed.
 */
export class MinHeap<T> {
    private heap: T[] = [];

    constructor(private readonly compare: (a: T, b: T) => number) {}

    get size(): number {
        return this.heap.length;
    }

    push(item: T): void {
        this.heap.push(item);
        this.siftUp(this.heap.length - 1);
    }

    pop(): T | undefined {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0]!;
        const last = this.heap.pop()!;
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.siftDown(0);
        }
        return top;
    }

    peek(): T | undefined {
        return this.heap[0];
    }

    clear(): void {
        this.heap = [];
    }

    private isLess(i: number, j: number): boolean {
        return this.compare(this.heap[i]!, this.heap[j]!) < 0;
    }

    private swap(i: number, j: number): void {
        [this.heap[i], this.heap[j]] = [this.heap[j]!, this.heap[i]!];
    }

    private siftUp(index: number): void {
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!this.isLess(index, parent)) return;
            this.swap(index, parent);
            index = parent;
        }
    }

    private siftDown(index: number): void {
        for (;;) {
            let smallest = index;
            const left = 2 * index + 1;
            const right = left + 1;
            if (left < this.heap.length && this.isLess(left, smallest))
                smallest = left;
            if (right < this.heap.length && this.isLess(right, smallest))
                smallest = right;
            if (smallest === index) return;
            this.swap(index, smallest);
            index = smallest;
        }
    }
}
