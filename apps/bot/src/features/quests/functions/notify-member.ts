import { EmbedBuilder, type Client } from "discord.js";
import { COLORS, QUEST_MESSAGES, type QuestTier } from "@constants";
import { setQuestNotifier, type QuestCompleted, type QuestExpired } from "@core/quests";
import { formatDuration } from "@utils";
import { Logger } from "@logger";
import { tierTitle, miniBar } from "../utils/quest-lines";

const CTX = "quests";

const TEXT = QUEST_MESSAGES.dm;

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
    return guild?.name ?? TEXT.unknownGuild;
}

async function dm(client: Client, discordId: string, embed: EmbedBuilder): Promise<void> {
    const user = await client.users.fetch(discordId).catch(() => null);
    if (!user) return;

    await user.send({ embeds: [embed] }).catch(() => {
        Logger.debug(`Could not DM ${discordId} — DMs are probably closed`, CTX);
    });
}

async function sendCompleted(client: Client, event: QuestCompleted): Promise<void> {
    const text = TEXT.completed;
    const rank = TEXT.rankSuffix[event.rank - 1] ?? TEXT.rankFallback(event.rank);

    const embed = new EmbedBuilder()
        .setTitle(text.title)
        .setColor(COLORS.success)
        .setDescription(text.description(
            tierTitle(event.tier as QuestTier),
            await guildName(client, event.guildId),
            event.missions.map(mission => text.missionLine(mission.label)).join("\n"),
        ))
        .addFields(
            { name: text.rewardField, value: text.rewardValue(event.reward), inline: true },
            { name: text.rankField, value: rank, inline: true },
            { name: text.durationField, value: formatDuration(event.durationMs), inline: true },
        )
        .setFooter({ text: text.footer })
        .setTimestamp();

    await dm(client, event.discordId, embed);
}

async function sendExpired(client: Client, event: QuestExpired): Promise<void> {
    const text = TEXT.expired;

    const lines = event.missions.map(mission => {
        const value = Math.min(mission.target, mission.progress);
        const fraction = mission.target > 0 ? value / mission.target : 0;

        return text.missionLine(mission.label, miniBar(fraction), value, mission.target, value >= mission.target);
    });

    const embed = new EmbedBuilder()
        .setTitle(text.title)
        .setColor(COLORS.warning)
        .setDescription(text.description(
            tierTitle(event.tier as QuestTier),
            await guildName(client, event.guildId),
            lines.join("\n"),
        ))
        .addFields({
            name: text.progressField,
            value: text.progressValue(event.missionsCompleted, event.missionsTotal),
        })
        .setFooter({ text: text.footer })
        .setTimestamp();

    await dm(client, event.discordId, embed);
}
