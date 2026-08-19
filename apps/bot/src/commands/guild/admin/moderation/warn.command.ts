import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, MEMBER_PUNISHMENTS, PUNISHMENT_POINTS } from "@constants";
import { PunishmentRepository, ReasonRepository } from "@database/repositories";
import { errorText } from "@utils";
import { getUserLang, t } from "@bot/utils/lang";
import { needsProof, buildProofModal, sendShortcutProofDM, awardPunishPoints } from "@bot/utils/moderation/punish-flow";

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

    const newLevel = await PunishmentRepository.addPunishmentLevel(targetId, targetUsername, PUNISHMENT_POINTS.warn);
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

        if (newLevel >= MEMBER_PUNISHMENTS.tempMute.level && newLevel < MEMBER_PUNISHMENTS.tempBan.level) {
            await member.timeout(24 * 60 * 60 * 1000, `Auto-mute: punishment level ${newLevel}`).catch(() => null);
        }
        if (newLevel >= MEMBER_PUNISHMENTS.permBan.level) {
            await member.roles.add(MEMBER_PUNISHMENTS.permBan.id).catch(() => null);
        }
    }

    const user = await client.users.fetch(targetId).catch(() => null);
    if (user) {
        const lang = await getUserLang(member);
        const localReason = lang === "ar" ? reasonAr : reason;

        const dmEmbed = new EmbedBuilder()
            .setTitle(t("moderation.warn_title", lang))
            .setColor(COLORS.warning)
            .setDescription(t("moderation.warn_desc", lang, { reason: localReason }))
            .setTimestamp();

        await user.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    const embed = new EmbedBuilder()
        .setTitle("⚠️ Warning Issued")
        .setColor(COLORS.warning)
        .addFields(
            { name: "User", value: `<@${targetId}>`, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            { name: "Case", value: `\`${caseId}\``, inline: true },
            { name: "Reason", value: reason },
            { name: "Punishment Level", value: `\`${newLevel}/100\` — ${levelInfo.name}`, inline: true },
        )
        .setTimestamp();

    const moderator = await client.users.fetch(moderatorId).catch(() => null);
    await awardPunishPoints(guildId, moderatorId, moderator?.username ?? moderatorId, "warn");

    return { embed, caseId, newLevel, levelInfo };
}

export default {
    scope: "guild",
    category: "Moderation",
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

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();
        const target = interaction.options.getUser("target", true);

        if (sub === "add") {
            const reasonKey = interaction.options.getString("reason", true);
            const modMember = interaction.member as GuildMember;

            // Must precede any deferReply()/reply() — showModal() has to be the first response.
            if (await needsProof(modMember)) {
                if ((interaction as any).isPrefix) {
                    const sent = await sendShortcutProofDM(client, interaction.user.id, "warn", interaction.guildId!, target.id, reasonKey);
                    await interaction.reply({
                        content: sent
                            ? "📩 Check your DMs — submit proof there to finalize this warning."
                            : "❌ Couldn't DM you to collect proof (check your privacy settings) — ask a Manager+ to run this instead.",
                    });
                    return;
                }

                await interaction.showModal(buildProofModal("warn", interaction.guildId!, target.id, reasonKey, interaction.user.id));
                return;
            }

            await interaction.deferReply();
            const guildId = interaction.guildId!;
            const member = interaction.guild?.members.cache.get(target.id) ?? await interaction.guild?.members.fetch(target.id).catch(() => null);
            const reasonDoc = await ReasonRepository.findByKey(reasonKey);
            const reason = reasonDoc?.label ?? reasonKey;
            const reasonAr = reasonDoc?.labelAr ?? reason;

            const result = await executeWarn(client, guildId, target.id, target.username, reason, reasonAr, interaction.user.id, member);
            await interaction.editReply({ embeds: [result.embed] });
            return;
        }

        await interaction.deferReply();
        const guildId = interaction.guildId!;
        const member = interaction.guild?.members.cache.get(target.id) ?? await interaction.guild?.members.fetch(target.id).catch(() => null);

        if (sub === "appeal") {
            const caseId = interaction.options.getString("case", true);
            const reason = interaction.options.getString("reason", true);

            const punishment = await PunishmentRepository.findByCaseId(caseId);
            if (!punishment || punishment.userId !== target.id || punishment.type !== "warn") {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ content: errorText("Warning case not found for this user."), flags: MessageFlags.Ephemeral });
                return;
            }

            if (punishment.appealed) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ content: errorText("This warning has already been appealed."), flags: MessageFlags.Ephemeral });
                return;
            }

            await PunishmentRepository.appeal(caseId, reason);
            const newLevel = await PunishmentRepository.removePunishmentLevel(target.id, target.username, PUNISHMENT_POINTS.warn);
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
            }

            const embed = new EmbedBuilder()
                .setTitle("✅ Warning Appealed")
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
            const warns = await PunishmentRepository.findAllByUserAndType(target.id, guildId, "warn");
            const level = await PunishmentRepository.getPunishmentLevel(target.id);

            if (!warns.length) {
                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`<@${target.id}> has no warnings.`).setColor(COLORS.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = warns.slice(0, 15).map((w, i) => {
                const status = w.appealed ? "~~Appealed~~" : w.active ? "🔴 Active" : "⚪ Inactive";
                return `**${i + 1}.** \`${w.caseId}\` — ${status}\n> ${w.reason} — <t:${Math.floor(w.createdAt.getTime() / 1000)}:R>`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`⚠️ Warnings for ${target.username}`)
                .setDescription(lines.join("\n\n"))
                .setColor(COLORS.warning)
                .setFooter({ text: `Punishment Level: ${level}/100 | Total: ${warns.length} warning(s)` })
                .setTimestamp();

            await interaction.deleteReply().catch(() => {});
            await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
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