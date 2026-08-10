import {
    ModalSubmitInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS } from "@constants";
import { ReasonRepository } from "@database/repositories";
import { getMemberLevel } from "@bot/utils/access";
import { executeWarn } from "../../commands/moderation/warn";
import { executeMute } from "../../commands/moderation/mute";
import { executeBan } from "../../commands/moderation/jail";
import { parseProofCustomId, postProof, requestApproval, getOptionalUploadedFileUrl, getOptionalText } from "../../utils/moderation/punish-flow";

// Handles the standalone proof modal — reached from ban/mute/warn's run() directly, or via the DM button flow (punishShortcutDM.ts).
export default {
    customId: /^punish_proof_(warn|mute|ban)_/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        const parsed = parseProofCustomId(interaction.customId);
        if (!parsed) return;
        const { type, guildId, targetId, reasonKey, moderatorId, extra } = parsed;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            await interaction.editReply({ content: "That server is no longer reachable." });
            return;
        }

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        const targetMember = await guild.members.fetch(targetId).catch(() => null);
        const modMember = await guild.members.fetch(moderatorId).catch(() => null);

        if (!targetUser || !modMember) {
            await interaction.editReply({ content: "Couldn't resolve the target user or moderator — they may have left the server." });
            return;
        }

        const reasonDoc = await ReasonRepository.findByKey(reasonKey);
        const reason = reasonDoc?.label ?? reasonKey;
        const reasonAr = reasonDoc?.labelAr ?? reason;

        const proofUrl = getOptionalUploadedFileUrl(interaction.fields, "proof");
        const note = getOptionalText(interaction.fields, "note");
        if (proofUrl) {
            await postProof(client, guildId, { type, targetId, moderatorId, note, attachmentUrl: proofUrl });
        }

        const modLevel = await getMemberLevel(modMember);
        const needsApproval = modLevel.score <= 20;

        if (needsApproval) {
            await requestApproval({
                client, type, targetId, reasonKey, reasonLabel: reason,
                requesterId: moderatorId, extra, proofUrl: proofUrl ?? undefined,
            });
            await interaction.editReply({
                embeds: [new EmbedBuilder().setDescription("⏳ Proof received — your request has been sent for approval.").setColor(COLORS.info)],
            });
            return;
        }

        if (type === "warn") {
            const result = await executeWarn(client, guildId, targetId, targetUser.username, reason, reasonAr, moderatorId, targetMember);
            await interaction.editReply({ embeds: [result.embed] });
        } else if (type === "mute") {
            const durationHours = parseInt(extra) || 24;
            const durationMs = durationHours * 60 * 60 * 1000;
            const result = await executeMute(client, guildId, targetId, targetUser.username, reason, reasonAr, moderatorId, targetMember, durationMs, guild);
            await interaction.editReply({ embeds: [result.embed] });
        } else if (type === "ban") {
            const permanent = extra === "perm";
            const durationDays = permanent ? 0 : (parseInt(extra) || 7);
            const result = await executeBan(client, guildId, targetId, targetUser.username, reason, reasonAr, moderatorId, targetMember, permanent, durationDays, guild);
            await interaction.editReply({ embeds: [result.embed] });
        }
    },
};
