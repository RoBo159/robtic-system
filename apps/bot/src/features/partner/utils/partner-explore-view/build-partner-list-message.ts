import {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    type BaseMessageOptions,
} from "discord.js";
import type { IPartner } from "@database/models/Partner";
import { COLORS, PARTNER_MESSAGES, SELECT_MENU_MAX_OPTIONS, SELECT_MENU_LABEL_MAX_LENGTH } from "@constants";

export function buildPartnerListMessage(partners: IPartner[]): BaseMessageOptions {
    const embed = new EmbedBuilder()
        .setTitle(PARTNER_MESSAGES.listTitle)
        .setDescription(
            partners.length > 0
                ? PARTNER_MESSAGES.listDescription
                : PARTNER_MESSAGES.emptyDescription
        )
        .setColor(COLORS.info);

    if (partners.length === 0) {
        return { embeds: [embed], components: [] };
    }

    const select = new StringSelectMenuBuilder()
        .setCustomId("partner_explore_select")
        .setPlaceholder(PARTNER_MESSAGES.selectPlaceholder)
        .addOptions(
            partners.slice(0, SELECT_MENU_MAX_OPTIONS).map((p) => ({
                label: p.partnerServerName.slice(0, SELECT_MENU_LABEL_MAX_LENGTH),
                value: p.partnerServerId,
                description: p.description.slice(0, SELECT_MENU_LABEL_MAX_LENGTH),
            }))
        );

    return {
        embeds: [embed],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    };
}
