import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { MINECRAFT_STATUS } from "@constants";
import { MinecraftServerRepository } from "@database/repositories";
import { buildLiveStatusEmbed, buildServerButtons } from "../utils/minecraft/server-info-embed";

/**
 * `!status` / `/status` — live server telemetry.
 *
 * Stale heartbeats are promoted to CRASHED before rendering rather than after, so a server whose
 * process died is never shown as ONLINE with a several-minute-old player count. A process that has
 * died cannot report its own death, which is why the check has to happen on this side.
 */
export default {
    category: "Minecraft",
    data: new SlashCommandBuilder()
        .setName("status")
        .setDescription("Show live Minecraft server status, TPS, memory and uptime"),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: "This command can only be used in a server." });
            return;
        }

        await interaction.deferReply();

        await MinecraftServerRepository.markStaleAsCrashed(
            interaction.guildId,
            MINECRAFT_STATUS.heartbeatTimeoutMs,
        ).catch(() => []);

        const servers = await MinecraftServerRepository.list(interaction.guildId);

        await interaction.editReply({
            embeds: [buildLiveStatusEmbed(servers)],
            components: buildServerButtons(
                process.env.ROBTIC_WEBSITE_URL ?? null,
                process.env.ROBTIC_DISCORD_INVITE ?? null,
            ),
        });
    },
};
