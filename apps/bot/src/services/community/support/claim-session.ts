import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { Logger } from "@logger";

const CTX = "community:support";

export async function claimSession(
    messageId: string,
    staffId: string,
    guildId: string,
): Promise<boolean> {
    const session = await SupportSessionRepository.claim(messageId, staffId);
    if (!session) {
        Logger.debug(`Claim failed for msg=${messageId} by staff=${staffId} (already claimed or not found)`, CTX);
        return false;
    }

    Logger.debug(`Session claimed: msg=${messageId} by staff=${staffId}`, CTX);
    await ActivityLogRepository.log({
        guildId,
        userId: staffId,
        type: "support_claim",
        amount: 0,
        details: `Claimed support session in channel ${session.channelId}`,
    });

    return true;
}
