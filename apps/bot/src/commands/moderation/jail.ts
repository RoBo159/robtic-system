import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, MEMBER_PUNISHMENTS, PUNISHMENT_POINTS } from "@constants";
import { PunishmentRepository, ReasonRepository } from "@database/repositories";
import { errorEmbed } from "@utils";
import { getUserLang, t } from "@bot/utils/lang";
import { getLogChannel } from "@bot/utils/server-log";
import { recordSecurityEvent } from "../../utils/moderation/security";
import { needsProof, buildProofModal, sendShortcutProofDM } from "../../utils/moderation/punish-flow";

/**
 * The punishment-system jail: a case record, punishment-level points, punishment roles, a DM, and a
 * Discord timeout for the temporary form. It never touches the guild's actual ban list — `/ban`
 * does that. The stored punishment `type` is still "ban"/"tempban" because that is what every
 * existing case record, reason and appeal in the database is keyed on.
 */
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

    const newLevel = await PunishmentRepository.addPunishmentLevel(targetId, targetUsername, PUNISHMENT_POINTS.ban);
    const levelInfo = PunishmentRepository.getLevelInfo(newLevel);

    if (member) {
        const allPunishmentRoleIds = Object.values(MEMBER_PUNISHMENTS).map(p => p.id);
        const rolesToRemove = member.roles.cache.filter(r => allPunishmentRoleIds.includes(r.id));
        for (const [, role] of rolesToRemove) {
            await member.roles.remove(role).catch(() => null);
        }
        if (levelInfo.roleId) {
            await member.roles.add(levelInfo.roleId).catch(() => null);
        }

        if (permanent) {
            await member.roles.add(MEMBER_PUNISHMENTS.permBan.id).catch(() => null);
        } else {
            const timeoutMs = Math.min(durationMs!, 28 * 24 * 60 * 60 * 1000);
            await member.timeout(timeoutMs, `Jail: ${reason}`).catch(() => null);
        }
    }

    const user = await client.users.fetch(targetId).catch(() => null);
    if (user) {
        const lang = await getUserLang(member);
        const localReason = lang === "ar" ? reasonAr : reason;

        const dmEmbed = new EmbedBuilder()
            .setTitle(permanent ? t("moderation.ban_title_perm", lang) : t("moderation.ban_title_temp", lang))
            .setColor(COLORS.moderation)
            .setDescription(
                permanent
                    ? t("moderation.ban_desc_perm", lang, { reason: localReason })
                    : t("moderation.ban_desc_temp", lang, { reason: localReason, duration: String(durationDays) }),
            )
            .setTimestamp();

        await user.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    const logEmbed = new EmbedBuilder()
        .setTitle(permanent ? "🔒 Permanent Jail" : "🔒 Temporary Jail")
        .setColor(COLORS.moderation)
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

    const noticeChannel = await getLogChannel(client, "punishments_notice") as TextChannel | null;
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
            source: "command:/jail",
            details: reason,
        });
    }

    return { embed: logEmbed, caseId, newLevel, levelInfo };
}

