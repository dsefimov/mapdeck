import { makeAutoObservable } from "mobx";
import type {
    ThinnedPoints,
    VolumeMeasurements,
} from "./volume";

/** Triangulated top-surface mesh for the volume rendering. */
export type TinPolygons = [number, number, number][][];

const PHASE_DRAWING = "drawing" as const;
const PHASE_COMPLETE = "complete" as const;

/** Points + count pair carried between pipeline stages. */
type InsidePoints = ThinnedPoints;

/**
 * Typed tool state of the volume measure: the drawing phase and the cached
 * (expensive) computation results. Survives panel remounts via the
 * instance-state container. Mutations go through
 * the action methods.
 */
export class VolumeMeasureState {
    phase: typeof PHASE_DRAWING | typeof PHASE_COMPLETE = PHASE_DRAWING;
    insidePoints: InsidePoints = { points: [], foundCount: 0 };
    measurements: VolumeMeasurements | null = null;
    topSurface: TinPolygons | null = null;

    constructor() {
        makeAutoObservable(this);
    }

    get isComplete(): boolean {
        return this.phase === PHASE_COMPLETE;
    }

    /** Locks the boundary — the pipeline may now fill the results. */
    markComplete(): void {
        this.phase = PHASE_COMPLETE;
    }

    setInsidePoints(points: InsidePoints): void {
        this.insidePoints = points;
    }

    setMeasurements(measurements: VolumeMeasurements): void {
        this.measurements = measurements;
    }

    setTopSurface(surface: TinPolygons): void {
        this.topSurface = surface;
    }

    /** Discards all results (an invalid or reset boundary). */
    clearResults(): void {
        this.insidePoints = { points: [], foundCount: 0 };
        this.measurements = null;
        this.topSurface = null;
    }

    /** Back to the drawing phase — results are discarded. */
    resetToDrawing(): void {
        this.phase = PHASE_DRAWING;
        this.clearResults();
    }
}
