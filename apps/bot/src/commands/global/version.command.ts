import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { MinecraftServerRepository } from "@database/repositories";
import { buildVersionEmbed } from "@bot/utils/minecraft/server-info-embed";

/**
 * `!version` / `/version` — which Minecraft clients can connect.
 *
 * The supported list is configured per server (`server.supported-versions` in the plugin's
 * config.yml) rather than derived from the running version, because a proxy commonly accepts a
 * range of client versions the backend server itself does not report.
 */
export default {
    scope: "global",
    category: "Minecraft",
    data: new SlashCommandBuilder()
        .setName("version")
        .setDescription("Show which Minecraft versions the server supports"),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: "This command can only be used in a server." });
            return;
        }

        await interaction.deferReply();

        const servers = await MinecraftServerRepository.list(interaction.guildId);
        await interaction.editReply({ embeds: [buildVersionEmbed(servers)] });
    },
};
