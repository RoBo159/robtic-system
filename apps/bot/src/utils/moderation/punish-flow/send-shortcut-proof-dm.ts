import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { PunishType } from "@typings/punishment";
import { COLORS, PUNISH_TITLES, PUNISH_PROOF_MESSAGES, PUNISH_EXTRA_NONE } from "@constants";
import { shortcutButtonCustomId } from "./shortcut-custom-id";

/** A fake prefix interaction can't showModal() — DM a real button instead, which can (see punish-shortcut-dm.ts). */
export async function sendShortcutProofDM(
    client: BotClient,
    moderatorId: string,
    type: PunishType,
    guildId: string,
    targetId: string,
    reasonKey: string,
    extra = PUNISH_EXTRA_NONE,
): Promise<boolean> {
    const moderator = await client.users.fetch(moderatorId).catch(() => null);
    if (!moderator) return false;

    const embed = new EmbedBuilder()
        .setTitle(PUNISH_PROOF_MESSAGES.modalTitle(PUNISH_TITLES[type]))
        .setColor(COLORS.warning)
        .setDescription(PUNISH_PROOF_MESSAGES.dmDescription(type, targetId))
        .setTimestamp();

    const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(shortcutButtonCustomId(type, guildId, targetId, reasonKey, moderatorId, extra))
            .setLabel(PUNISH_PROOF_MESSAGES.dmButtonLabel)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(PUNISH_PROOF_MESSAGES.dmButtonEmoji),
    );

    const sent = await moderator.send({ embeds: [embed], components: [button] }).catch(() => null);
    return Boolean(sent);
}
