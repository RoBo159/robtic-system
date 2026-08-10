import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { PunishType } from "@typings/punishment";
import { COLORS, PUNISH_TITLES, PUNISH_APPROVAL_MESSAGES, PUNISH_EXTRA_NONE } from "@constants";
import { getLogChannel } from "@bot/utils/server-log";

interface ApprovalParams {
    client: BotClient;
    type: PunishType;
    targetId: string;
    reasonKey: string;
    reasonLabel: string;
    requesterId: string;
    extra?: string;
    proofUrl?: string;
}

/** Shared senior-approval request (score <= 20 band), posted to punishments_case with the approve/deny buttons. */
export async function requestApproval(params: ApprovalParams): Promise<void> {
    const { client, type, targetId, reasonKey, reasonLabel, requesterId, extra, proofUrl } = params;

    const embed = new EmbedBuilder()
        .setTitle(PUNISH_APPROVAL_MESSAGES.title(PUNISH_TITLES[type]))
        .setColor(type === "warn" ? COLORS.warning : COLORS.moderation)
        .addFields(
            { name: PUNISH_APPROVAL_MESSAGES.targetFieldName, value: `<@${targetId}>`, inline: true },
            { name: PUNISH_APPROVAL_MESSAGES.requestedByFieldName, value: `<@${requesterId}>`, inline: true },
            { name: PUNISH_APPROVAL_MESSAGES.reasonFieldName, value: reasonLabel },
        )
        .setTimestamp();

    if (extra && extra !== PUNISH_EXTRA_NONE) {
        if (type === "mute") {
            embed.addFields({ name: PUNISH_APPROVAL_MESSAGES.durationFieldName, value: PUNISH_APPROVAL_MESSAGES.durationValue(extra), inline: true });
        }
        if (type === "ban") {
            embed.addFields({
                name: PUNISH_APPROVAL_MESSAGES.typeFieldName,
                value: extra === "perm" ? PUNISH_APPROVAL_MESSAGES.permanentBanValue : PUNISH_APPROVAL_MESSAGES.tempBanValue(extra),
                inline: true,
            });
        }
    }

    if (proofUrl) embed.setImage(proofUrl);

    const customIdExtra = extra && extra !== PUNISH_EXTRA_NONE ? `_${extra}` : "";
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`punish_approve_${type}_${targetId}_${reasonKey}_${requesterId}${customIdExtra}`)
            .setLabel(PUNISH_APPROVAL_MESSAGES.approveLabel)
            .setStyle(ButtonStyle.Success)
            .setEmoji(PUNISH_APPROVAL_MESSAGES.approveEmoji),
        new ButtonBuilder()
            .setCustomId(`punish_deny_${type}_${targetId}_${reasonKey}_${requesterId}`)
            .setLabel(PUNISH_APPROVAL_MESSAGES.denyLabel)
            .setStyle(ButtonStyle.Danger)
            .setEmoji(PUNISH_APPROVAL_MESSAGES.denyEmoji),
    );

    const approvalChannel = await getLogChannel(client, "punishments_case") as TextChannel | null;
    if (approvalChannel) {
        await approvalChannel.send({ embeds: [embed], components: [buttons] });
    }
}
