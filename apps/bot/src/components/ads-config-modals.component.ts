import { ModalSubmitInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import type { AdSection } from "@database/models/AdsConfig";
import { buildConfigRoot, buildItemDetail } from "../utils/ads-config-views";
import { refreshAdsPanel } from "../utils/refresh-ads-panel";

export default {
    customId: /^ads-config-(rate-modal$|edit-modal_)/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        if (!interaction.isFromMessage()) return;
        await interaction.deferUpdate();

        const guildId = interaction.guildId!;

        if (interaction.customId === "ads-config-rate-modal") {
            const raw = interaction.fields.getTextInputValue("rate");
            const rate = Number(raw.replace(/,/g, ""));

            if (!Number.isFinite(rate) || rate <= 0) {
                await interaction.followUp({ content: "❌ Exchange rate must be a positive number.", flags: MessageFlags.Ephemeral });
                return;
            }

            const config = await AdsConfigRepository.setExchangeRate(guildId, rate);
            await refreshAdsPanel(client, config);

            await interaction.editReply({ ...buildConfigRoot(config), flags: MessageFlags.IsComponentsV2 });
            return;
        }

        const [, section, key] = interaction.customId.match(/^ads-config-edit-modal_(\w+)_(.+)$/) ?? [];
        const name = interaction.fields.getTextInputValue("name").trim();
        const priceRaw = interaction.fields.getTextInputValue("priceUsd");
        const priceUsd = Number(priceRaw.replace(/[$,]/g, ""));
        const details = interaction.fields.getTextInputValue("details")?.trim();

        if (!Number.isFinite(priceUsd) || priceUsd < 0) {
            await interaction.followUp({ content: "❌ Price must be a non-negative number.", flags: MessageFlags.Ephemeral });
            return;
        }

        const config = await AdsConfigRepository.upsertItem(guildId, section as AdSection, {
            key,
            name,
            priceUsd,
            details: details || undefined,
        });
        await refreshAdsPanel(client, config);

        const item = AdsConfigRepository.findItem(config, section as AdSection, key)!;
        await interaction.editReply({
            ...buildItemDetail(section as AdSection, item, config.exchangeRate),
            flags: MessageFlags.IsComponentsV2,
        });
    },
};
