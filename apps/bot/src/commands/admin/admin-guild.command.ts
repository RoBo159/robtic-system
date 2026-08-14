import {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
    type ChatInputCommandInteraction,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import { COLORS, SNOWFLAKE_REGEX } from "@constants";
import { getAdminGuildId, setAdminGuild } from "@core/bot-admin";
import { AllowedGuildRepository } from "@database/repositories";

/**
 * Chooses which server hosts admin-scoped commands.
 *
 * This command is itself admin-scoped, so before an admin guild is set it is registered nowhere —
 * yet `!admin-guild set <id>` still works, because the prefix router resolves against the commands
 * loaded from disk and never against Discord's registry. That is what makes the bootstrap possible
 * and what makes "register nothing when unset" a safe default for every other admin command.
 */
export default {
    category: "Admin",
    scope: "admin",
    data: new SlashCommandBuilder()
        .setName("admin-guild")
        .setDescription("Choose the server where bot-owner commands are published")
        .addSubcommand(sub =>
            sub.setName("set")
                .setDescription("Publish admin commands to this guild")
                .addStringOption(opt => opt.setName("guild").setDescription("Guild id").setRequired(true))
        )
        .addSubcommand(sub => sub.setName("show").setDescription("Show the current admin guild"))
        .addSubcommand(sub => sub.setName("clear").setDescription("Unpublish admin commands everywhere")),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sub = interaction.options.getSubcommand();
        const adminCommandCount = [...client.commands.values()].filter(command => command.scope === "admin").length;

        if (sub === "show") {
            const current = await getAdminGuildId();
            const guild = current ? client.guilds.cache.get(current) : null;

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(current ? COLORS.info : COLORS.warning)
                    .setTitle("Admin guild")
                    .setDescription(current
                        ? `\`${current}\`${guild ? ` — **${guild.name}**` : " — bot is not in this guild"}`
                        : "Not set. The " + adminCommandCount + " admin command(s) are usable by prefix only.")],
            });
            return;
        }

        if (sub === "clear") {
            const result = await setAdminGuild(client, null);
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(result.ok ? COLORS.success : COLORS.error)
                    .setDescription(result.ok
                        ? `Cleared. The ${adminCommandCount} admin command(s) are now usable by prefix only.`
                        : `❌ ${result.error}`)],
            });
            return;
        }

        const guildId = interaction.options.getString("guild", true).trim();

        if (!SNOWFLAKE_REGEX.test(guildId)) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription("❌ That is not a valid guild id.")],
            });
            return;
        }

        // The guild guard makes the bot leave any server not on the allowlist. Adopting an
        // unlisted guild would publish commands to a server the bot is about to walk out of.
        if (!(await AllowedGuildRepository.isAllowed(guildId))) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(
                    `❌ \`${guildId}\` is not on the server allowlist, so the bot would leave it. Run \`/addserver\` there first.`
                )],
            });
            return;
        }

        const result = await setAdminGuild(client, guildId);

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(result.ok ? COLORS.success : COLORS.error)
                .setDescription(result.ok
                    ? `Admin guild set to \`${guildId}\`. Published ${result.registered} admin command(s) there.`
                    : `❌ ${result.error}`)],
        });
    },
} satisfies CommandConfig;
