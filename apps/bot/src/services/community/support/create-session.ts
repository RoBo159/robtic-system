import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { Logger } from "@logger";

const CTX = "community:support";

export async function createSession(
    guildId: string,
    channelId: string,
    messageId: string,
    userId: string,
): Promise<boolean> {
    const existing = await SupportSessionRepository.findOpenByUser(channelId, userId);
    if (existing) {
        Logger.debug(`User ${userId} already has open session in ${channelId}, updating timestamp`, CTX);
        await SupportSessionRepository.touchSession(existing.userMessageId);
        return false;
    }

    Logger.debug(`Creating support session: user=${userId} channel=${channelId} msg=${messageId}`, CTX);
    await SupportSessionRepository.create({
        guildId,
        channelId,
        userMessageId: messageId,
        userId,
    });
    return true;
}
