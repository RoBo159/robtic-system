import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    type ChatInputCommandInteraction,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, MODERATION_ACTION_MESSAGES as MSG } from "@constants";
import { recordSecurityEvent, sendAuditLog } from "../../utils/moderation/security";
import { canActOn } from "../../utils/moderation/hierarchy";

/**
 * A real Discord guild ban.
 *
 * `/ban` used to be the punishment-system command that adds a case, punishment points and a
 * timeout — that is `/jail` now. This one puts the user on the guild's ban list and nothing else,
 * which is what everyone expects `/ban` to do.
 */
export default {
    category: "Moderation",
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the server")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt =>
            opt.setName("target").setDescription("The user to ban").setRequired(true)
        )
        // Last, and the only string option, so `!ban @user spamming in general` takes the whole
        // trailing text as the reason instead of just the first word.
        .addStringOption(opt =>
            opt.setName("reason").setDescription("Why they are being banned").setRequired(false)
        ),

    requiredPermission: 60,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: MSG.guildOnly });
            return;
        }

        const target = interaction.options.getUser("target", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";

        if (target.id === interaction.user.id) {
            await interaction.reply({ content: MSG.selfTarget("ban") });
            return;
        }
        if (target.id === client.user?.id) {
            await interaction.reply({ content: MSG.botTarget("ban") });
            return;
        }

        if (!guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
            await interaction.reply({ content: MSG.banMissingPermission });
            return;
        }

        const existingBan = await guild.bans.fetch(target.id).catch(() => null);
        if (existingBan) {
            await interaction.reply({ content: MSG.alreadyBanned(target.id) });
            return;
        }

        // A user who already left can still be banned, so a missing member is not an error here —
        // it only means there is no hierarchy to check.
        const member = guild.members.cache.get(target.id) ?? await guild.members.fetch(target.id).catch(() => null);
        if (member) {
            if (!canActOn(interaction.member as GuildMember, member)) {
                await interaction.reply({ content: MSG.banAboveExecutor });
                return;
            }
            if (!member.bannable) {
                await interaction.reply({ content: MSG.banNotBannable });
                return;
            }
        }

        await interaction.deferReply();

        const banned = await guild.bans.create(target.id, { reason: `${interaction.user.tag}: ${reason}` }).catch(() => null);
        if (!banned) {
            await interaction.editReply({ content: MSG.banFailed });
            return;
        }

        await interaction.editReply({ content: MSG.banned(target.tag, target.id, reason) });

        await sendAuditLog(
            guild,
            "member_ban",
            new EmbedBuilder()
                .setTitle("📘 Audit: Member Ban")
                .setColor(COLORS.moderation)
                .addFields(
                    { name: "Target", value: `<@${target.id}> (${target.id})` },
                    { name: "Executor", value: `<@${interaction.user.id}> (${interaction.user.id})` },
                    { name: "Reason", value: reason },
                    { name: "Source", value: "/ban", inline: true },
                )
                .setTimestamp(),
        );

        await recordSecurityEvent({
            client,
            guild,
            event: "ban",
            executorId: interaction.user.id,
            targetId: target.id,
            source: "command:/ban",
            details: reason,
        });
    },
};
