import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, SUPER_ADMIN_ID } from "@constants";
import { CommandAccessRepository, ServerConfigRepository, StaffTierRepository } from "@database/repositories";
import { isGuildOperator } from "@bot/utils/access";

export default {
    scope: "guild",
    access: "admin",
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("command-access")
        .setDescription("Grant a role or staff-tier category direct access to a command")
        .addSubcommand(sub =>
            sub.setName("grant-role")
                .setDescription("Let a role use a command, regardless of its normal permission check")
                .addStringOption(opt => opt.setName("command").setDescription("Command name, e.g. ban").setRequired(true))
                .addRoleOption(opt => opt.setName("role").setDescription("Role to grant").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("revoke-role")
                .setDescription("Remove a role's direct grant on a command")
                .addStringOption(opt => opt.setName("command").setDescription("Command name, e.g. ban").setRequired(true))
                .addRoleOption(opt => opt.setName("role").setDescription("Role to revoke").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("grant-category")
                .setDescription("Let a staff-tier category use a command, regardless of its normal permission check")
                .addStringOption(opt => opt.setName("command").setDescription("Command name, e.g. ban").setRequired(true))
                .addStringOption(opt => opt.setName("category").setDescription("Staff-tier key (see /staff-tier list)").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sub =>
            sub.setName("revoke-category")
                .setDescription("Remove a category's direct grant on a command")
                .addStringOption(opt => opt.setName("command").setDescription("Command name, e.g. ban").setRequired(true))
                .addStringOption(opt => opt.setName("category").setDescription("Staff-tier key").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sub =>
            sub.setName("list")
                .setDescription("Show the access grants configured for a command")
                .addStringOption(opt => opt.setName("command").setDescription("Command name, e.g. ban").setRequired(true))
        )
        .addSubcommandGroup(group =>
            group.setName("admin-roles")
                .setDescription("Roles treated as bot administrators across every admin-access command")
                .addSubcommand(sub =>
                    sub.setName("add")
                        .setDescription("Let a role use every admin-access command in this server")
                        .addRoleOption(opt => opt.setName("role").setDescription("Role to add").setRequired(true))
                )
                .addSubcommand(sub =>
                    sub.setName("remove")
                        .setDescription("Stop treating a role as a bot administrator")
                        .addRoleOption(opt => opt.setName("role").setDescription("Role to remove").setRequired(true))
                )
                .addSubcommand(sub => sub.setName("list").setDescription("Show this server's bot administrator roles"))
        ),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const member = interaction.member as GuildMember | null;
        if (interaction.user.id !== SUPER_ADMIN_ID && !(member && isGuildOperator(member))) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setDescription("❌ You are not authorized to use this command.").setColor(COLORS.error)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (!interaction.guildId) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildId = interaction.guildId;
        const sub = interaction.options.getSubcommand();

        if (interaction.options.getSubcommandGroup(false) === "admin-roles") {
            const roleIds = sub === "list"
                ? await ServerConfigRepository.getBotAdminRolesCached(guildId)
                : sub === "add"
                    ? await ServerConfigRepository.addBotAdminRole(guildId, interaction.options.getRole("role", true).id)
                    : await ServerConfigRepository.removeBotAdminRole(guildId, interaction.options.getRole("role", true).id);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.success)
                    .setTitle("Bot administrator roles")
                    .setDescription(roleIds.length ? roleIds.map(id => `<@&${id}>`).join(", ") : "None. Only server Administrators pass admin-access commands.")],
            });
            return;
        }

        const commandName = interaction.options.getString("command", true).trim().toLowerCase();

        if (sub === "grant-role" || sub === "revoke-role") {
            const role = interaction.options.getRole("role", true);
            const entry = sub === "grant-role"
                ? await CommandAccessRepository.addRole(guildId, commandName, role.id)
                : await CommandAccessRepository.removeRole(guildId, commandName, role.id);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.success)
                    .setDescription(`\`/${commandName}\` roles: ${entry.allowedRoleIds.length ? entry.allowedRoleIds.map(id => `<@&${id}>`).join(", ") : "none"}`)],
            });
            return;
        }

        if (sub === "grant-category" || sub === "revoke-category") {
            const category = interaction.options.getString("category", true).trim();
            const tier = await StaffTierRepository.get(guildId, category);
            if (!tier) {
                await interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ No staff-tier with key \`${category}\` exists. See \`/staff-tier list\`.`)],
                });
                return;
            }

            const entry = sub === "grant-category"
                ? await CommandAccessRepository.addCategory(guildId, commandName, category)
                : await CommandAccessRepository.removeCategory(guildId, commandName, category);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.success)
                    .setDescription(`\`/${commandName}\` categories: ${entry.allowedCategoryKeys.length ? entry.allowedCategoryKeys.map(k => `\`${k}\``).join(", ") : "none"}`)],
            });
            return;
        }

        const entry = await CommandAccessRepository.getForCommand(guildId, commandName);
        const embed = new EmbedBuilder()
            .setTitle(`Access Grants — /${commandName}`)
            .setColor(COLORS.info)
            .addFields(
                { name: "Roles", value: entry?.allowedRoleIds.length ? entry.allowedRoleIds.map(id => `<@&${id}>`).join(", ") : "None" },
                { name: "Categories", value: entry?.allowedCategoryKeys.length ? entry.allowedCategoryKeys.map(k => `\`${k}\``).join(", ") : "None" },
            );

        await interaction.editReply({ embeds: [embed] });
    },

    async autocomplete(interaction: AutocompleteInteraction) {
        if (!interaction.guildId) return;
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "category") return;

        const tiers = await StaffTierRepository.list(interaction.guildId);
        const filtered = tiers
            .filter(t => t.key.toLowerCase().includes(focused.value.toLowerCase()) || t.name.toLowerCase().includes(focused.value.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(filtered.map(t => ({ name: `${t.name} (${t.key})`, value: t.key })));
    },
};
