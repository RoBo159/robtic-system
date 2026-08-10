import { EmbedBuilder, type Guild, type TextChannel } from "discord.js";
import { Logger } from "@logger";
import { COLORS, GUARD_MESSAGES } from "@constants";
import type { BotClient } from "@core/bot-client";
import { getLogChannel } from "@bot/utils/server-log";

export async function sendGuardLog(client: BotClient, guild: Guild, action: "left" | "blocked"): Promise<void> {
    try {
        const channel = await getLogChannel(client, "guard_log") as TextChannel | undefined;
        if (!channel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setTitle(GUARD_MESSAGES.embedTitle)
            .setDescription(
                action === "left"
                    ? GUARD_MESSAGES.leftUnauthorizedGuild
                    : GUARD_MESSAGES.blockedUnauthorizedJoin,
            )
            .addFields(
                { name: GUARD_MESSAGES.fieldGuild, value: `${guild.name}`, inline: true },
                { name: GUARD_MESSAGES.fieldGuildId, value: guild.id, inline: true },
                { name: GUARD_MESSAGES.fieldMembers, value: `${guild.memberCount}`, inline: true },
            )
            .setColor(COLORS.warning)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (err) {
        Logger.error(`Failed to send guard log: ${err}`, client.botName);
    }
}
