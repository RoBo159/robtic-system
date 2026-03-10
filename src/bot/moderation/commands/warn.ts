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

export async function executeWarn(
    client: BotClient,
    guildId: string,
    targetId: string,
    targetUsername: string,
    reason: string,
    reasonAr: string,
    moderatorId: string,
    member: GuildMember | null | undefined,
) {
    const caseId = await PunishmentRepository.getNextCaseId(guildId);
    await PunishmentRepository.create({
        caseId,
        guildId,
        userId: targetId,
        moderatorId,
        type: "warn",
        reason,
        active: true,
    });

    const newLevel = await PunishmentRepository.addPunishmentLevel(targetId, targetUsername, PunishmentsSystem.warn);
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

        if (newLevel >= MembersPunishments.tempMute.level && newLevel < MembersPunishments.tempBan.level) {
            await member.timeout(24 * 60 * 60 * 1000, `Auto-mute: punishment level ${newLevel}`).catch(() => null);
        }
        if (newLevel >= MembersPunishments.permBan.level) {
            await member.roles.add(MembersPunishments.permBan.id).catch(() => null);
        }
    }

    const user = await client.users.fetch(targetId).catch(() => null);
    if (user) {
        const lang = getUserLang(member);
        const localReason = lang === "ar" ? reasonAr : reason;

        const dmEmbed = new EmbedBuilder()
            .setTitle(t("moderation.warn_title", lang))
            .setColor(Colors.warning)
            .setDescription(t("moderation.warn_desc", lang, { reason: localReason }))
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

    const embed = new EmbedBuilder()
        .setTitle("⚠️ Warning Issued")
        .setColor(Colors.warning)
        .addFields(
            { name: "User", value: `<@${targetId}>`, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            { name: "Case", value: `\`${caseId}\``, inline: true },
            { name: "Reason", value: reason },
            { name: "Punishment Level", value: `\`${newLevel}/100\` — ${levelInfo.name}`, inline: true },
        )
        .setTimestamp();

    return { embed, caseId, newLevel, levelInfo };
}

export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Manage user warnings")
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("Issue a warning to a user")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to warn").setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("reason").setDescription("Select a reason").setRequired(true).setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("appeal")
                .setDescription("Appeal (remove) a specific warning from a user")
                .addUserOption(opt =>
                    opt.setName("target").setDescription("The user to appeal a warning for").setRequired(true)
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
                .setDescription("List all warnings for a user")
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

            const modMember = interaction.member as GuildMember;
            const modLevel = getMemberLevel(modMember);

            if (modLevel.score <= 20) {
                const approvalEmbed = new EmbedBuilder()
                    .setTitle("⚠️ Warning Approval Required")
                    .setColor(Colors.warning)
                    .addFields(
                        { name: "Target", value: `<@${target.id}>`, inline: true },
                        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Reason", value: reason },
                        { name: "Type", value: "Warning", inline: true },
                    )
                    .setTimestamp();

                const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`punish_approve_warn_${target.id}_${reasonKey}_${interaction.user.id}`)
                        .setLabel("Approve")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("✅"),
                    new ButtonBuilder()
                        .setCustomId(`punish_deny_warn_${target.id}_${reasonKey}_${interaction.user.id}`)
                        .setLabel("Deny")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("❌"),
                );

                const approvalChannel = interaction.guild?.channels.cache.get(data.punishments_case_channel_id) as TextChannel | undefined;
                if (approvalChannel) {
                    await approvalChannel.send({ embeds: [approvalEmbed], components: [buttons] });
                }

                await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription("⏳ Your warning request has been sent for approval by a senior moderator.").setColor(Colors.info)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await executeWarn(client, guildId, target.id, target.username, reason, reasonAr, interaction.user.id, member);
            await interaction.reply({ embeds: [result.embed] });
        }

        if (sub === "appeal") {
            const caseId = interaction.options.getString("case", true);
            const reason = interaction.options.getString("reason", true);

            const punishment = await PunishmentRepository.findByCaseId(caseId);
            if (!punishment || punishment.userId !== target.id || punishment.type !== "warn") {
                await interaction.reply({ embeds: [errorEmbed("Warning case not found for this user.")], flags: MessageFlags.Ephemeral });
                return;
            }

            if (punishment.appealed) {
                await interaction.reply({ embeds: [errorEmbed("This warning has already been appealed.")], flags: MessageFlags.Ephemeral });
                return;
            }

            await PunishmentRepository.appeal(caseId, reason);
            const newLevel = await PunishmentRepository.removePunishmentLevel(target.id, target.username, PunishmentsSystem.warn);
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
            }

            const embed = new EmbedBuilder()
                .setTitle("✅ Warning Appealed")
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
            const warns = await PunishmentRepository.findAllByUserAndType(target.id, guildId, "warn");
            const level = await PunishmentRepository.getPunishmentLevel(target.id);

            if (!warns.length) {
                await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`<@${target.id}> has no warnings.`).setColor(Colors.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = warns.slice(0, 15).map((w, i) => {
                const status = w.appealed ? "~~Appealed~~" : w.active ? "🔴 Active" : "⚪ Inactive";
                return `**${i + 1}.** \`${w.caseId}\` — ${status}\n> ${w.reason} — <t:${Math.floor(w.createdAt.getTime() / 1000)}:R>`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`⚠️ Warnings for ${target.username}`)
                .setDescription(lines.join("\n\n"))
                .setColor(Colors.warning)
                .setFooter({ text: `Punishment Level: ${level}/100 | Total: ${warns.length} warning(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },

    async autocomplete(interaction: AutocompleteInteraction, _client: BotClient) {
        const focused = interaction.options.getFocused(true);
        const sub = interaction.options.getSubcommand();

        if (focused.name === "reason" && sub === "add") {
            const reasons = await ReasonRepository.findByType("warn");
            const filtered = reasons
                .filter(r => r.key.includes(focused.value.toLowerCase()) || r.label.toLowerCase().includes(focused.value.toLowerCase()))
                .slice(0, 25);
            await interaction.respond(filtered.map(r => ({ name: r.label, value: r.key })));
        }

        if (focused.name === "case") {
            const targetId = interaction.options.get("target")?.value as string | undefined;
            if (!targetId) return interaction.respond([]);

            const warns = await PunishmentRepository.findAllByUserAndType(targetId, interaction.guildId!, "warn");
            const active = warns.filter(w => w.active && !w.appealed);
            const filtered = active
                .filter(w => w.caseId.toLowerCase().includes(focused.value.toLowerCase()) || w.reason.toLowerCase().includes(focused.value.toLowerCase()))
                .slice(0, 25);

            await interaction.respond(
                filtered.map(w => ({
                    name: `${w.caseId} — ${w.reason.slice(0, 80)}`,
                    value: w.caseId,
                }))
            );
        }
    },
};