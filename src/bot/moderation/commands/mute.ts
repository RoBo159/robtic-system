import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type GuildMember,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { Colors, MembersPunishments, PunishmentsSystem } from "@core/config";
import { PunishmentRepository, ReasonRepository } from "@database/repositories";
import { errorEmbed } from "@core/utils";
import { getMemberLevel } from "@shared/utils/access";
import { getUserLang, t } from "@shared/utils/lang";
import data from "@shared/data.json";

export async function executeMute(
    client: BotClient,
    guildId: string,
    targetId: string,
    targetUsername: string,
    reason: string,
    reasonAr: string,
    moderatorId: string,
    member: GuildMember | null | undefined,
    durationMs: number,
    guild: ChatInputCommandInteraction["guild"],
) {
    const expiresAt = new Date(Date.now() + durationMs);
    const caseId = await PunishmentRepository.getNextCaseId(guildId);

    await PunishmentRepository.create({
        caseId,
        guildId,
        userId: targetId,
        moderatorId,
        type: "mute",
        reason,
        duration: durationMs,
        expiresAt,
        active: true,
    });

    const newLevel = await PunishmentRepository.addPunishmentLevel(targetId, targetUsername, PunishmentsSystem.mute);
    const levelInfo = PunishmentRepository.getLevelInfo(newLevel);

    if (member) {
        const allPunishmentRoleIds = Object.values(MembersPunishments).map(p => p.id);
        const rolesToRemove = member.roles.cache.filter(r => allPunishmentRoleIds.includes(r.id));
        for (const [, role] of rolesToRemove) {
            await member.roles.remove(role).catch(() => null);
        }
        if (levelInfo.roleId) {
            await member.roles.add(levelInfo.roleId).catch(() => null);
        }
        await member.timeout(durationMs, `Mute: ${reason}`).catch(() => null);
        if (newLevel >= MembersPunishments.permBan.level) {
            await member.roles.add(MembersPunishments.permBan.id).catch(() => null);
        }
    }

    const durationHours = Math.round(durationMs / (60 * 60 * 1000));

    const user = await client.users.fetch(targetId).catch(() => null);
    if (user) {
        const lang = getUserLang(member);
        const localReason = lang === "ar" ? reasonAr : reason;

        const dmEmbed = new EmbedBuilder()
            .setTitle(t("moderation.mute_title", lang))
            .setColor(Colors.moderation)
            .setDescription(t("moderation.mute_desc", lang, { reason: localReason, duration: String(durationHours) }))
            .setTimestamp();

        const modmailButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel(t("moderation.contact_modmail", lang))
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/users/${data.modmail_bot_id}`)
                .setEmoji("📨"),
        );

        await user.send({ embeds: [dmEmbed], components: [modmailButton] }).catch(() => null);
    }

    const logEmbed = new EmbedBuilder()
        .setTitle("🔇 User Muted")
        .setColor(Colors.moderation)
        .addFields(
            { name: "User", value: `<@${targetId}>`, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            { name: "Case", value: `\`${caseId}\``, inline: true },
            { name: "Reason", value: reason },
            { name: "Duration", value: `${durationHours} hour(s)`, inline: true },
            { name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Punishment Level", value: `\`${newLevel}/100\` — ${levelInfo.name}`, inline: true },
        )
        .setTimestamp();

    const noticeChannel = guild?.channels.cache.get(data.punishments_notice_channel_id) as TextChannel | undefined;
    if (noticeChannel) {
        await noticeChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }

    return { embed: logEmbed, caseId, newLevel, levelInfo };
}

