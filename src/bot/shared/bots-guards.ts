import { Logger } from "@core/libs";
import { Colors } from "@core/config";
import type { BotClient } from "@core/BotClient";
import { EmbedBuilder, type Guild, type TextChannel } from "discord.js";

const GUARD_LOG_CHANNEL_ID = "1479752688718708757";

const allowedGuildIds = new Set<string>([
    ...(process.env.MainGuild ? [process.env.MainGuild.trim()] : []),
    ...(process.env.TestGuild
        ? process.env.TestGuild.split(",").map((id) => id.trim()).filter(Boolean)
        : []),
]);

function isAllowedGuild(guildId: string): boolean {
    return allowedGuildIds.has(guildId);
}

async function sendGuardLog(client: BotClient, guild: Guild, action: "left" | "blocked"): Promise<void> {
    try {
        const channel = client.channels.cache.get(GUARD_LOG_CHANNEL_ID) as TextChannel | undefined;
        if (!channel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setTitle("🛡️ Guild Guard")
            .setDescription(
                action === "left"
                    ? `Left unauthorized guild on startup.`
                    : `Blocked join to unauthorized guild.`,
            )
            .addFields(
                { name: "Guild", value: `${guild.name}`, inline: true },
                { name: "Guild ID", value: guild.id, inline: true },
                { name: "Members", value: `${guild.memberCount}`, inline: true },
            )
            .setColor(Colors.warning)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (err) {
        Logger.error(`Failed to send guard log: ${err}`, client.botName);
    }
}

export function setupGuildGuard(client: BotClient): void {
    client.guilds.cache.forEach((guild) => {
        if (!isAllowedGuild(guild.id)) {
            guild.leave().then(() => {
                Logger.warn(`Left unauthorized guild: ${guild.name} (${guild.id})`, client.botName);
                sendGuardLog(client, guild, "left");
            }).catch((err) => {
                Logger.error(`Failed to leave guild ${guild.name} (${guild.id}): ${err}`, client.botName);
            });
        }
    });

    client.on("guildCreate", (guild: Guild) => {
        if (!isAllowedGuild(guild.id)) {
            Logger.warn(`Joined unauthorized guild: ${guild.name} (${guild.id}), leaving...`, client.botName);
            sendGuardLog(client, guild, "blocked");
            guild.leave().catch((err) => {
                Logger.error(`Failed to leave guild ${guild.name} (${guild.id}): ${err}`, client.botName);
            });
        }
    });
}
