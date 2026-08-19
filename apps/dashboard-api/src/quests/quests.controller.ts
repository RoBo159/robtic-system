import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { IsBoolean, IsInt, IsString, Matches, Max, Min } from "class-validator";
import {
    QuestSettingsRepository,
    QuestRepository,
    CommunityChallengeRepository,
    CoinsRepository,
} from "@database/repositories";
import { GuildAccessGuard } from "../auth/guild-access.guard";

class ChannelDto {
    @IsString()
    @Matches(/^\d{15,25}$/, { message: "not a Discord id" })
    channelId: string;
}

class TierDto {
    @IsBoolean()
    enabled: boolean;
}

class OffsetDto {
    // The same bounds the slash command enforces: UTC-12:00 to UTC+14:00, in minutes.
    @IsInt()
    @Min(-720)
    @Max(840)
    utcOffsetMinutes: number;
}

@Controller("guilds/:guildId/quests")
@UseGuards(GuildAccessGuard)
export class QuestsController {
    @Get("settings")
    async settings(@Param("guildId") guildId: string) {
        const settings = await QuestSettingsRepository.getCached(guildId);

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

    @Patch("settings/quest-channel")
    async setQuestChannel(@Param("guildId") guildId: string, @Body() body: ChannelDto) {
        await QuestSettingsRepository.setChannel(guildId, "questChannelId", body.channelId);
        return { ok: true };
    }

    @Patch("settings/community-channel")
    async setCommunityChannel(@Param("guildId") guildId: string, @Body() body: ChannelDto) {
        await QuestSettingsRepository.setChannel(guildId, "communityChannelId", body.channelId);
        return { ok: true };
    }

    @Patch("settings/tiers/:tier")
    async setTier(@Param("guildId") guildId: string, @Param("tier") tier: string, @Body() body: TierDto) {
        await QuestSettingsRepository.setTierEnabled(guildId, tier, body.enabled);
        return { ok: true };
    }

    @Patch("settings/offset")
    async setOffset(@Param("guildId") guildId: string, @Body() body: OffsetDto) {
        await QuestSettingsRepository.setUtcOffset(guildId, body.utcOffsetMinutes);
        return { ok: true };
    }

    /** What is open right now — the same board members see, without opening Discord. */
    @Get("board")
    async board(@Param("guildId") guildId: string) {
        const quests = await QuestRepository.findOpen(guildId);

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
            // `slotsTotal` is null for an unlimited tier, which the board renders as "no cap" rather
            // than as a number nobody set.
            slotsTotal: quest.slotsTotal,
            slotsTaken: quest.slotsTaken,
            slotsRemaining: quest.slotsRemaining,
            completionCount: quest.completionCount,
            endsAt: quest.endsAt,
            channelId: quest.channelId,
            messageId: quest.messageId,
        }));
    }

    @Get("community")
    async community(@Param("guildId") guildId: string) {
        const challenge = await CommunityChallengeRepository.findActive(guildId);
        if (!challenge) return { active: null };

        const contributors = await CommunityChallengeRepository.topContributors(guildId, challenge.weekKey, 10);

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

/**
 * Economy is one endpoint, not a module.
 *
 * Coins are global rather than per guild in this bot — CoinsRepository is keyed by Discord user id
 * alone — so there is no guild-scoped economy to configure, only a leaderboard to look at. Giving it
 * its own module would imply settings that do not exist.
 */
@Controller("guilds/:guildId/economy")
@UseGuards(GuildAccessGuard)
export class EconomyController {
    @Get("leaderboard")
    async leaderboard() {
        const top = await CoinsRepository.getTop(25);
        return top.map((entry, index) => ({
            rank: index + 1,
            userId: entry.discordId,
            username: entry.username,
            coins: entry.coins,
        }));
    }
}
