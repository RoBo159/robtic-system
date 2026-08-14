import {
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    StringSelectMenuBuilder,
    type BaseMessageOptions,
} from "discord.js";
import type { AdSection, IAdItem, IAdsConfig } from "@database/models/AdsConfig";
import { AdsConfigRepository } from "@database/repositories";
import { formatPrice } from "./pricing";

const SECTION_LABELS: Record<AdSection, string> = {
    standardAds: "Standard Ad",
    giveaway: "Giveaway",
    packages: "Package",
    addons: "Add-on",
};

export function buildConfigRoot(config: IAdsConfig): BaseMessageOptions {
    const all = AdsConfigRepository.allItems(config);

    const container = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(td => td.setContent("## ⚙️ Ads Configuration"))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent(
                `**Exchange rate:** 1 USD = ${config.exchangeRate.toLocaleString()} Credits\n` +
                `**Approval channel:** ${config.approvalChannelId ? `<#${config.approvalChannelId}>` : "*Not set — use `/setup-ads channel`*"}\n\n` +
                "Pick an item below to view and edit its price/details."
            )
        );

    if (all.length) {
        container.addActionRowComponents(row =>
            row.setComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("ads-config-select-item")
                    .setPlaceholder("Select an item to edit")
                    .addOptions(
                        all.slice(0, 25).map(({ section, item }) => ({
                            label: item.name.slice(0, 100),
                            value: `${section}:${item.key}`,
                            description: `[${SECTION_LABELS[section]}] ${formatPrice(item.priceUsd, config.exchangeRate)}`.slice(0, 100),
                        }))
                    )
            )
        );
    }

    container.addActionRowComponents(row =>
        row.setComponents(
            new ButtonBuilder().setCustomId("ads-config-rate").setLabel("💱 Edit Exchange Rate").setStyle(ButtonStyle.Secondary)
        )
    );

    return { components: [container] };
}

export function buildItemDetail(section: AdSection, item: IAdItem, rate: number): BaseMessageOptions {
    const container = new ContainerBuilder()
        .setAccentColor(0x3498db)
        .addTextDisplayComponents(td => td.setContent(`## ${item.name}`))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent(
                `**Section:** ${SECTION_LABELS[section]}\n` +
                `**Price:** ${formatPrice(item.priceUsd, rate)}\n\n` +
                (item.details ? item.details : "*No details set.*")
            )
        )
        .addActionRowComponents(row =>
            row.setComponents(
                new ButtonBuilder().setCustomId(`ads-config-edit_${section}_${item.key}`).setLabel("✏️ Edit").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("ads-config-back").setLabel("⬅ Back").setStyle(ButtonStyle.Secondary)
            )
        );

    return { components: [container] };
}
