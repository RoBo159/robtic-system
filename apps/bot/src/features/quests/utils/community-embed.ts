import { EmbedBuilder } from "discord.js";
import type { ICommunityChallenge, ICommunityContribution } from "@database/models";
import { COLORS, QUEST_COMMUNITY_MESSAGES } from "@constants";

const BAR_WIDTH = 20;

function progressBar(fraction: number): string {
    const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round(fraction * BAR_WIDTH)));
    return `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}`;
}

interface RenderInput {
    challenge: ICommunityChallenge;
    /** Buffered contribution not yet written, so the bar shows the live number. */
    pending?: number;
    /** Populated only once the week is over. */
    top?: ICommunityContribution[];
}

/**
 * The single embed edited all week.
 *
 * The remaining time uses Discord's relative timestamp, which the client renders itself — so the
 * countdown stays correct without the bot ever editing the message for it. That removes the only
 * reason this would need a heartbeat edit, and it is the largest saving available on a message
 * that lives for seven days.
 */
export function buildCommunityEmbed({ challenge, pending = 0, top }: RenderInput): EmbedBuilder {
    const text = QUEST_COMMUNITY_MESSAGES;

    const total = challenge.total + pending;
    const fraction = challenge.target > 0 ? total / challenge.target : 0;
    const percent = Math.min(100, Math.round(fraction * 100));
    const done = total >= challenge.target;
    const over = challenge.status !== "active";

    const embed = new EmbedBuilder()
        .setTitle(text.title)
        .setColor(done ? COLORS.success : over ? COLORS.error : COLORS.activity)
        .setDescription(challenge.missions.map(mission => text.mission(mission.label)).join("\n"))
        .addFields(
            {
                name: text.progressField(percent),
                value: text.progressValue(progressBar(fraction), total, challenge.target),
            },
            {
                name: text.rewardField,
                value: text.rewardValue(challenge.rewardBase),
                inline: true,
            },
        );

    if (!over) {
        embed.addFields({
            name: text.timeLeftField,
            value: text.timeLeftValue(challenge.endsAt),
            inline: true,
        });
    }

    if (top?.length) {
        embed.addFields({
            name: text.topField,
            value: top
                .map((row, index) => text.topRow(text.medals[index] ?? text.fallbackMedal(index), row.discordId, row.amount))
                .join("\n"),
        });
    }

    embed.setFooter({
        text: over
            ? done
                ? text.footerCompleted(challenge.contributorCount || top?.length || 0)
                : text.footerMissed
            : text.footerRunning,
    });

    return embed.setTimestamp(challenge.endsAt);
}
