import { EmbedBuilder, type TextChannel } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { PunishType } from "@typings/punishment";
import { COLORS, PUNISH_TITLES, PUNISH_PROOF_MESSAGES } from "@constants";
import { PunishConfigRepository } from "@database/repositories";

interface ProofParams {
    type: PunishType;
    targetId: string;
    moderatorId: string;
    note: string;
    attachmentUrl: string;
}

/** Posts evidence to the configured proof channel — separate from punishments_notice. Silently no-ops if unset, matching getLogChannel's convention. */
export async function postProof(client: BotClient, guildId: string, params: ProofParams): Promise<void> {
    const config = await PunishConfigRepository.getCached(guildId);
    if (!config.proofChannelId) return;

    const channel = client.channels.cache.get(config.proofChannelId) as TextChannel | undefined;
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(PUNISH_PROOF_MESSAGES.submittedTitle(PUNISH_TITLES[params.type]))
        .setColor(COLORS.info)
        .addFields(
            { name: PUNISH_PROOF_MESSAGES.targetFieldName, value: `<@${params.targetId}>`, inline: true },
            { name: PUNISH_PROOF_MESSAGES.moderatorFieldName, value: `<@${params.moderatorId}>`, inline: true },
        )
        .setImage(params.attachmentUrl)
        .setTimestamp();

    if (params.note) embed.addFields({ name: PUNISH_PROOF_MESSAGES.noteFieldName, value: params.note });

    await channel.send({ embeds: [embed] }).catch(() => null);
}