export default {
    category: "Moderation",
    data: new SlashCommandBuilder()
        .setName("jail")
        .setDescription("Manage jail punishments (case record, punishment level, timeout)")
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("Jail a user")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to jail").setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("reason").setDescription("Select a reason").setRequired(true).setAutocomplete(true)
                )
                .addBooleanOption(opt =>
                    opt.setName("permanent").setDescription("Permanent jail? (default: false)").setRequired(false)
                )
                .addIntegerOption(opt =>
                    opt.setName("duration").setDescription("Duration in days for temp jail (default: 7)").setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("Release a user (does NOT remove punishment level)")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to release").setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("case").setDescription("The case ID to remove").setRequired(true).setAutocomplete(true)
                )
                .addStringOption(opt =>
                    opt.setName("reason").setDescription("Reason for the release").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("appeal")
                .setDescription("Appeal a jail (removes punishment level points)")
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
                .setDescription("List all jail cases for a user")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to check").setRequired(true)
                )
        ),

    requiredPermission: 60,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();
        const target = interaction.options.getUser("target", true);

        if (sub === "add") {
            const reasonKey = interaction.options.getString("reason", true);
            const permanent = interaction.options.getBoolean("permanent") ?? false;
            const durationDays = interaction.options.getInteger("duration") ?? 7;
            const modMember = interaction.member as GuildMember;
            const extra = permanent ? "perm" : String(durationDays);

            // Must precede any deferReply()/reply() — showModal() has to be the first response.
            if (await needsProof(modMember)) {
                if ((interaction as any).isPrefix) {
                    const sent = await sendShortcutProofDM(client, interaction.user.id, "ban", interaction.guildId!, target.id, reasonKey, extra);
                    await interaction.reply({
                        content: sent
                            ? "📩 Check your DMs — submit proof there to finalize this jail."
                            : "❌ Couldn't DM you to collect proof (check your privacy settings) — ask a Manager+ to run this instead.",
                    });
                    return;
                }

                await interaction.showModal(buildProofModal("ban", interaction.guildId!, target.id, reasonKey, interaction.user.id, extra));
                return;
            }

            await interaction.deferReply();
            const guildId = interaction.guildId!;
            const member = interaction.guild?.members.cache.get(target.id) ?? await interaction.guild?.members.fetch(target.id).catch(() => null);
            const reasonDoc = await ReasonRepository.findByKey(reasonKey);
            const reason = reasonDoc?.label ?? reasonKey;
            const reasonAr = reasonDoc?.labelAr ?? reason;

            const result = await executeBan(client, guildId, target.id, target.username, reason, reasonAr, interaction.user.id, member, permanent, durationDays, interaction.guild);
            await interaction.editReply({ embeds: [result.embed] });
            return;
        }

        await interaction.deferReply();
        const guildId = interaction.guildId!;
        const member = interaction.guild?.members.cache.get(target.id) ?? await interaction.guild?.members.fetch(target.id).catch(() => null);

        if (sub === "remove") {
            const caseId = interaction.options.getString("case", true);
            const reason = interaction.options.getString("reason", true);

            const punishment = await PunishmentRepository.findByCaseId(caseId);
            if (!punishment || punishment.userId !== target.id || (punishment.type !== "ban" && punishment.type !== "tempban")) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ embeds: [errorEmbed("Jail case not found for this user.")], flags: MessageFlags.Ephemeral });
                return;
            }

            if (!punishment.active) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ embeds: [errorEmbed("This jail is already inactive.")], flags: MessageFlags.Ephemeral });
                return;
            }

            await PunishmentRepository.deactivate(caseId);

            if (member) {
                await member.roles.remove(MEMBER_PUNISHMENTS.permBan.id).catch(() => null);
                await member.timeout(null, `Release: ${reason}`).catch(() => null);
            }

            const level = await PunishmentRepository.getPunishmentLevel(target.id);
            const embed = new EmbedBuilder()
                .setTitle("✅ User Released (Remove)")
                .setColor(COLORS.success)
                .addFields(
                    { name: "User", value: `<@${target.id}>`, inline: true },
                    { name: "Case", value: `\`${caseId}\``, inline: true },
                    { name: "Reason", value: reason },
                    { name: "Punishment Level", value: `\`${level}/100\` (unchanged)`, inline: true },
                )
                .setFooter({ text: "Level was NOT removed. Use /jail appeal to remove level points." })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

        if (sub === "appeal") {
            const caseId = interaction.options.getString("case", true);
            const reason = interaction.options.getString("reason", true);

            const punishment = await PunishmentRepository.findByCaseId(caseId);
            if (!punishment || punishment.userId !== target.id || (punishment.type !== "ban" && punishment.type !== "tempban")) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ embeds: [errorEmbed("Jail case not found for this user.")], flags: MessageFlags.Ephemeral });
                return;
            }

            if (punishment.appealed) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ embeds: [errorEmbed("This jail has already been appealed.")], flags: MessageFlags.Ephemeral });
                return;
            }

            await PunishmentRepository.appeal(caseId, reason);
            const newLevel = await PunishmentRepository.removePunishmentLevel(target.id, target.username, PUNISHMENT_POINTS.ban);
            const levelInfo = PunishmentRepository.getLevelInfo(newLevel);

            if (member) {
                await member.roles.remove(MEMBER_PUNISHMENTS.permBan.id).catch(() => null);
                await member.timeout(null, `Appeal: ${reason}`).catch(() => null);
                const allPunishmentRoleIds = Object.values(MEMBER_PUNISHMENTS).map(p => p.id);
                const rolesToRemove = member.roles.cache.filter(r => allPunishmentRoleIds.includes(r.id));
                for (const [, role] of rolesToRemove) {
                    await member.roles.remove(role).catch(() => null);
                }
                if (levelInfo.roleId) {
                    await member.roles.add(levelInfo.roleId).catch(() => null);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle("✅ Jail Appealed")
                .setColor(COLORS.success)
                .addFields(
                    { name: "User", value: `<@${target.id}>`, inline: true },
                    { name: "Case", value: `\`${caseId}\``, inline: true },
                    { name: "Appeal Reason", value: reason },
                    { name: "New Punishment Level", value: `\`${newLevel}/100\` — ${levelInfo.name}`, inline: true },
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

        if (sub === "list") {
            const bans = await PunishmentRepository.findByUser(target.id, guildId);
            const banRecords = bans.filter(p => p.type === "ban" || p.type === "tempban");
            const level = await PunishmentRepository.getPunishmentLevel(target.id);

            if (!banRecords.length) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`<@${target.id}> has no jail cases.`).setColor(COLORS.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = banRecords.slice(0, 15).map((b, i) => {
                const status = b.appealed ? "~~Appealed~~" : b.active ? "🔴 Active" : "⚪ Inactive";
                const banType = b.type === "ban" ? "Permanent" : "Temporary";
                return `**${i + 1}.** \`${b.caseId}\` [${banType}] — ${status}\n> ${b.reason} — <t:${Math.floor(b.createdAt.getTime() / 1000)}:R>`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`🔒 Jail cases for ${target.username}`)
                .setDescription(lines.join("\n\n"))
                .setColor(COLORS.moderation)
                .setFooter({ text: `Punishment Level: ${level}/100 | Total: ${banRecords.length} case(s)` })
                .setTimestamp();

            await interaction.deleteReply().catch(() => {});
            await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
