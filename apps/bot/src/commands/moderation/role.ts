import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    type ChatInputCommandInteraction,
    type GuildMember,
    type Role,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, MODERATION_ACTION_MESSAGES as MSG } from "@constants";
import { recordSecurityEvent, sendAuditLog } from "../../utils/moderation/security";
import { checkRoleAssignable } from "../../utils/moderation/hierarchy";

const MULTIROLE_SLOTS = ["role1", "role2", "role3", "role4", "role5"] as const;

async function auditRoleChange(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
    target: GuildMember,
    roles: Role[],
    granted: boolean,
): Promise<void> {
    const guild = interaction.guild!;

    await sendAuditLog(
        guild,
        "role_update",
        new EmbedBuilder()
            .setTitle(granted ? "📘 Audit: Roles Granted" : "📘 Audit: Roles Removed")
            .setColor(granted ? COLORS.success : COLORS.warning)
            .addFields(
                { name: "Target", value: `<@${target.id}> (${target.id})` },
                { name: "Executor", value: `<@${interaction.user.id}> (${interaction.user.id})` },
                { name: "Roles", value: roles.map(r => `<@&${r.id}>`).join(", ") },
                { name: "Source", value: `/role ${interaction.options.getSubcommand()}`, inline: true },
            )
            .setTimestamp(),
    );

    // One security event per role: the anti-nuke rules count individual grants, so collapsing a
    // five-role change into one event would let a mass grant slip under any configured limit.
    for (const role of roles) {
        await recordSecurityEvent({
            client,
            guild,
            event: granted ? "role_grant" : "role_remove",
            executorId: interaction.user.id,
            targetId: target.id,
            source: `command:/role ${interaction.options.getSubcommand()}`,
            details: `${role.name} (${role.id})`,
        });
    }
}

export default {
    category: "Moderation",
    data: new SlashCommandBuilder()
        .setName("role")
        .setDescription("Give or take roles from a member")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub =>
            sub.setName("give")
                .setDescription("Give a role to a member")
                .addUserOption(opt => opt.setName("user").setDescription("The member").setRequired(true))
                .addRoleOption(opt => opt.setName("role").setDescription("The role to give").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("Remove a role from a member")
                .addUserOption(opt => opt.setName("user").setDescription("The member").setRequired(true))
                .addRoleOption(opt => opt.setName("role").setDescription("The role to remove").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("multirole")
                .setDescription("Give several roles to a member at once")
                .addUserOption(opt => opt.setName("user").setDescription("The member").setRequired(true))
                .addRoleOption(opt => opt.setName("role1").setDescription("Role to give").setRequired(true))
                .addRoleOption(opt => opt.setName("role2").setDescription("Role to give").setRequired(true))
                .addRoleOption(opt => opt.setName("role3").setDescription("Role to give").setRequired(false))
                .addRoleOption(opt => opt.setName("role4").setDescription("Role to give").setRequired(false))
                .addRoleOption(opt => opt.setName("role5").setDescription("Role to give").setRequired(false))
        ),

    requiredPermission: 60,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: MSG.guildOnly });
            return;
        }

        const sub = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("user", true);
        const target = guild.members.cache.get(targetUser.id) ?? await guild.members.fetch(targetUser.id).catch(() => null);
        if (!target) {
            await interaction.reply({ content: MSG.notInGuild });
            return;
        }

        const executor = interaction.member as GuildMember;

        if (sub === "multirole") {
            const requested = MULTIROLE_SLOTS
                .map(slot => interaction.options.getRole(slot) as Role | null)
                .filter((role): role is Role => role !== null);

            const unique = [...new Map(requested.map(role => [role.id, role])).values()];

            const toApply: Role[] = [];
            const skipped: string[] = [];

            for (const role of unique) {
                const blocked = checkRoleAssignable(guild, executor, role);
                if (blocked) {
                    skipped.push(`${role.name}: ${blocked}`);
                } else if (target.roles.cache.has(role.id)) {
                    skipped.push(MSG.roleAlreadyHas(targetUser.username, role.name));
                } else {
                    toApply.push(role);
                }
            }

            if (toApply.length === 0) {
                await interaction.reply({ content: [MSG.multiroleNone, ...skipped.map(s => `• ${s}`)].join("\n") });
                return;
            }

            await interaction.deferReply();

            const applied = await target.roles.add(toApply, `${interaction.user.tag}: /role multirole`).catch(() => null);
            if (!applied) {
                await interaction.editReply({ content: MSG.roleFailed });
                return;
            }

            await interaction.editReply({
                content: MSG.multiroleResult(targetUser.username, toApply.map(r => r.name), skipped),
            });
            await auditRoleChange(interaction, client, target, toApply, true);
            return;
        }

        const role = interaction.options.getRole("role", true) as Role;

        const blocked = checkRoleAssignable(guild, executor, role);
        if (blocked) {
            await interaction.reply({ content: blocked });
            return;
        }

        const has = target.roles.cache.has(role.id);
        if (sub === "give" && has) {
            await interaction.reply({ content: MSG.roleAlreadyHas(targetUser.username, role.name) });
            return;
        }
        if (sub === "remove" && !has) {
            await interaction.reply({ content: MSG.roleDoesNotHave(targetUser.username, role.name) });
            return;
        }

        await interaction.deferReply();

        const reason = `${interaction.user.tag}: /role ${sub}`;
        const changed = sub === "give"
            ? await target.roles.add(role, reason).catch(() => null)
            : await target.roles.remove(role, reason).catch(() => null);

        if (!changed) {
            await interaction.editReply({ content: MSG.roleFailed });
            return;
        }

        await interaction.editReply({
            content: sub === "give"
                ? MSG.roleGiven(targetUser.username, role.name)
                : MSG.roleRemoved(targetUser.username, role.name),
        });

        await auditRoleChange(interaction, client, target, [role], sub === "give");
    },
};
