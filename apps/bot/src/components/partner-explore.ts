import { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { PartnerRepository } from "@database/repositories";
import { buildPartnerDetailMessage, buildPartnerListMessage } from "../utils/partner-explore-view";

export const partnerExploreSelect: ComponentHandler<StringSelectMenuInteraction> = {
    customId: "partner_explore_select",

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        await interaction.deferUpdate();

        const partnerServerId = interaction.values[0];
        const partner = await PartnerRepository.findByServerId(partnerServerId);

        if (!partner) {
            await interaction.editReply({ content: "This partner no longer exists.", embeds: [], components: [] });
            return;
        }

        await interaction.editReply(buildPartnerDetailMessage(partner));
    },
};

export const partnerExploreBack: ComponentHandler<ButtonInteraction> = {
    customId: "partner_explore_back",

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferUpdate();

        const partners = await PartnerRepository.getAll();
        await interaction.editReply({ content: "", ...buildPartnerListMessage(partners) });
    },
};
