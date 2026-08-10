import {
    ButtonInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { ReasonRepository } from "@database/repositories";
import { getMemberLevel, isInDepartment } from "@bot/utils/access";
import { executeWarn } from "../../commands/moderation/warn";
import { executeMute } from "../../commands/moderation/mute";
import { executeBan } from "../../commands/moderation/ban";

export default {
    customId: /^punish_(approve|deny)_(warn|mute|ban)_/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const type = parts[2];
        const targetId = parts[3];
        const reasonKey = parts[4];
        const requesterId = parts[5];
        const extra = parts[6];

        const modMember = interaction.member as GuildMember;
        const modLevel = await getMemberLevel(modMember);

        if (modLevel.score < 60 || !(await isInDepartment(modMember, "Moderation"))) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setDescription("❌ Only Expert+ moderators can approve or deny punishment requests.").setColor(COLORS.error)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferUpdate();

        if (action === "deny") {
            const denyEmbed = new EmbedBuilder()
                .setTitle("❌ Punishment Request Denied")
                .setColor(COLORS.error)
                .setDescription(`<@${interaction.user.id}> denied the ${type} request by <@${requesterId}> against <@${targetId}>.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [denyEmbed], components: [] });
            return;
        }

        const guild = interaction.guild!;
        const guildId = guild.id;
        const reasonDoc = await ReasonRepository.findByKey(reasonKey);
        const reason = reasonDoc?.label ?? reasonKey;
        const reasonAr = reasonDoc?.labelAr ?? reason;
        const member = guild.members.cache.get(targetId) ?? await guild.members.fetch(targetId).catch(() => null);
        const targetUser = await client.users.fetch(targetId).catch(() => null);
        const targetUsername = targetUser?.username ?? targetId;

        if (type === "warn") {
            const result = await executeWarn(client, guildId, targetId, targetUsername, reason, reasonAr, requesterId, member);
            const approvedEmbed = result.embed.setFooter({ text: `Approved by ${interaction.user.username}` });
            await interaction.editReply({ embeds: [approvedEmbed], components: [] });
        }

        if (type === "mute") {
            const durationHours = parseInt(extra) || 24;
            const durationMs = durationHours * 60 * 60 * 1000;
            const result = await executeMute(client, guildId, targetId, targetUsername, reason, reasonAr, requesterId, member, durationMs, guild);
            const approvedEmbed = result.embed.setFooter({ text: `Approved by ${interaction.user.username}` });
            await interaction.editReply({ embeds: [approvedEmbed], components: [] });
        }

        if (type === "ban") {
            const permanent = extra === "perm";
            const durationDays = permanent ? 7 : (parseInt(extra) || 7);
            const result = await executeBan(client, guildId, targetId, targetUsername, reason, reasonAr, requesterId, member, permanent, durationDays, guild);
            const approvedEmbed = result.embed.setFooter({ text: `Approved by ${interaction.user.username}` });
            await interaction.editReply({ embeds: [approvedEmbed], components: [] });
        }
    },
};
