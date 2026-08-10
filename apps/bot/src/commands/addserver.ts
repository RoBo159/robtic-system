import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { SERVER_WHITELIST_MESSAGES, SNOWFLAKE_REGEX } from "@constants";
import { AllowedGuildRepository } from "@database/repositories";

/**
 * `!addserver <serverid>` / `/addserver` — authorise a server for the bot.
 *
 * The whitelist used to be the `MainGuild` and `TestGuild` environment variables, so adding a
 * server meant editing `.env` and redeploying. It is a database collection now and this is how it
 * is edited.
 */
export default {
    category: "Admin",
    data: new SlashCommandBuilder()
        .setName("addserver")
        .setDescription("Allow the bot to be used in a server")
        .addStringOption(opt =>
            opt.setName("serverid")
                .setDescription("The server id to whitelist")
                .setRequired(true)
        ),

    requiredPermission: 100,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const guildId = interaction.options.getString("serverid", true).trim();

        if (!SNOWFLAKE_REGEX.test(guildId)) {
            await interaction.reply({ content: SERVER_WHITELIST_MESSAGES.invalidId(guildId), flags: MessageFlags.Ephemeral });
            return;
        }

        const name = client.guilds.cache.get(guildId)?.name;
        const added = await AllowedGuildRepository.add(guildId, interaction.user.id, name);

        await interaction.reply({
            content: added
                ? SERVER_WHITELIST_MESSAGES.added(guildId, name)
                : SERVER_WHITELIST_MESSAGES.alreadyAdded(guildId),
            flags: MessageFlags.Ephemeral,
        });
    },
};
