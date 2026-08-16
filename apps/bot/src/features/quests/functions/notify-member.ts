import { EmbedBuilder, type Client } from "discord.js";
import { COLORS, type QuestTier } from "@constants";
import { setQuestNotifier, type QuestCompleted, type QuestExpired } from "@core/quests";
import { formatDuration } from "@utils";
import { Logger } from "@logger";
import { tierTitle, miniBar } from "../utils/quest-lines";

const CTX = "quests";

const RANK_SUFFIX = ["🥇 first to finish", "🥈 second", "🥉 third"];

/**
 * DMs a member when their quest resolves.
 *
 * A quest is claimed in a channel and then tracked silently for a day or a week — there is no other
 * moment the bot has anything to say to that member about it. Without this, finishing one looks
 * identical to forgetting about one: the points appear in a balance nobody was watching.
 *
 * Both handlers are best-effort. Closed DMs are the normal case for a large server, not an error,
 * and the reward has already been paid by the time this runs.
 */
export function registerQuestNotifier(client: Client): void {
    setQuestNotifier({
        onCompleted: event => void sendCompleted(client, event).catch(() => null),
        onExpired: event => void sendExpired(client, event).catch(() => null),
    });
}

async function guildName(client: Client, guildId: string): Promise<string> {
    const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
    return guild?.name ?? "the server";
}

async function dm(client: Client, discordId: string, embed: EmbedBuilder): Promise<void> {
    const user = await client.users.fetch(discordId).catch(() => null);
    if (!user) return;

    await user.send({ embeds: [embed] }).catch(() => {
        Logger.debug(`Could not DM ${discordId} — DMs are probably closed`, CTX);
    });
}

async function sendCompleted(client: Client, event: QuestCompleted): Promise<void> {
    const rank = RANK_SUFFIX[event.rank - 1] ?? `finished #${event.rank}`;

    const embed = new EmbedBuilder()
        .setTitle("✅ Quest complete")
        .setColor(COLORS.success)
        .setDescription(
            `You finished your **${tierTitle(event.tier as QuestTier)}** quest in **${await guildName(client, event.guildId)}**.\n\n` +
            event.missions.map(mission => `✅ ${mission.label}`).join("\n")
        )
        .addFields(
            { name: "Reward", value: `🎯 **${event.reward.toLocaleString()}** points — already paid`, inline: true },
            { name: "Finished", value: rank, inline: true },
            { name: "Took", value: formatDuration(event.durationMs), inline: true },
        )
        .setFooter({ text: "That slot is free again — claim the next one whenever it appears." })
        .setTimestamp();

    await dm(client, event.discordId, embed);
}

async function sendExpired(client: Client, event: QuestExpired): Promise<void> {
    const lines = event.missions.map(mission => {
        const value = Math.min(mission.target, mission.progress);
        const fraction = mission.target > 0 ? value / mission.target : 0;
        const done = value >= mission.target;

        return `${done ? "✅" : "▫️"} ${mission.label}\n\`${miniBar(fraction)}\` ${value.toLocaleString()} / ${mission.target.toLocaleString()}`;
    });

    const embed = new EmbedBuilder()
        .setTitle("⌛ Quest ended")
        .setColor(COLORS.warning)
        .setDescription(
            `Your **${tierTitle(event.tier as QuestTier)}** quest in **${await guildName(client, event.guildId)}** ran out of time.\n\n` +
            lines.join("\n")
        )
        .addFields({
            name: "Where you got to",
            value: `${event.missionsCompleted} of ${event.missionsTotal} objective(s) done`,
        })
        .setFooter({ text: "No penalty — your slot is free, so the next quest is yours to take." })
        .setTimestamp();

    await dm(client, event.discordId, embed);
}
