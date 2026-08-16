import { EmbedBuilder } from "discord.js";
import type { QuestSummary } from "@core/quests";
import { COLORS } from "@constants";
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
    if (summary.claimed === 0) {
        return new EmbedBuilder()
            .setTitle(`🗺️ Quest record — ${target.username}`)
            .setColor(COLORS.info)
            .setDescription(isSelf
                ? "You have not claimed a quest yet. `/quest board` shows what is open."
                : "This member has not claimed a quest yet.");
    }

    const embed = new EmbedBuilder()
        .setTitle(`🗺️ Quest record — ${target.username}`)
        .setColor(COLORS.activity)
        .addFields(
            {
                name: "Overall",
                value:
                    `Claimed **${summary.claimed.toLocaleString()}**\n` +
                    `Completed **${summary.completed.toLocaleString()}**\n` +
                    `Failed **${summary.failed.toLocaleString()}**\n` +
                    `Completion rate **${summary.completionRate}%**` +
                    (summary.activeClaims > 0 ? `\nOn **${summary.activeClaims}** right now` : ""),
                inline: true,
            },
            {
                name: "By difficulty",
                value:
                    `🟢 Easy **${summary.easyCompleted.toLocaleString()}**\n` +
                    `🔵 Normal **${summary.normalCompleted.toLocaleString()}**\n` +
                    `🟣 Hard **${summary.hardCompleted.toLocaleString()}**\n` +
                    `🌟 Golden **${summary.goldenCompleted.toLocaleString()}**\n` +
                    `💎 VIP **${summary.vipCompleted.toLocaleString()}**`,
                inline: true,
            },
            {
                name: "Timing",
                value:
                    `Fastest **${summary.fastestCompletionMs === null ? "—" : formatDuration(summary.fastestCompletionMs)}**\n` +
                    `Average **${summary.averageCompletionMs === null ? "—" : formatDuration(summary.averageCompletionMs)}**\n` +
                    `First to finish **${summary.firstPlaceFinishes.toLocaleString()}×**`,
                inline: true,
            },
            {
                name: "Rewards",
                value: `🎯 **${summary.pointsEarned.toLocaleString()}** points`,
                inline: true,
            },
            {
                name: "Community",
                value:
                    `🌍 **${summary.communityCompleted.toLocaleString()}** challenges\n` +
                    `📈 **${summary.communityContribution.toLocaleString()}** contributed`,
                inline: true,
            },
            {
                name: "Server rank",
                value: summary.rank > 0 ? `#${summary.rank}` : "Unranked",
                inline: true,
            },
        );

    if (target.avatarUrl) embed.setThumbnail(target.avatarUrl);
    if (summary.lastCompletedAt) {
        embed.setFooter({ text: "Last completion" }).setTimestamp(new Date(summary.lastCompletedAt));
    }

    return embed;
}
