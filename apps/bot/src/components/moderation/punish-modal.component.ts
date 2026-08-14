import {
    ModalSubmitInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS } from "@constants";
import { ReasonRepository } from "@database/repositories";
import { getMemberLevel } from "@bot/utils/access";
import { executeWarn } from "@bot/commands/guild/admin/moderation/warn.command";
import { executeMute } from "@bot/commands/guild/admin/moderation/mute.command";
import { executeBan } from "@bot/commands/guild/admin/moderation/jail.command";
import { requestApproval, postProof, getOptionalUploadedFileUrl, getOptionalText } from "../../utils/moderation/punish-flow";

export const punishModalHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^punish_modal_(warn|mute|ban)_(\d+)$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        const parts = interaction.customId.match(/^punish_modal_(warn|mute|ban)_(\d+)$/);
        if (!parts) return;

        const type = parts[1] as "warn" | "mute" | "ban";
        const targetId = parts[2];
        const guildId = interaction.guildId!;
        const modMember = interaction.member as GuildMember;

        await interaction.deferReply();

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        const targetMember = await interaction.guild?.members.fetch(targetId).catch(() => null);

        if (!targetUser) {
            await interaction.deleteReply().catch(() => {});
            await interaction.followUp({ content: "User not found.", flags: MessageFlags.Ephemeral });
            return;
        }

        const reasonRaw = getOptionalText(interaction.fields, "reason").trim();
        // Since modals can't do autocomplete, we'll try to find a reason key
        // If not found, we use the raw text as both key and label.
        let reason = reasonRaw;
        let reasonAr = reasonRaw;
        let reasonKey = reasonRaw;

        const reasonDoc = await ReasonRepository.findByKey(reasonRaw.toLowerCase());
        if (reasonDoc) {
            reasonKey = reasonDoc.key;
            reason = reasonDoc.label;
            reasonAr = reasonDoc.labelAr;
        }

        // Only present when the context-menu command included the proof file-upload label
        // (banContext.ts/muteContext.ts/warnContext.ts add it for below-Manager+ moderators).
        const proofUrl = getOptionalUploadedFileUrl(interaction.fields, "proof");
        const proofNote = getOptionalText(interaction.fields, "note");
        if (proofUrl) {
            await postProof(client, guildId, { type, targetId, moderatorId: interaction.user.id, note: proofNote, attachmentUrl: proofUrl });
        }

        const modLevel = await getMemberLevel(modMember);
        const needsApproval = modLevel.score <= 20;

        if (type === "warn") {
            if (needsApproval) {
                await requestApproval({
                    client, type: "warn", targetId, reasonKey, reasonLabel: reason,
                    requesterId: interaction.user.id, proofUrl: proofUrl ?? undefined,
                });

                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({
                    embeds: [new EmbedBuilder().setDescription("⏳ Your warning request has been sent for approval.").setColor(COLORS.info)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await executeWarn(client, guildId, targetId, targetUser.username, reason, reasonAr, interaction.user.id, targetMember);
            await interaction.editReply({ embeds: [result.embed] });
        } else if (type === "mute") {
            let durationHours = 24;
            const durationInput = getOptionalText(interaction.fields, "duration");
            if (durationInput && !isNaN(Number(durationInput))) {
                durationHours = Number(durationInput);
            }
            const durationMs = durationHours * 60 * 60 * 1000;

            if (needsApproval) {
                await requestApproval({
                    client, type: "mute", targetId, reasonKey, reasonLabel: reason,
                    requesterId: interaction.user.id, extra: String(durationHours), proofUrl: proofUrl ?? undefined,
                });

                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({
                    embeds: [new EmbedBuilder().setDescription("⏳ Your mute request has been sent for approval.").setColor(COLORS.info)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await executeMute(client, guildId, targetId, targetUser.username, reason, reasonAr, interaction.user.id, targetMember, durationMs, interaction.guild!);
            await interaction.editReply({ embeds: [result.embed] });
        } else if (type === "ban") {
            const durationInput = getOptionalText(interaction.fields, "duration").toLowerCase() || "perm";
            const permanent = durationInput === "perm";
            let durationDays = 0;
            if (!permanent && !isNaN(Number(durationInput))) {
                durationDays = Number(durationInput);
            }

            if (needsApproval) {
                await requestApproval({
                    client, type: "ban", targetId, reasonKey, reasonLabel: reason,
                    requesterId: interaction.user.id, extra: permanent ? "perm" : String(durationDays), proofUrl: proofUrl ?? undefined,
                });

                await interaction.deleteReply().catch(() => {});
                await interaction.followUp({
                    embeds: [new EmbedBuilder().setDescription("⏳ Your ban request has been sent for approval.").setColor(COLORS.info)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await executeBan(client, guildId, targetId, targetUser.username, reason, reasonAr, interaction.user.id, targetMember, permanent, durationDays, interaction.guild!);
            await interaction.editReply({ embeds: [result.embed] });
        }
    }
};
