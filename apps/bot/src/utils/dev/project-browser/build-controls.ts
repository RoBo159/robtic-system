import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { PROJECT_BROWSER_MESSAGES } from "@constants";

export function buildControls(hasPrev: boolean, hasNext: boolean) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    if (hasPrev) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId("dev_projects_prev")
                .setLabel(PROJECT_BROWSER_MESSAGES.previousButtonLabel)
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (hasNext) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId("dev_projects_next")
                .setLabel(PROJECT_BROWSER_MESSAGES.nextButtonLabel)
                .setStyle(ButtonStyle.Secondary)
        );
    }

    return row.components.length ? row : null;
}
