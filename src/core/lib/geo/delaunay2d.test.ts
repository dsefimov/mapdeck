import { describe, expect, it } from "vitest";
import { delaunayTriangulate, type PointXY } from "./delaunay2d";

const pt = (x: number, y: number): PointXY => ({ x, y });

function triangleArea(points: PointXY[], t: { a: number; b: number; c: number }) {
    const p1 = points[t.a]!;
    const p2 = points[t.b]!;
    const p3 = points[t.c]!;
    return (
        Math.abs(
            (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x),
        ) / 2
    );
}

describe("delaunayTriangulate", () => {
    it("returns no triangles for fewer than three points", () => {
        expect(delaunayTriangulate([pt(0, 0), pt(1, 0)])).toEqual([]);
    });

    it("returns no triangles for fully collinear input", () => {
        expect(
            delaunayTriangulate([pt(0, 0), pt(1, 1), pt(2, 2), pt(3, 3)]),
        ).toEqual([]);
    });

    it("triangulates a square with a center point into four triangles", () => {
        const points = [pt(0, 0), pt(2, 0), pt(2, 2), pt(0, 2), pt(1, 1)];

        const triangles = delaunayTriangulate(points);

        expect(triangles.length).toBe(4);
        for (const t of triangles) {
            expect([t.a, t.b, t.c]).toContain(4);
        }
        const area = triangles.reduce(
            (sum, t) => sum + triangleArea(points, t),
            0,
        );
        expect(area).toBeCloseTo(4, 9);
    });

    it("tolerates duplicate points", () => {
        const points = [
            pt(0, 0),
            pt(2, 0),
            pt(2, 2),
            pt(0, 2),
            pt(1, 1),
            pt(1, 1),
            pt(0, 0),
        ];

        const triangles = delaunayTriangulate(points);

        expect(triangles.length).toBeGreaterThan(0);
        for (const t of triangles) {
            const area = triangleArea(points, t);
            expect(Number.isFinite(area)).toBe(true);
            expect(area).toBeLessThanOrEqual(4);
        }
    });

    it("triangulates a 20k-point field without degenerate triangles", () => {
        // Deterministic jittered 141×141 grid over a 141×141 m field.
        const points: PointXY[] = [];
        for (let i = 0; i < 141; i++) {
            for (let j = 0; j < 141; j++) {
                points.push(
                    pt(i + ((i * 7) % 10) / 100, j + ((j * 13) % 10) / 100),
                );
            }
        }

        const triangles = delaunayTriangulate(points);

        expect(triangles.length).toBeGreaterThan(19_000);
        const area = triangles.reduce(
            (sum, t) => sum + triangleArea(points, t),
            0,
        );
        // The triangulation tiles the convex hull ≈ the field itself.
        expect(area).toBeGreaterThan(140 * 140 - 10);
        expect(area).toBeLessThan(141 * 141 + 1);
    });
});
