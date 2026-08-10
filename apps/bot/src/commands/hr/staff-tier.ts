import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, SUPER_ADMIN_ID, ROLE_MAP, PERMISSION_HIERARCHY } from "@constants";
import { StaffTierRepository } from "@database/repositories";
import { hasFullPower } from "@bot/utils/access";

// Matches the thresholds already hardcoded in access.ts (isStaff/isAnyManager/isAnyLead/isOwner) —
// set-category just gives departments a guided way to bind roles to those same bands.
const CATEGORY_SCORES = { staff: 20, manager: 80, lead: 90, owner: 100 } as const;
const CATEGORY_LABELS: Record<keyof typeof CATEGORY_SCORES, string> = {
    staff: "Staff",
    manager: "High Staff",
    lead: "Lead",
    owner: "Owner",
};

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("staff-tier")
        .setDescription("Configure this server's own staff tiers, departments, and role bindings")

        .addSubcommand(sub =>
            sub.setName("migrate-from-branch")
                .setDescription("One-time: seed this server's tiers from the old global branch config")
        )
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("Create a new staff tier")
                .addStringOption(opt => opt.setName("key").setDescription("Unique slug for this tier, e.g. lead-moderation").setRequired(true))
                .addStringOption(opt => opt.setName("name").setDescription("Display name, e.g. Lead Moderator").setRequired(true))
                .addIntegerOption(opt => opt.setName("score").setDescription("Hierarchy score (higher = more authority)").setRequired(true).setMinValue(0))
                .addStringOption(opt => opt.setName("department").setDescription("Department this tier belongs to, if any").setRequired(false))
                .addRoleOption(opt => opt.setName("role").setDescription("A role that grants this tier").setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName("add-role")
                .setDescription("Bind another role to an existing tier")
                .addStringOption(opt => opt.setName("key").setDescription("The tier's key").setRequired(true))
                .addRoleOption(opt => opt.setName("role").setDescription("Role to add").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("remove-role")
                .setDescription("Unbind a role from a tier")
                .addStringOption(opt => opt.setName("key").setDescription("The tier's key").setRequired(true))
                .addRoleOption(opt => opt.setName("role").setDescription("Role to remove").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("Delete a tier entirely")
                .addStringOption(opt => opt.setName("key").setDescription("The tier's key").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("list")
                .setDescription("List this server's configured staff tiers")
        )
        .addSubcommand(sub =>
            sub.setName("set-category")
                .setDescription("Bind a role to a standard category (Staff/High Staff/Lead/Owner) for a department")
                .addStringOption(opt => opt.setName("department").setDescription("Department this role belongs to, e.g. Support").setRequired(true))
                .addStringOption(opt =>
                    opt.setName("category").setDescription("Standard category").setRequired(true)
                        .addChoices(
                            { name: "Staff", value: "staff" },
                            { name: "High Staff (Manager)", value: "manager" },
                            { name: "Lead", value: "lead" },
                            { name: "Owner", value: "owner" },
                        )
                )
                .addRoleOption(opt => opt.setName("role").setDescription("Role that grants this category").setRequired(true))
        ),

    // Not gated via requiredPermission/department — this command configures the very system those
    // gates read from, so it uses the same bootstrap-safe check as /whitelist instead.
    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const member = interaction.member as GuildMember | null;
        if (interaction.user.id !== SUPER_ADMIN_ID && !(member && hasFullPower(member))) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setDescription("❌ You are not authorized to use this command.").setColor(COLORS.error)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildId = interaction.guildId!;
        const sub = interaction.options.getSubcommand();

        if (sub === "migrate-from-branch") {
            const existing = await StaffTierRepository.list(guildId);
            if (existing.length > 0) {
                await interaction.editReply({
                    embeds: [new EmbedBuilder().setDescription(`❌ This server already has ${existing.length} tier(s) configured — refusing to overwrite. Use \`/staff-tier remove\` first if you really want to re-migrate.`).setColor(COLORS.error)],
                });
                return;
            }

            let created = 0;
            for (const [key, config] of Object.entries(ROLE_MAP)) {
                if (config.ids.length === 0) continue;

                const [firstId, ...restIds] = config.ids;
                await StaffTierRepository.create(
                    guildId,
                    key,
                    config.names[0] ?? key,
                    PERMISSION_HIERARCHY[key] ?? 0,
                    config.department ?? null,
                    firstId,
                );
                for (const roleId of restIds) {
                    await StaffTierRepository.addRole(guildId, key, roleId);
                }
                created++;
            }

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle("✅ Migration Complete")
                    .setColor(COLORS.success)
                    .setDescription(`Seeded ${created} tier(s) from the old global branch config into this server's own staff tier list.`)],
            });
            return;
        }

        if (sub === "add") {
            const key = interaction.options.getString("key", true).trim();
            const name = interaction.options.getString("name", true).trim();
            const score = interaction.options.getInteger("score", true);
            const department = interaction.options.getString("department", false)?.trim() || null;
            const role = interaction.options.getRole("role", false);

            const existing = await StaffTierRepository.get(guildId, key);
            if (existing) {
                await interaction.editReply({
                    embeds: [new EmbedBuilder().setDescription(`❌ A tier with key \`${key}\` already exists.`).setColor(COLORS.error)],
                });
                return;
            }

            await StaffTierRepository.create(guildId, key, name, score, department, role?.id);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle("✅ Tier Created")
                    .setColor(COLORS.success)
                    .addFields(
                        { name: "Key", value: `\`${key}\``, inline: true },
                        { name: "Name", value: name, inline: true },
                        { name: "Score", value: `${score}`, inline: true },
                        { name: "Department", value: department ?? "None", inline: true },
                        { name: "Role", value: role ? `${role}` : "None yet", inline: true },
                    )],
            });
            return;
        }

        if (sub === "add-role" || sub === "remove-role") {
            const key = interaction.options.getString("key", true).trim();
            const role = interaction.options.getRole("role", true);

            const tier = await StaffTierRepository.get(guildId, key);
            if (!tier) {
                await interaction.editReply({
                    embeds: [new EmbedBuilder().setDescription(`❌ No tier with key \`${key}\` exists.`).setColor(COLORS.error)],
                });
                return;
            }

            const updated = sub === "add-role"
                ? await StaffTierRepository.addRole(guildId, key, role.id)
                : await StaffTierRepository.removeRole(guildId, key, role.id);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(sub === "add-role" ? "✅ Role Added" : "✅ Role Removed")
                    .setColor(COLORS.success)
                    .setDescription(`Tier \`${key}\` now has: ${updated?.roleIds.length ? updated.roleIds.map(id => `<@&${id}>`).join(", ") : "no roles bound"}`)],
            });
            return;
        }

        if (sub === "remove") {
            const key = interaction.options.getString("key", true).trim();
            const removed = await StaffTierRepository.remove(guildId, key);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setDescription(removed ? `✅ Tier \`${key}\` deleted.` : `❌ No tier with key \`${key}\` exists.`)
                    .setColor(removed ? COLORS.success : COLORS.error)],
            });
            return;
        }

        if (sub === "set-category") {
            const department = interaction.options.getString("department", true).trim();
            const category = interaction.options.getString("category", true) as keyof typeof CATEGORY_SCORES;
            const role = interaction.options.getRole("role", true);
            const key = `${department}-${category}`.toLowerCase();

            const existing = await StaffTierRepository.get(guildId, key);
            if (existing) {
                await StaffTierRepository.addRole(guildId, key, role.id);
            } else {
                await StaffTierRepository.create(guildId, key, `${department} ${CATEGORY_LABELS[category]}`, CATEGORY_SCORES[category], department, role.id);
            }

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle("✅ Category Bound")
                    .setColor(COLORS.success)
                    .setDescription(`<@&${role.id}> is now **${CATEGORY_LABELS[category]}** (score ${CATEGORY_SCORES[category]}) for the **${department}** department.`)],
            });
            return;
        }

        // sub === "list"
        const tiers = await StaffTierRepository.list(guildId);
        if (!tiers.length) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setDescription("No staff tiers configured for this server yet.").setColor(COLORS.info)],
            });
            return;
        }

        const grouped = new Map<string, typeof tiers>();
        for (const tier of tiers) {
            const groupKey = tier.department ?? "No Department";
            const group = grouped.get(groupKey) ?? [];
            group.push(tier);
            grouped.set(groupKey, group);
        }

        const embed = new EmbedBuilder()
            .setTitle("Staff Tiers")
            .setColor(COLORS.info)
            .setTimestamp();

        for (const [department, group] of grouped) {
            const lines = group.map(t =>
                `\`${t.key}\` **${t.name}** — score ${t.score} — ${t.roleIds.length ? t.roleIds.map(id => `<@&${id}>`).join(", ") : "no roles bound"}`
            );
            embed.addFields({ name: department, value: lines.join("\n") });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
