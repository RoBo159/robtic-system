import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { MinecraftConfigRepository, MinecraftServerRepository } from "@database/repositories";
import { buildAddressEmbed, buildServerButtons } from "../utils/minecraft/server-info-embed";

/**
 * `!ip` / `/ip` — the public connect address.
 *
 * Open to everyone: it is the single most-asked question in any Minecraft Discord, and gating it
 * would defeat the purpose. The address comes from whichever server reported one, falling back to
 * the guild's configured `publicAddress` when no server has been started yet.
 */
export default {
    category: "Minecraft",
    data: new SlashCommandBuilder().setName("ip").setDescription("Show the Minecraft server address and status"),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: "This command can only be used in a server." });
            return;
        }

        await interaction.deferReply();

        const [servers, config] = await Promise.all([
            MinecraftServerRepository.list(interaction.guildId),
            MinecraftConfigRepository.get(interaction.guildId),
        ]);

        await interaction.editReply({
            embeds: [buildAddressEmbed(servers, config?.publicAddress ?? null)],
            components: buildServerButtons(
                process.env.ROBTIC_WEBSITE_URL ?? null,
                process.env.ROBTIC_DISCORD_INVITE ?? null,
            ),
        });
    },
};