export default {
    data: new SlashCommandBuilder()
        .setName("mute")
        .setDescription("Manage user mutes")
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("Mute a user")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to mute").setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("reason").setDescription("Select a reason").setRequired(true).setAutocomplete(true)
                )
                .addIntegerOption(opt =>
                    opt.setName("duration").setDescription("Duration in hours (default: 24)").setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("Unmute a user (does NOT remove punishment level)")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to unmute").setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("case").setDescription("The case ID to remove").setRequired(true).setAutocomplete(true)
                )
                .addStringOption(opt =>
                    opt.setName("reason").setDescription("Reason for the unmute").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("appeal")
                .setDescription("Appeal a mute (removes punishment level points)")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to appeal for").setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("case").setDescription("The case ID to appeal").setRequired(true).setAutocomplete(true)
                )
                .addStringOption(opt =>
                    opt.setName("reason").setDescription("Reason for the appeal").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("list")
                .setDescription("List all mutes for a user")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to check").setRequired(true)
                )
        ),

    requiredPermission: 20,
    department: "Moderation" as Department,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();
        const target = interaction.options.getUser("target", true);
        const guildId = interaction.guildId!;
        const member = interaction.guild?.members.cache.get(target.id) ?? await interaction.guild?.members.fetch(target.id).catch(() => null);

        if (sub === "add") {
            const reasonKey = interaction.options.getString("reason", true);
            const reasonDoc = await ReasonRepository.findByKey(reasonKey);
            const reason = reasonDoc?.label ?? reasonKey;
            const reasonAr = reasonDoc?.labelAr ?? reason;
            const durationHours = interaction.options.getInteger("duration") ?? 24;
            const durationMs = durationHours * 60 * 60 * 1000;

            const modMember = interaction.member as GuildMember;
            const modLevel = getMemberLevel(modMember);

            if (modLevel.score <= 20) {
                const approvalEmbed = new EmbedBuilder()
                    .setTitle("🔇 Mute Approval Required")
                    .setColor(Colors.moderation)
                    .addFields(
                        { name: "Target", value: `<@${target.id}>`, inline: true },
                        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Reason", value: reason },
                        { name: "Duration", value: `${durationHours} hour(s)`, inline: true },
                        { name: "Type", value: "Mute", inline: true },
                    )
                    .setTimestamp();

                const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`punish_approve_mute_${target.id}_${reasonKey}_${interaction.user.id}_${durationHours}`)
                        .setLabel("Approve")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("✅"),
                    new ButtonBuilder()
                        .setCustomId(`punish_deny_mute_${target.id}_${reasonKey}_${interaction.user.id}`)
                        .setLabel("Deny")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("❌"),
                );

                const approvalChannel = interaction.guild?.channels.cache.get(data.punishments_case_channel_id) as TextChannel | undefined;
                if (approvalChannel) {
                    await approvalChannel.send({ embeds: [approvalEmbed], components: [buttons] });
                }

                await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription("⏳ Your mute request has been sent for approval by a senior moderator.").setColor(Colors.info)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await executeMute(client, guildId, target.id, target.username, reason, reasonAr, interaction.user.id, member, durationMs, interaction.guild);
            await interaction.reply({ embeds: [result.embed] });
        }

        if (sub === "remove") {
            const caseId = interaction.options.getString("case", true);
            const reason = interaction.options.getString("reason", true);

            const punishment = await PunishmentRepository.findByCaseId(caseId);
            if (!punishment || punishment.userId !== target.id || punishment.type !== "mute") {
                await interaction.reply({ embeds: [errorEmbed("Mute case not found for this user.")], flags: MessageFlags.Ephemeral });
                return;
            }

            if (!punishment.active) {
                await interaction.reply({ embeds: [errorEmbed("This mute is already inactive.")], flags: MessageFlags.Ephemeral });
                return;
            }

            await PunishmentRepository.deactivate(caseId);

            if (member) {
                await member.timeout(null, `Unmute: ${reason}`).catch(() => null);
            }

            const level = await PunishmentRepository.getPunishmentLevel(target.id);
            const embed = new EmbedBuilder()
                .setTitle("🔊 User Unmuted (Remove)")
                .setColor(Colors.success)
                .addFields(
                    { name: "User", value: `<@${target.id}>`, inline: true },
                    { name: "Case", value: `\`${caseId}\``, inline: true },
                    { name: "Reason", value: reason },
                    { name: "Punishment Level", value: `\`${level}/100\` (unchanged)`, inline: true },
                )
                .setFooter({ text: "Level was NOT removed. Use /mute appeal to remove level points." })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        if (sub === "appeal") {
            const caseId = interaction.options.getString("case", true);
            const reason = interaction.options.getString("reason", true);

            const punishment = await PunishmentRepository.findByCaseId(caseId);
            if (!punishment || punishment.userId !== target.id || punishment.type !== "mute") {
                await interaction.reply({ embeds: [errorEmbed("Mute case not found for this user.")], flags: MessageFlags.Ephemeral });
                return;
            }

            if (punishment.appealed) {
                await interaction.reply({ embeds: [errorEmbed("This mute has already been appealed.")], flags: MessageFlags.Ephemeral });
                return;
            }

            await PunishmentRepository.appeal(caseId, reason);
            const newLevel = await PunishmentRepository.removePunishmentLevel(target.id, target.username, PunishmentsSystem.mute);
            const levelInfo = PunishmentRepository.getLevelInfo(newLevel);

            if (member) {
                await member.timeout(null, `Appeal: ${reason}`).catch(() => null);
                const allPunishmentRoleIds = Object.values(MembersPunishments).map(p => p.id);
                const rolesToRemove = member.roles.cache.filter(r => allPunishmentRoleIds.includes(r.id));
                for (const [, role] of rolesToRemove) {
                    await member.roles.remove(role).catch(() => null);
                }
                if (levelInfo.roleId) {
                    await member.roles.add(levelInfo.roleId).catch(() => null);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle("✅ Mute Appealed")
                .setColor(Colors.success)
                .addFields(
                    { name: "User", value: `<@${target.id}>`, inline: true },
                    { name: "Case", value: `\`${caseId}\``, inline: true },
                    { name: "Appeal Reason", value: reason },
                    { name: "New Punishment Level", value: `\`${newLevel}/100\` — ${levelInfo.name}`, inline: true },
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        if (sub === "list") {
            const mutes = await PunishmentRepository.findAllByUserAndType(target.id, guildId, "mute");
            const level = await PunishmentRepository.getPunishmentLevel(target.id);

            if (!mutes.length) {
                await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`<@${target.id}> has no mutes.`).setColor(Colors.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = mutes.slice(0, 15).map((m, i) => {
                const status = m.appealed ? "~~Appealed~~" : m.active ? "🔴 Active" : "⚪ Inactive";
                return `**${i + 1}.** \`${m.caseId}\` — ${status}\n> ${m.reason} — <t:${Math.floor(m.createdAt.getTime() / 1000)}:R>`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`🔇 Mutes for ${target.username}`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.moderation)
                .setFooter({ text: `Punishment Level: ${level}/100 | Total: ${mutes.length} mute(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },

    async autocomplete(interaction: AutocompleteInteraction, _client: BotClient) {
        const focused = interaction.options.getFocused(true);
        const sub = interaction.options.getSubcommand();

        if (focused.name === "reason" && sub === "add") {
            const reasons = await ReasonRepository.findByType("mute");
            const filtered = reasons
                .filter(r => r.key.includes(focused.value.toLowerCase()) || r.label.toLowerCase().includes(focused.value.toLowerCase()))
                .slice(0, 25);
            await interaction.respond(filtered.map(r => ({ name: r.label, value: r.key })));
        }

        if (focused.name === "case") {
            const targetId = interaction.options.get("target")?.value as string | undefined;
            if (!targetId) return interaction.respond([]);

            const mutes = await PunishmentRepository.findAllByUserAndType(targetId, interaction.guildId!, "mute");
            const available = mutes.filter(m => !m.appealed);
            const filtered = available
                .filter(m => m.caseId.toLowerCase().includes(focused.value.toLowerCase()) || m.reason.toLowerCase().includes(focused.value.toLowerCase()))
                .slice(0, 25);

            await interaction.respond(
                filtered.map(m => ({
                    name: `${m.caseId} — ${m.reason.slice(0, 80)}`,
                    value: m.caseId,
                }))
            );
        }
    },
};
