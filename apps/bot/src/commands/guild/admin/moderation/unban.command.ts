import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    type ChatInputCommandInteraction,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, MODERATION_ACTION_MESSAGES as MSG } from "@constants";
import { sendAuditLog } from "@bot/utils/moderation/security";
import { resolveUserId } from "@bot/utils/moderation/hierarchy";

/**
 * Lifts a `/ban`.
 *
 * `user` is a string rather than a User option because Discord's user picker can only offer people
 * it can resolve in the guild, and a banned user never is.
 */
export default {
    scope: "guild",
    category: "Moderation",
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Lift a ban")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption(opt =>
            opt.setName("user").setDescription("The banned user's id").setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("reason").setDescription("Why the ban is being lifted").setRequired(false)
        ),

    requiredPermission: 60,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: MSG.guildOnly });
            return;
        }

        const raw = interaction.options.getString("user", true);
        const userId = resolveUserId(raw);
        if (!userId) {
            await interaction.reply({ content: MSG.invalidUserId(raw) });
            return;
        }

        const reason = interaction.options.getString("reason") ?? "No reason provided";

        if (!guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
            await interaction.reply({ content: MSG.banMissingPermission });
            return;
        }

        await interaction.deferReply();

        const ban = await guild.bans.fetch(userId).catch(() => null);
        if (!ban) {
            await interaction.editReply({ content: MSG.unbanNotBanned(userId) });
            return;
        }

        const lifted = await guild.bans.remove(userId, `${interaction.user.tag}: ${reason}`).catch(() => null);
        if (!lifted) {
            await interaction.editReply({ content: MSG.unbanFailed });
            return;
        }

        await interaction.editReply({ content: MSG.unbanned(ban.user.tag, userId, reason) });

        await sendAuditLog(
            guild,
            "member_ban",
            new EmbedBuilder()
                .setTitle("📘 Audit: Member Unban")
                .setColor(COLORS.success)
                .addFields(
                    { name: "Target", value: `<@${userId}> (${userId})` },
                    { name: "Executor", value: `<@${interaction.user.id}> (${interaction.user.id})` },
                    { name: "Reason", value: reason },
                    { name: "Source", value: "/unban", inline: true },
                )
                .setTimestamp(),
        );
    },
};
