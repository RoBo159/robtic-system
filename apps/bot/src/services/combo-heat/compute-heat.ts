import { COMBO_CONFIG, COMBO_HEAT_BOUNDS, COMBO_HEAT_DECAY_FACTOR } from "@constants";

/** Exponential decay plus a message-driven gain, clamped to [0, 100]. Heat is UI/statistics only — it never ends a combo on its own. */
export function computeHeat(previousHeat: number, elapsedMs: number, alternating: boolean, confidence: number): number {
    const decayed = previousHeat * Math.pow(COMBO_HEAT_DECAY_FACTOR, Math.max(0, elapsedMs) / COMBO_CONFIG.heatHalfLifeMs);
    const gain = (alternating ? COMBO_CONFIG.heatGainAlternating : COMBO_CONFIG.heatGainSame) * confidence;
    return Math.max(COMBO_HEAT_BOUNDS.min, Math.min(COMBO_HEAT_BOUNDS.max, decayed + gain));
}
