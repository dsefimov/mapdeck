export type DeviceTier = "low" | "mid" | "high";

export interface EffectiveBaseline {
    pointBudget: number;
    maxScreenErrorPx: number;
}
