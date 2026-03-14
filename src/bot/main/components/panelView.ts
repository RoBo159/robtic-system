import type { ButtonInteraction } from "discord.js";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { panelButtonHandler } from "../utils/panels";

export const panelViewHandler: ComponentHandler<ButtonInteraction> = {
    customId: /^panel_view_.+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        await panelButtonHandler(interaction);
    },
};
