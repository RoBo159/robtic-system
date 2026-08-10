import { COMBO_HEAT_THRESHOLDS, COMBO_HEAT_LABELS } from "@constants";

export function heatStatusLabel(heat: number): string {
    if (heat >= COMBO_HEAT_THRESHOLDS.veryActive) return COMBO_HEAT_LABELS.veryActive;
    if (heat >= COMBO_HEAT_THRESHOLDS.active) return COMBO_HEAT_LABELS.active;
    if (heat >= COMBO_HEAT_THRESHOLDS.cooling) return COMBO_HEAT_LABELS.cooling;
    return COMBO_HEAT_LABELS.cold;
}
