import { ComboRepository } from "@database/repositories";

/** Guild-wide rank of a user's highest active combo score. Returns -1 if the user has no active combo. */
export async function getUserComboRank(guildId: string, userId: string): Promise<number> {
    const active = await ComboRepository.findAllActive(guildId);
    const scoreByUser = new Map<string, number>();

    for (const pair of active) {
        scoreByUser.set(pair.userLowId, Math.max(scoreByUser.get(pair.userLowId) ?? 0, pair.currentScore));
        scoreByUser.set(pair.userHighId, Math.max(scoreByUser.get(pair.userHighId) ?? 0, pair.currentScore));
    }

    const myScore = scoreByUser.get(userId);
    if (myScore === undefined || myScore <= 0) return -1;

    let above = 0;
    for (const score of scoreByUser.values()) {
        if (score > myScore) above++;
    }
    return above + 1;
}
