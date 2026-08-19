import { EmbedBuilder } from "discord.js";
import type { QuestSummary } from "@core/quests";
import { COLORS, QUEST_MESSAGES } from "@constants";
import { formatDuration } from "@utils";

interface StatsTarget {
    id: string;
    username: string;
    avatarUrl?: string | null;
}

/**
 * One member's quest record.
 *
 * Shared by `/quest stats` and the `/profile` quest tab so the two can never disagree about what a
 * completion rate means — the arithmetic lives in `getQuestSummary`, and this only lays it out.
 */
export function buildQuestStatsEmbed(summary: QuestSummary, target: StatsTarget, isSelf: boolean): EmbedBuilder {
    const text = QUEST_MESSAGES.stats;

    if (summary.claimed === 0) {
        return new EmbedBuilder()
            .setTitle(text.title(target.username))
            .setColor(COLORS.info)
            .setDescription(isSelf ? text.emptySelf : text.emptyOther);
    }

    const duration = (ms: number | null): string => (ms === null ? text.noDuration : formatDuration(ms));

    const embed = new EmbedBuilder()
        .setTitle(text.title(target.username))
        .setColor(COLORS.activity)
        .addFields(
            {
                name: text.overallField,
                value: text.overallValue(
                    summary.claimed,
                    summary.completed,
                    summary.failed,
                    summary.completionRate,
                    summary.activeClaims,
                ),
                inline: true,
            },
            {
                name: text.difficultyField,
                value: text.difficultyValue(
                    summary.easyCompleted,
                    summary.normalCompleted,
                    summary.hardCompleted,
                    summary.goldenCompleted,
                    summary.vipCompleted,
                ),
                inline: true,
            },
            {
                name: text.timingField,
                value: text.timingValue(
                    duration(summary.fastestCompletionMs),
                    duration(summary.averageCompletionMs),
                    summary.firstPlaceFinishes,
                ),
                inline: true,
            },
            {
                name: text.rewardsField,
                value: text.rewardsValue(summary.pointsEarned),
                inline: true,
            },
            {
                name: text.communityField,
                value: text.communityValue(summary.communityCompleted, summary.communityContribution),
                inline: true,
            },
            {
                name: text.rankField,
                value: summary.rank > 0 ? text.rankValue(summary.rank) : text.unranked,
                inline: true,
            },
        );

    if (target.avatarUrl) embed.setThumbnail(target.avatarUrl);
    if (summary.lastCompletedAt) {
        embed.setFooter({ text: text.lastCompletionFooter }).setTimestamp(new Date(summary.lastCompletedAt));
    }

    return embed;
}
