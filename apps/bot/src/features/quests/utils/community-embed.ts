import { EmbedBuilder } from "discord.js";
import type { ICommunityChallenge, ICommunityContribution } from "@database/models";
import { COLORS } from "@constants";

const BAR_WIDTH = 20;
const MEDALS = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

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
    const total = challenge.total + pending;
    const fraction = challenge.target > 0 ? total / challenge.target : 0;
    const percent = Math.min(100, Math.round(fraction * 100));
    const done = total >= challenge.target;
    const over = challenge.status !== "active";

    const embed = new EmbedBuilder()
        .setTitle("🌍 Weekly Community Challenge")
        .setColor(done ? COLORS.success : over ? COLORS.error : COLORS.activity)
        .setDescription(challenge.missions.map(mission => `**${mission.label}**`).join("\n"))
        .addFields(
            {
                name: `Progress — ${percent}%`,
                value: `\`${progressBar(fraction)}\`\n${total.toLocaleString()} / ${challenge.target.toLocaleString()}`,
            },
            {
                name: "Reward",
                value: `🎯 ${challenge.rewardBase.toLocaleString()} points each\n🥇 ×3 · 🥈🥉 ×2 · 4th–5th ×1.5`,
                inline: true,
            },
        );

    if (!over) {
        embed.addFields({
            name: "Time left",
            value: `<t:${Math.floor(challenge.endsAt.getTime() / 1000)}:R>`,
            inline: true,
        });
    }

    if (top?.length) {
        embed.addFields({
            name: "Top contributors",
            value: top
                .map((row, index) => `${MEDALS[index] ?? `${index + 1}.`} <@${row.discordId}> — ${row.amount.toLocaleString()}`)
                .join("\n"),
        });
    }

    embed.setFooter({
        text: over
            ? done
                ? `Completed by ${challenge.contributorCount || top?.length || 0}+ contributors`
                : "The week ended before the goal was reached"
            : "Everyone contributes automatically — just be active",
    });

    return embed.setTimestamp(challenge.endsAt);
}
