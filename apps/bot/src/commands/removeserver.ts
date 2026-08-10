import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { SERVER_WHITELIST_MESSAGES, SNOWFLAKE_REGEX } from "@constants";
import { AllowedGuildRepository } from "@database/repositories";

/** `!removeserver <serverid>` / `/removeserver` — the undo for `/addserver`, e.g. after a mistyped id. */
export default {
    category: "Admin",
    data: new SlashCommandBuilder()
        .setName("removeserver")
        .setDescription("Revoke a server's authorisation to use the bot")
        .addStringOption(opt =>
            opt.setName("serverid")
                .setDescription("The server id to remove from the whitelist")
                .setRequired(true)
        ),

    requiredPermission: 100,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const guildId = interaction.options.getString("serverid", true).trim();

        if (!SNOWFLAKE_REGEX.test(guildId)) {
            await interaction.reply({ content: SERVER_WHITELIST_MESSAGES.invalidId(guildId), flags: MessageFlags.Ephemeral });
            return;
        }

        if (guildId === interaction.guildId) {
            await interaction.reply({ content: SERVER_WHITELIST_MESSAGES.cannotRemoveCurrent, flags: MessageFlags.Ephemeral });
            return;
        }

        const removed = await AllowedGuildRepository.remove(guildId);

        await interaction.reply({
            content: removed
                ? SERVER_WHITELIST_MESSAGES.removed(guildId)
                : SERVER_WHITELIST_MESSAGES.notListed(guildId),
            flags: MessageFlags.Ephemeral,
        });
    },
};
