import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type BaseMessageOptions,
} from "discord.js";
import type { IPartner } from "@database/models/Partner";
import { COLORS, PARTNER_MESSAGES } from "@constants";

export function buildPartnerDetailMessage(partner: IPartner): BaseMessageOptions {
    const embed = new EmbedBuilder()
        .setTitle(PARTNER_MESSAGES.detailTitle(partner.partnerServerName))
        .setDescription(partner.description)
        .setColor(COLORS.info);

    const row = new ActionRowBuilder<ButtonBuilder>();

    if (partner.inviteLink) {
        row.addComponents(
            new ButtonBuilder().setLabel(PARTNER_MESSAGES.joinButtonLabel).setStyle(ButtonStyle.Link).setURL(partner.inviteLink)
        );
    }

    row.addComponents(
        new ButtonBuilder().setCustomId("partner_explore_back").setLabel(PARTNER_MESSAGES.backButtonLabel).setStyle(ButtonStyle.Secondary)
    );

    return {
        embeds: [embed],
        components: [row],
    };
}
