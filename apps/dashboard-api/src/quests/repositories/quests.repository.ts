import { Injectable } from "@nestjs/common";
import {
    CommunityChallengeRepository,
    QuestRepository,
    QuestSettingsRepository,
} from "@database/repositories";
import type {
    ICommunityChallenge,
    ICommunityContribution,
    IQuest,
    IQuestSettings,
} from "@database/models";

/** Which of the two channel fields a write targets — the underlying setter is keyed by field name. */
export type QuestChannelField = "questChannelId" | "communityChannelId";

/**
 * Quest settings, the open board, and the weekly community challenge.
 *
 * Three static repositories behind one injectable, for the same reason as `SettingsRepository`: the
 * controller imported all three directly and there was no seam between an HTTP handler and MongoDB.
 */
@Injectable()
export class QuestsRepository {
    settings(guildId: string): Promise<IQuestSettings> {
        return QuestSettingsRepository.getCached(guildId);
    }

    async setChannel(guildId: string, field: QuestChannelField, channelId: string): Promise<void> {
        await QuestSettingsRepository.setChannel(guildId, field, channelId);
    }

    async setTierEnabled(guildId: string, tier: string, enabled: boolean): Promise<void> {
        await QuestSettingsRepository.setTierEnabled(guildId, tier, enabled);
    }

    async setUtcOffset(guildId: string, utcOffsetMinutes: number): Promise<void> {
        await QuestSettingsRepository.setUtcOffset(guildId, utcOffsetMinutes);
    }

    /** The quests members can still take — what the board shows. */
    findOpen(guildId: string): Promise<IQuest[]> {
        return QuestRepository.findOpen(guildId);
    }

    findActiveChallenge(guildId: string): Promise<ICommunityChallenge | null> {
        return CommunityChallengeRepository.findActive(guildId);
    }

    topContributors(guildId: string, weekKey: string, limit: number): Promise<ICommunityContribution[]> {
        return CommunityChallengeRepository.topContributors(guildId, weekKey, limit);
    }
}
