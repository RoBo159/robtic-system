import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, SUPER_ADMIN_ID } from "@constants";
import { StaffRepository, HrConfigRepository } from "@database/repositories";
import { hasFullPower, hasDepartmentAuthority } from "@bot/utils/access";
import { syncStaffWarnRole } from "../../utils/hr/staff-warn-role";

export default {
    category: "Staff",
    data: new SlashCommandBuilder()
        .setName("staff-warn")
        .setDescription("نظام تحذير الموظفين")
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("توجيه تحذير لموظف")
                .addUserOption(opt => opt.setName("target").setDescription("الموظف المراد تحذيره").setRequired(true))
                .addStringOption(opt => opt.setName("reason").setDescription("سبب التحذير").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("list")
                .setDescription("عرض تحذيرات موظف")
                .addUserOption(opt => opt.setName("target").setDescription("الموظف").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("channel-set")
                .setDescription("تحديد قناة سجل التحذيرات")
                .addChannelOption(opt =>
                    opt.setName("channel")
                        .setDescription("القناة")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand(sub =>
            sub.setName("role-add")
                .setDescription("السماح لرول باستخدام اختصار التحذير")
                .addRoleOption(opt => opt.setName("role").setDescription("الرول").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("role-remove")
                .setDescription("إزالة صلاحية الاختصار عن رول")
                .addRoleOption(opt => opt.setName("role").setDescription("الرول").setRequired(true))
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        if (!interaction.guildId) return;
        const sub = interaction.options.getSubcommand();
        const member = interaction.member as GuildMember;

        if (sub === "channel-set" || sub === "role-add" || sub === "role-remove") {
            if (interaction.user.id !== SUPER_ADMIN_ID && !hasFullPower(member)) {
                await interaction.reply({ content: "❌ | ليست لديك صلاحية استخدام هذا الأمر.", flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const guildId = interaction.guildId;

            if (sub === "channel-set") {
                const channel = interaction.options.getChannel("channel", true);
                await HrConfigRepository.setLogChannel(guildId, channel.id);
                await interaction.editReply({ content: `✅ | تم تحديد قناة سجل التحذيرات إلى <#${channel.id}>.` });
                return;
            }

            const role = interaction.options.getRole("role", true);
            if (sub === "role-add") {
                await HrConfigRepository.addShortcutRole(guildId, role.id);
                await interaction.editReply({ content: `✅ | تمت إضافة <@&${role.id}> إلى رولات اختصار التحذير.` });
            } else {
                await HrConfigRepository.removeShortcutRole(guildId, role.id);
                await interaction.editReply({ content: `✅ | تمت إزالة <@&${role.id}> من رولات اختصار التحذير.` });
            }
            return;
        }

        const target = interaction.options.getUser("target", true);
        const staffRecord = await StaffRepository.findByDiscordId(target.id);

        if (!staffRecord) {
            await interaction.reply({ content: "❌ | هذا العضو ليس موظفًا مسجلًا.", flags: MessageFlags.Ephemeral });
            return;
        }

        if (!(await hasDepartmentAuthority(member, staffRecord.department)) && !hasFullPower(member)) {
            await interaction.reply({ content: "❌ | ليست لديك صلاحية تحذير موظفي هذا القسم.", flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply();

        if (sub === "add") {
            const reason = interaction.options.getString("reason", true);
            const updated = await StaffRepository.addWarning(target.id, reason, interaction.user.id);

            const targetUser = await client.users.fetch(target.id).catch(() => null);
            if (targetUser) {
                await targetUser.send(`⚠️ لقد تلقيت تحذيرًا في **${interaction.guild?.name}**.\nالسبب: ${reason}`).catch(() => null);
            }

            const warningCount = updated?.warnings.length ?? 0;

            const targetMember = interaction.guild?.members.cache.get(target.id)
                ?? await interaction.guild?.members.fetch(target.id).catch(() => null);
            if (targetMember) await syncStaffWarnRole(targetMember, warningCount);

            const config = await HrConfigRepository.getCached(interaction.guildId);
            const logChannel = config.staffWarnLogChannelId
                ? (client.channels.cache.get(config.staffWarnLogChannelId) as TextChannel | undefined)
                : undefined;

            if (logChannel) {
                await logChannel.send({
                    content: `⚠️ تحذير موظف | الموظف: <@${target.id}> | بواسطة: <@${interaction.user.id}> | السبب: ${reason} | إجمالي التحذيرات: ${warningCount}`,
                }).catch(() => null);
            }

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.warning)
                    .setDescription(`✅ | تم تحذير <@${target.id}>.\nالسبب: ${reason}\nإجمالي التحذيرات: ${warningCount}`)],
            });
            return;
        }

        // sub === "list"
        if (!staffRecord.warnings.length) {
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription(`لا توجد تحذيرات لـ <@${target.id}>.`)] });
            return;
        }

        const lines = staffRecord.warnings.slice(0, 15).map((w, i) =>
            `**${i + 1}.** ${w.reason} — بواسطة <@${w.issuedBy}> — <t:${Math.floor(w.date.getTime() / 1000)}:R>`
        );

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`⚠️ تحذيرات ${target.username}`)
                .setDescription(lines.join("\n"))
                .setColor(COLORS.warning)
                .setFooter({ text: `الإجمالي: ${staffRecord.warnings.length} تحذير` })],
        });
    },
};
