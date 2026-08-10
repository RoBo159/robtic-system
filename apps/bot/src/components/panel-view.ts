import type { ButtonInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { panelButtonHandler } from "../utils/panels";

export const panelViewHandler: ComponentHandler<ButtonInteraction> = {
    customId: /^panel_view_.+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        await panelButtonHandler(interaction);
    },
};
