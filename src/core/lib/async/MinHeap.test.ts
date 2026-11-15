import { describe, expect, it } from "vitest";
import { MinHeap } from "./MinHeap";

describe("MinHeap", () => {
    it("pops in compare order regardless of push order", () => {
        const heap = new MinHeap<number>((a, b) => a - b);
        for (const value of [5, 1, 4, 2, 3]) heap.push(value);

        const out: number[] = [];
        while (heap.size > 0) out.push(heap.pop()!);

        expect(out).toEqual([1, 2, 3, 4, 5]);
    });

    it("honours an arbitrary comparator (max-heap)", () => {
        const heap = new MinHeap<number>((a, b) => b - a);
        heap.push(1);
        heap.push(3);

        expect(heap.pop()).toBe(3);
        expect(heap.pop()).toBe(1);
    });

    it("pops undefined from an empty heap and reports size", () => {
        const heap = new MinHeap<number>((a, b) => a - b);

        expect(heap.size).toBe(0);
        expect(heap.pop()).toBeUndefined();
    });

    it("handles objects by the comparator's criterion", () => {
        interface Task {
            rank: number;
            label: string;
        }
        const heap = new MinHeap<Task>((a, b) => a.rank - b.rank);
        heap.push({ rank: 2, label: "later" });
        heap.push({ rank: 1, label: "first" });

        expect(heap.pop()?.label).toBe("first");
    });

    it("peek returns the minimum without removing it", () => {
        const heap = new MinHeap<number>((a, b) => a - b);
        heap.push(3);
        heap.push(1);

        expect(heap.peek()).toBe(1);
        expect(heap.size).toBe(2);
    });

    it("clear empties the heap", () => {
        const heap = new MinHeap<number>((a, b) => a - b);
        heap.push(1);
        heap.push(2);

        heap.clear();

        expect(heap.size).toBe(0);
        expect(heap.pop()).toBeUndefined();
    });

    it("keeps every duplicate of an equal priority", () => {
        const heap = new MinHeap<number>((a, b) => a - b);
        for (const value of [2, 1, 2, 1, 2]) heap.push(value);

        const out: number[] = [];
        while (heap.size > 0) out.push(heap.pop()!);

        expect(out).toEqual([1, 1, 2, 2, 2]);
    });

    it("drains any random input in sorted order (property)", () => {
        let seed = 42;
        const rnd = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };

        for (let round = 0; round < 10; round++) {
            const values = Array.from(
                { length: 50 },
                () => Math.floor(rnd() * 100),
            );
            const heap = new MinHeap<number>((a, b) => a - b);
            for (const value of values) heap.push(value);

            const drained: number[] = [];
            while (heap.size > 0) drained.push(heap.pop()!);

            expect(drained).toEqual([...values].sort((a, b) => a - b));
        }
    });
});
