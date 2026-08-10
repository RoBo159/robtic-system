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
import { CommandAccessRepository, StaffTierRepository } from "@database/repositories";
import { hasFullPower } from "@bot/utils/access";

export default {
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
        ),

    // Configures the permission system itself — same bootstrap-safe check as /staff-tier and /whitelist.
    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const member = interaction.member as GuildMember | null;
        if (interaction.user.id !== SUPER_ADMIN_ID && !(member && hasFullPower(member))) {
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

        // sub === "list"
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

        await interaction.respond(filtered.map(t => ({ name: `${t.department ?? "—"} / ${t.name} (${t.key})`, value: t.key })));
    },
};
