import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { CLAIM_INACTIVE_MS, SUPPORT_SCORING } from "@constants";
import { Logger } from "@logger";

const CTX = "community:support";

export interface ClaimResult {
    claimed: boolean;
    intruding?: { sessionUserId: string; claimedBy: string };
    takeover?: { sessionUserId: string; previousStaff: string };
}

export async function autoClaimSession(
    channelId: string,
    staffId: string,
    guildId: string,
): Promise<ClaimResult> {
    const openSessions = await SupportSessionRepository.findOpen(channelId);
    const result: ClaimResult = { claimed: false };

    for (const session of openSessions) {
        if (!session.claimedBy) {
            const claimResult = await SupportSessionRepository.claim(session.userMessageId, staffId);
            if (claimResult) {
                Logger.debug(`Auto-claimed session msg=${session.userMessageId} by staff=${staffId}`, CTX);
                await ActivityLogRepository.log({
                    guildId,
                    userId: staffId,
                    type: "support_claim",
                    amount: 0,
                    details: `Auto-claimed support session in channel ${channelId}`,
                });
                result.claimed = true;
            }
        } else if (session.claimedBy !== staffId) {
            const lastActivity = session.respondedAt ?? session.claimedAt;
            const inactiveMs = lastActivity ? Date.now() - lastActivity.getTime() : Infinity;

            if (inactiveMs >= CLAIM_INACTIVE_MS) {
                const previousStaff = session.claimedBy;
                const reassigned = await SupportSessionRepository.reassign(session.userMessageId, staffId);
                if (reassigned) {
                    Logger.debug(`Takeover: session msg=${session.userMessageId} reassigned from ${previousStaff} to ${staffId} (inactive ${Math.round(inactiveMs / 1000)}s)`, CTX);
                    await ActivityLogRepository.log({
                        guildId,
                        userId: staffId,
                        type: "support_claim",
                        amount: 0,
                        details: `Took over session from ${previousStaff} (inactive ${Math.round(inactiveMs / 1000)}s) in ${channelId}`,
                    });
                    await ActivityRepository.findOrCreate(previousStaff, guildId, "staff");
                    await ActivityRepository.addSupportPoints(previousStaff, guildId, SUPPORT_SCORING.takeoverPenalty);
                    await ActivityLogRepository.log({
                        guildId,
                        userId: previousStaff,
                        type: "support_penalty",
                        amount: SUPPORT_SCORING.takeoverPenalty,
                        details: `Ignored user in ${channelId}, session taken over by ${staffId}`,
                    });
                    result.claimed = true;
                    result.takeover = { sessionUserId: session.userId, previousStaff };
                }
            } else {
                result.intruding = { sessionUserId: session.userId, claimedBy: session.claimedBy };
            }
        }
    }

    return result;
}
