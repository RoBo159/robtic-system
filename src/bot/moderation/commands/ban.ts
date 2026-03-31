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
import { recordSecurityEvent } from "../utils/security";

export async function executeBan(
    client: BotClient,
    guildId: string,
    targetId: string,
    targetUsername: string,
    reason: string,
    reasonAr: string,
    moderatorId: string,
    member: GuildMember | null | undefined,
    permanent: boolean,
    durationDays: number,
    guild: ChatInputCommandInteraction["guild"],
) {
    const type = permanent ? "ban" : "tempban";
    const durationMs = permanent ? null : durationDays * 24 * 60 * 60 * 1000;
    const expiresAt = permanent ? null : new Date(Date.now() + durationMs!);

    const caseId = await PunishmentRepository.getNextCaseId(guildId);
    await PunishmentRepository.create({
        caseId,
        guildId,
        userId: targetId,
        moderatorId,
        type,
        reason,
        duration: durationMs,
        expiresAt,
        active: true,
    });

    const newLevel = await PunishmentRepository.addPunishmentLevel(targetId, targetUsername, PunishmentsSystem.ban);
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

        if (permanent) {
            await member.roles.add(MembersPunishments.permBan.id).catch(() => null);
        } else {
            const timeoutMs = Math.min(durationMs!, 28 * 24 * 60 * 60 * 1000);
            await member.timeout(timeoutMs, `Ban: ${reason}`).catch(() => null);
        }
    }

    const user = await client.users.fetch(targetId).catch(() => null);
    if (user) {
        const lang = getUserLang(member);
        const localReason = lang === "ar" ? reasonAr : reason;

        const dmEmbed = new EmbedBuilder()
            .setTitle(permanent ? t("moderation.ban_title_perm", lang) : t("moderation.ban_title_temp", lang))
            .setColor(Colors.moderation)
            .setDescription(
                permanent
                    ? t("moderation.ban_desc_perm", lang, { reason: localReason })
                    : t("moderation.ban_desc_temp", lang, { reason: localReason, duration: String(durationDays) }),
            )
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
        .setTitle(permanent ? "🔨 Permanent Ban" : "🔨 Temporary Ban")
        .setColor(Colors.moderation)
        .addFields(
            { name: "User", value: `<@${targetId}>`, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            { name: "Case", value: `\`${caseId}\``, inline: true },
            { name: "Reason", value: reason },
            { name: "Type", value: permanent ? "Permanent" : `Temporary (${durationDays} day(s))`, inline: true },
            ...(expiresAt ? [{ name: "Expires", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }] : []),
            { name: "Punishment Level", value: `\`${newLevel}/100\` — ${levelInfo.name}`, inline: true },
        )
        .setTimestamp();

    const noticeChannel = guild?.channels.cache.get(data.punishments_notice_channel_id) as TextChannel | undefined;
    if (noticeChannel) {
        await noticeChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }

    if (guild) {
        await recordSecurityEvent({
            client,
            guild,
            event: "ban",
            executorId: moderatorId,
            targetId,
            source: "command:/ban",
            details: reason,
        });
    }

    return { embed: logEmbed, caseId, newLevel, levelInfo };
}

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Manage user bans")
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("Ban a user")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to ban").setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("reason").setDescription("Select a reason").setRequired(true).setAutocomplete(true)
                )
                .addBooleanOption(opt =>
                    opt.setName("permanent").setDescription("Permanent ban? (default: false)").setRequired(false)
                )
                .addIntegerOption(opt =>
                    opt.setName("duration").setDescription("Duration in days for temp ban (default: 7)").setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("Unban a user (does NOT remove punishment level)")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to unban").setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("case").setDescription("The case ID to remove").setRequired(true).setAutocomplete(true)
                )
                .addStringOption(opt =>
                    opt.setName("reason").setDescription("Reason for the unban").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("appeal")
                .setDescription("Appeal a ban (removes punishment level points)")
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
                .setDescription("List all bans for a user")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to check").setRequired(true)
                )
        ),

    requiredPermission: 60,
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
            const permanent = interaction.options.getBoolean("permanent") ?? false;
            const durationDays = interaction.options.getInteger("duration") ?? 7;

            const modMember = interaction.member as GuildMember;
            const modLevel = getMemberLevel(modMember);

            if (modLevel.score <= 20) {
                const approvalEmbed = new EmbedBuilder()
                    .setTitle("🔨 Ban Approval Required")
                    .setColor(Colors.moderation)
                    .addFields(
                        { name: "Target", value: `<@${target.id}>`, inline: true },
                        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Reason", value: reason },
                        { name: "Type", value: permanent ? "Permanent Ban" : `Temp Ban (${durationDays} day(s))`, inline: true },
                    )
                    .setTimestamp();

                const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`punish_approve_ban_${target.id}_${reasonKey}_${interaction.user.id}_${permanent ? "perm" : durationDays}`)
                        .setLabel("Approve")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("✅"),
                    new ButtonBuilder()
                        .setCustomId(`punish_deny_ban_${target.id}_${reasonKey}_${interaction.user.id}`)
                        .setLabel("Deny")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("❌"),
                );

                const approvalChannel = interaction.guild?.channels.cache.get(data.punishments_case_channel_id) as TextChannel | undefined;
                if (approvalChannel) {
                    await approvalChannel.send({ embeds: [approvalEmbed], components: [buttons] });
                }

                await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription("⏳ Your ban request has been sent for approval by a senior moderator.").setColor(Colors.info)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await executeBan(client, guildId, target.id, target.username, reason, reasonAr, interaction.user.id, member, permanent, durationDays, interaction.guild);
            await interaction.reply({ embeds: [result.embed] });
        }

        if (sub === "remove") {
            const caseId = interaction.options.getString("case", true);
            const reason = interaction.options.getString("reason", true);

            const punishment = await PunishmentRepository.findByCaseId(caseId);
            if (!punishment || punishment.userId !== target.id || (punishment.type !== "ban" && punishment.type !== "tempban")) {
                await interaction.reply({ embeds: [errorEmbed("Ban case not found for this user.")], flags: MessageFlags.Ephemeral });
                return;
            }

            if (!punishment.active) {
                await interaction.reply({ embeds: [errorEmbed("This ban is already inactive.")], flags: MessageFlags.Ephemeral });
                return;
            }

            await PunishmentRepository.deactivate(caseId);

            if (member) {
                await member.roles.remove(MembersPunishments.permBan.id).catch(() => null);
                await member.timeout(null, `Unban: ${reason}`).catch(() => null);
            }

            const level = await PunishmentRepository.getPunishmentLevel(target.id);
            const embed = new EmbedBuilder()
                .setTitle("✅ User Unbanned (Remove)")
                .setColor(Colors.success)
                .addFields(
                    { name: "User", value: `<@${target.id}>`, inline: true },
                    { name: "Case", value: `\`${caseId}\``, inline: true },
                    { name: "Reason", value: reason },
                    { name: "Punishment Level", value: `\`${level}/100\` (unchanged)`, inline: true },
                )
                .setFooter({ text: "Level was NOT removed. Use /ban appeal to remove level points." })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        if (sub === "appeal") {
            const caseId = interaction.options.getString("case", true);
            const reason = interaction.options.getString("reason", true);

            const punishment = await PunishmentRepository.findByCaseId(caseId);
            if (!punishment || punishment.userId !== target.id || (punishment.type !== "ban" && punishment.type !== "tempban")) {
                await interaction.reply({ embeds: [errorEmbed("Ban case not found for this user.")], flags: MessageFlags.Ephemeral });
                return;
            }

            if (punishment.appealed) {
                await interaction.reply({ embeds: [errorEmbed("This ban has already been appealed.")], flags: MessageFlags.Ephemeral });
                return;
            }

            await PunishmentRepository.appeal(caseId, reason);
            const newLevel = await PunishmentRepository.removePunishmentLevel(target.id, target.username, PunishmentsSystem.ban);
            const levelInfo = PunishmentRepository.getLevelInfo(newLevel);

            if (member) {
                await member.roles.remove(MembersPunishments.permBan.id).catch(() => null);
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
                .setTitle("✅ Ban Appealed")
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
            const bans = await PunishmentRepository.findByUser(target.id, guildId);
            const banRecords = bans.filter(p => p.type === "ban" || p.type === "tempban");
            const level = await PunishmentRepository.getPunishmentLevel(target.id);

            if (!banRecords.length) {
                await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`<@${target.id}> has no bans.`).setColor(Colors.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = banRecords.slice(0, 15).map((b, i) => {
                const status = b.appealed ? "~~Appealed~~" : b.active ? "🔴 Active" : "⚪ Inactive";
                const banType = b.type === "ban" ? "Permanent" : "Temporary";
                return `**${i + 1}.** \`${b.caseId}\` [${banType}] — ${status}\n> ${b.reason} — <t:${Math.floor(b.createdAt.getTime() / 1000)}:R>`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`🔨 Bans for ${target.username}`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.moderation)
                .setFooter({ text: `Punishment Level: ${level}/100 | Total: ${banRecords.length} ban(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },

    async autocomplete(interaction: AutocompleteInteraction, _client: BotClient) {
        const focused = interaction.options.getFocused(true);
        const sub = interaction.options.getSubcommand();

        if (focused.name === "reason" && sub === "add") {
            const reasons = await ReasonRepository.findByType("ban");
            const filtered = reasons
                .filter(r => r.key.includes(focused.value.toLowerCase()) || r.label.toLowerCase().includes(focused.value.toLowerCase()))
                .slice(0, 25);
            await interaction.respond(filtered.map(r => ({ name: r.label, value: r.key })));
        }

        if (focused.name === "case") {
            const targetId = interaction.options.get("target")?.value as string | undefined;
            if (!targetId) return interaction.respond([]);

            const bans = await PunishmentRepository.findByUser(targetId, interaction.guildId!);
            const banRecords = bans.filter(b => (b.type === "ban" || b.type === "tempban") && !b.appealed);
            const filtered = banRecords
                .filter(b => b.caseId.toLowerCase().includes(focused.value.toLowerCase()) || b.reason.toLowerCase().includes(focused.value.toLowerCase()))
                .slice(0, 25);

            await interaction.respond(
                filtered.map(b => ({
                    name: `${b.caseId} — ${b.reason.slice(0, 80)}`,
                    value: b.caseId,
                }))
            );
        }
    },
};
