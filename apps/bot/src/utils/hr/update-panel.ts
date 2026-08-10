import {
    ActionRowBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ISubmitConfig } from "@database/models/SubmitConfig";
import { COLORS, APPLY_PANEL_MESSAGES } from "@constants";
import { SubmissionTypeRepository } from "@database/repositories";

export async function updatePanel(client: BotClient, config: ISubmitConfig): Promise<void> {
    if (!config.panelChannelId || !config.panelMessageId) return;

    const channel = client.channels.cache.get(config.panelChannelId) as TextChannel | undefined;
    if (!channel) return;

    const message = await channel.messages.fetch(config.panelMessageId).catch(() => null);
    if (!message) return;

    const allTypes = await SubmissionTypeRepository.list(config.guildId);
    const openTypes = allTypes.filter(t => t.isOpen);

    const embed = new EmbedBuilder()
        .setTitle(APPLY_PANEL_MESSAGES.title)
        .setTimestamp();

    if (!openTypes.length) {
        embed
            .setDescription(APPLY_PANEL_MESSAGES.closedDescription)
            .setColor(COLORS.error);

        await message.edit({ embeds: [embed], components: [] });
        return;
    }

    embed
        .setDescription(APPLY_PANEL_MESSAGES.openDescription)
        .setColor(COLORS.success)
        .addFields(
            openTypes.map(t => ({
                name: APPLY_PANEL_MESSAGES.typeFieldName(t.name),
                value: APPLY_PANEL_MESSAGES.typeFieldValue,
                inline: true,
            }))
        );

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("staff-apply-select")
        .setPlaceholder(APPLY_PANEL_MESSAGES.selectPlaceholder)
        .addOptions(
            openTypes.map(t => ({
                label: t.name,
                value: t.key,
                emoji: APPLY_PANEL_MESSAGES.typeEmoji,
            }))
        );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    await message.edit({ embeds: [embed], components: [row] });
}
