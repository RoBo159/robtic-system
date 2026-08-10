import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { SUPPORT_POINTS } from "@constants";

export async function penalizeAbandon(
    messageId: string,
    guildId: string,
): Promise<void> {
    const session = await SupportSessionRepository.findByMessage(messageId);
    if (!session || !session.claimedBy || session.resolved) return;

    const penalty = SUPPORT_POINTS.claimAbandonPenalty;
    await ActivityRepository.addStaffPenalty(session.claimedBy, guildId, Math.abs(penalty));
    await ActivityRepository.addSupportPoints(session.claimedBy, guildId, penalty);

    await ActivityLogRepository.log({
        guildId,
        userId: session.claimedBy,
        type: "support_penalty",
        amount: penalty,
        details: `Abandoned claimed support session in ${session.channelId}`,
    });
}
