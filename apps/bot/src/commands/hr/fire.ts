import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { StaffRepository, StaffTierRepository } from "@database/repositories";
import { hasDepartmentAuthority, hasFullPower } from "@bot/utils/access";

export default {
    category: "Staff",
    data: new SlashCommandBuilder()
        .setName("fire")
        .setDescription("إنهاء خدمة موظف وإزالة جميع رولاته الوظيفية")
        .addStringOption(opt =>
            opt.setName("target").setDescription("الموظف المراد إنهاء خدمته").setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
            opt.setName("reason").setDescription("سبب إنهاء الخدمة").setRequired(true)
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        if (!interaction.guildId || !interaction.guild) return;

        const targetId = interaction.options.getString("target", true);
        const reason = interaction.options.getString("reason", true);

        const staffRecord = await StaffRepository.findByDiscordId(targetId);
        if (!staffRecord) {
            await interaction.reply({ content: "❌ | هذا العضو ليس موظفًا مسجلًا.", flags: MessageFlags.Ephemeral });
            return;
        }

        const actingMember = interaction.member as GuildMember;
        if (!(await hasDepartmentAuthority(actingMember, staffRecord.department)) && !hasFullPower(actingMember)) {
            await interaction.reply({ content: "❌ | ليست لديك صلاحية إنهاء خدمة موظفي هذا القسم.", flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply();

        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        // Strip every role bound to any StaffTier in this guild, not just the target's own
        // department's ladder — a staff member can hold category/tier roles across departments.
        let removedRoleIds: string[] = [];
        if (targetMember) {
            const tiers = await StaffTierRepository.list(interaction.guildId);
            const staffRoleIds = new Set(tiers.flatMap(t => t.roleIds));
            const rolesToRemove = targetMember.roles.cache.filter(r => staffRoleIds.has(r.id));

            for (const [, role] of rolesToRemove) {
                await targetMember.roles.remove(role).catch(() => null);
            }
            removedRoleIds = [...rolesToRemove.keys()];
        }

        await StaffRepository.terminate(targetId);
        await StaffRepository.createPromotion({
            staffId: targetId,
            discordId: targetId,
            previousPosition: staffRecord.position,
            newPosition: "Terminated",
            previousDepartment: staffRecord.department,
            newDepartment: staffRecord.department,
            type: "termination",
            reason,
            approvedBy: interaction.user.id,
        });

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (targetUser) {
            await targetUser.send(`❌ لقد تم إنهاء خدمتك في **${interaction.guild.name}**.\nالسبب: ${reason}`).catch(() => null);
        }

        const embed = new EmbedBuilder()
            .setTitle("❌ تم إنهاء الخدمة")
            .setColor(COLORS.error)
            .addFields(
                { name: "الموظف", value: `<@${targetId}>`, inline: true },
                { name: "القسم السابق", value: staffRecord.department, inline: true },
                { name: "المنصب السابق", value: staffRecord.position, inline: true },
                { name: "السبب", value: reason },
                {
                    name: "الرولات المُزالة",
                    value: removedRoleIds.length ? removedRoleIds.map(id => `<@&${id}>`).join(", ") : "لا يوجد",
                },
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async autocomplete(interaction: AutocompleteInteraction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const staff = await StaffRepository.findAll("active");
        const filtered = staff
            .filter(s => s.username.toLowerCase().includes(focused))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(s => ({ name: `${s.username} — ${s.department}/${s.position}`, value: s.discordId }))
        );
    },
};
