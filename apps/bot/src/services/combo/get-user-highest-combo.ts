import type { ICombo } from "@database/models";
import { ComboRepository } from "@database/repositories";

export async function getUserHighestCombo(guildId: string, userId: string): Promise<{ pair: ICombo; partnerId: string } | null> {
    const pairs = await ComboRepository.findActiveForUser(guildId, userId);
    if (pairs.length === 0) return null;

    const best = pairs.reduce((a, b) => (a.currentScore >= b.currentScore ? a : b));
    const partnerId = best.userLowId === userId ? best.userHighId : best.userLowId;
    return { pair: best, partnerId };
}
