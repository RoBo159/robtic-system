import type { ICombo } from "@database/models";
import { COMBO_CONFIG } from "@constants";

/**
 * Checked per-participant (not just the pair's overall last message) so a combo ends the moment
 * EITHER side goes quiet for the expiry window — one person messaging alone must not keep a combo
 * alive while the other side is being ignored. Exported so the scheduler's sweep
 * (finalizeExpiredCombos) uses the exact same rule as the hot path.
 */
export function isStale(pair: ICombo, now: number): boolean {
    if (pair.status === "ended") return true;
    // Fall back to the shared timestamp for pairs written before per-participant tracking existed;
    // the next message from either side repopulates both fields going forward.
    const lowTimestamp = pair.lastMessageAtLow ?? pair.lastMessageAt;
    const highTimestamp = pair.lastMessageAtHigh ?? pair.lastMessageAt;
    const lowSilentMs = now - lowTimestamp.getTime();
    const highSilentMs = now - highTimestamp.getTime();
    return lowSilentMs > COMBO_CONFIG.expireMs || highSilentMs > COMBO_CONFIG.expireMs;
}
