import { MessageFlags, type ButtonInteraction } from "discord.js";
import { PROJECT_BROWSER_MESSAGES } from "@constants";

export default {
    customId: /^dev_panel_config:.+$/,
    async run(interaction: ButtonInteraction) {
        await interaction.reply({
            content: PROJECT_BROWSER_MESSAGES.comingSoon,
            flags: MessageFlags.Ephemeral,
        });
    }
};
