import {
    ButtonInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS, FULL_POWER_ROLE_IDS, MEMBER_PUNISHMENTS, PUNISHMENT_POINTS } from "@constants";
import { ModMailRepository, PunishmentRepository, ServerConfigRepository } from "@database/repositories";
import { getMemberLevel } from "@bot/utils/access";
import { type Lang } from "@bot/utils/lang";
import { createModmailThread } from "../../utils/modmail/create-modmail-thread";

const appealDecision: ComponentHandler<ButtonInteraction> = {
    customId: /^appeal_(approve|approvepoints|approvenopoints|deny|openchat)_[A-Za-z0-9-]+_\d+_(en|ar)$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const customCaseId = parts[2];
        const userId = parts[3];
        const lang = (parts[4] === "ar" ? "ar" : "en") as Lang;

        const embedCaseId = interaction.message.embeds[0]?.fields.find(f => f.name === "Case ID")?.value;
        const caseId = (embedCaseId && embedCaseId !== "N/A") ? embedCaseId : customCaseId;

        const modMember = interaction.member as GuildMember;
        if (!FULL_POWER_ROLE_IDS.some(id => modMember.roles.cache.has(id)) && (await getMemberLevel(modMember)).score < 80) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setDescription("❌ Only Manager+ can handle appeals.").setColor(COLORS.error)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (action === "openchat") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const existing = await ModMailRepository.findOpenByUser(userId);
            if (existing) {
                await interaction.editReply({
                    embeds: [new EmbedBuilder().setDescription(`⚠️ User already has an open chat: <#${existing.threadId}>`).setColor(COLORS.warning)],
                });
                return;
            }

            const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
            const modmailChannelId = staffGuild ? await ServerConfigRepository.getModmailChannel(staffGuild.id) : null;
            const staffChannel = modmailChannelId ? staffGuild?.channels.cache.get(modmailChannelId) as TextChannel | undefined : undefined;

            if (!staffGuild || !staffChannel) {
                await interaction.editReply({
                    embeds: [new EmbedBuilder().setDescription("❌ Modmail channel was not found.").setColor(COLORS.error)],
                });
                return;
            }

            const targetUser = await client.users.fetch(userId).catch(() => null);
            const thread = await createModmailThread(client, staffGuild, staffChannel, {
                name: `appeal-${targetUser?.username ?? userId}`,
                userId,
                language: lang,
                requestType: "appeal",
                claimedBy: interaction.user.id,
                reason: `Appeal chat opened by ${interaction.user.tag} for case ${caseId}`,
            });

            const infoEmbed = new EmbedBuilder()
                .setTitle("📝 Appeal Chat Opened")
                .setColor(COLORS.info)
                .addFields(
                    { name: "User", value: `<@${userId}>`, inline: true },
                    { name: "Case ID", value: caseId, inline: true },
                    { name: "Opened By", value: `<@${interaction.user.id}>`, inline: true },
                )
                .setTimestamp();

            await thread.send({ embeds: [infoEmbed] });

            if (targetUser) {
                const msg = lang === "ar"
                    ? "💬 تم فتح محادثة استئناف مع فريق الإدارة. يمكنك الرد هنا مباشرة."
                    : "💬 An appeal chat has been opened with the moderation team. You can reply here directly.";
                await targetUser.send({ content: msg }).catch(() => null);
            }

            await interaction.editReply({
                embeds: [new EmbedBuilder().setDescription(`✅ Opened appeal chat: <#${thread.id}>`).setColor(COLORS.success)],
            });
            return;
        }

        if (action === "deny") {
            const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(COLORS.error)
                .setFooter({ text: `❌ Denied by ${interaction.user.username}` });

            await interaction.update({ embeds: [deniedEmbed], components: [] });

            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const msg = lang === "ar"
                    ? "❌ تم رفض طلب الاستئناف الخاص بك بعد المراجعة."
                    : "❌ Your appeal has been denied after review.";
                await user.send({ content: msg }).catch(() => null);
            }
            return;
        }

        await interaction.deferUpdate();

        const punishment = await PunishmentRepository.findByCaseId(caseId);
        if (!punishment || punishment.userId !== userId) {
            await interaction.followUp({
                embeds: [new EmbedBuilder().setDescription("❌ The selected punishment case was not found.").setColor(COLORS.error)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (punishment.appealed) {
            await interaction.followUp({
                embeds: [new EmbedBuilder().setDescription("⚠️ This appeal has already been processed.").setColor(COLORS.warning)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await PunishmentRepository.appeal(caseId, `Approved by ${interaction.user.username}`);

        const normalizedAction = action === "approve" ? "approvepoints" : action;

        if (normalizedAction === "approvepoints") {
            const typePointsMap: Record<string, number> = {
                warn: PUNISHMENT_POINTS.warn,
                mute: PUNISHMENT_POINTS.mute,
                ban: PUNISHMENT_POINTS.ban,
                tempban: PUNISHMENT_POINTS.ban,
            };
            const points = typePointsMap[punishment.type] ?? 0;

            if (points > 0) {
                const guild = client.guilds.cache.get(process.env.MainGuild!);
                const targetUser = await client.users.fetch(userId).catch(() => null);
                const newLevel = await PunishmentRepository.removePunishmentLevel(
                    userId,
                    targetUser?.username ?? "Unknown",
                    points,
                );
                const levelInfo = PunishmentRepository.getLevelInfo(newLevel);

                const member = guild?.members.cache.get(userId)
                    ?? await guild?.members.fetch(userId).catch(() => null);

                if (member) {
                    const allRoleIds = Object.values(MEMBER_PUNISHMENTS).map(p => p.id);
                    const rolesToRemove = member.roles.cache.filter(r => allRoleIds.includes(r.id));
                    for (const [, role] of rolesToRemove) {
                        await member.roles.remove(role).catch(() => null);
                    }
                    if (levelInfo.roleId) {
                        await member.roles.add(levelInfo.roleId).catch(() => null);
                    }
                }
            }
        }

        const guild = client.guilds.cache.get(process.env.MainGuild!);
        const member = guild?.members.cache.get(userId)
            ?? await guild?.members.fetch(userId).catch(() => null);

        if (member && punishment.type === "mute") {
            await member.timeout(null, "Appeal approved").catch(() => null);
        }

        if (punishment.type === "ban" || punishment.type === "tempban") {
            await guild?.bans.remove(userId, "Appeal approved").catch(() => null);
        }

        const footerText = normalizedAction === "approvenopoints"
            ? `✅ Approved (kept points) by ${interaction.user.username}`
            : `✅ Approved (removed points) by ${interaction.user.username}`;

        const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(COLORS.success)
            .setFooter({ text: footerText });

        await interaction.editReply({ embeds: [approvedEmbed], components: [] });

        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
            const msg = lang === "ar"
                ? "✅ تمت الموافقة على طلب الاستئناف الخاص بك."
                : "✅ Your appeal has been approved.";
            await user.send({ content: msg }).catch(() => null);
        }
    },
};

export default appealDecision;
