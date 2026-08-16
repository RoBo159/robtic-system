import { STREAK_DEFAULTS } from "@constants";
import { nextClaimAt } from "./next-claim-at";

export function isClaimable(lastIncrement: Date, claimDays: number = STREAK_DEFAULTS.claimDays, now: Date = new Date()): boolean {
    return now.getTime() >= nextClaimAt(lastIncrement, claimDays).getTime();
}
