import { Injectable } from "@nestjs/common";
import { TOP_CONTRIBUTORS } from "../constants";
import type {
    CommunityChallengeResponse,
    QuestBoardEntryResponse,
    QuestSettingsResponse,
} from "../dto";
import { QuestsRepository, type QuestChannelField } from "../repositories";

/**
 * The quest system, as the dashboard sees it: settings, the open board, and the weekly challenge.
 *
 * Every method here is a projection or a single write. The scheduling, rotation and reward logic
 * lives in the bot — this service deliberately owns none of it, because two implementations of when
 * a quest expires is one more than a system can have.
 */
@Injectable()
export class QuestsService {
    constructor(private readonly repository: QuestsRepository) {}

    async settings(guildId: string): Promise<QuestSettingsResponse> {
        const settings = await this.repository.settings(guildId);

        return {
            questChannelId: settings.questChannelId,
            communityChannelId: settings.communityChannelId,
            mentionRoles: settings.mentionRoles,
            vipRoleIds: settings.vipRoleIds,
            enabledTiers: settings.enabledTiers,
            windows: settings.windows.map(window => ({
                key: window.key,
                startHour: window.startHour,
                endHour: window.endHour,
                enabled: window.enabled,
            })),
            utcOffsetMinutes: settings.utcOffsetMinutes,
            community: {
                enabled: settings.communityEnabled,
                rewardBase: settings.communityRewardBase,
                minContribution: settings.communityMinContribution,
            },
        };
    }

    setChannel(guildId: string, field: QuestChannelField, channelId: string): Promise<void> {
        return this.repository.setChannel(guildId, field, channelId);
    }

    setTierEnabled(guildId: string, tier: string, enabled: boolean): Promise<void> {
        return this.repository.setTierEnabled(guildId, tier, enabled);
    }

    setUtcOffset(guildId: string, utcOffsetMinutes: number): Promise<void> {
        return this.repository.setUtcOffset(guildId, utcOffsetMinutes);
    }

    async board(guildId: string): Promise<QuestBoardEntryResponse[]> {
        const quests = await this.repository.findOpen(guildId);

        return quests.map(quest => ({
            id: String(quest._id),
            tier: quest.tier,
            status: quest.status,
            reward: quest.reward,
            missions: quest.missions.map(mission => ({
                label: mission.label,
                metric: mission.metric,
                target: mission.target,
            })),
            slotsTotal: quest.slotsTotal,
            slotsTaken: quest.slotsTaken,
            slotsRemaining: quest.slotsRemaining,
            completionCount: quest.completionCount,
            endsAt: quest.endsAt,
            channelId: quest.channelId,
            messageId: quest.messageId,
        }));
    }

    async community(guildId: string): Promise<CommunityChallengeResponse> {
        const challenge = await this.repository.findActiveChallenge(guildId);

        if (!challenge) return { active: null };

        const contributors = await this.repository.topContributors(
            guildId,
            challenge.weekKey,
            TOP_CONTRIBUTORS,
        );

        return {
            active: {
                weekKey: challenge.weekKey,
                status: challenge.status,
                missions: challenge.missions.map(mission => ({
                    label: mission.label,
                    metric: mission.metric,
                    target: mission.target,
                })),
                target: challenge.target,
                total: challenge.total,
                contributorCount: challenge.contributorCount,
                rewardBase: challenge.rewardBase,
                minContribution: challenge.minContribution,
                startedAt: challenge.startedAt,
                endsAt: challenge.endsAt,
                settledAt: challenge.settledAt,
            },
            contributors: contributors.map(entry => ({
                userId: entry.discordId,
                username: entry.username,
                amount: entry.amount,
            })),
        };
    }
}
