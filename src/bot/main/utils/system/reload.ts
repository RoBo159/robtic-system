import type { ClientManager } from "@core/ClientManager";
import { BOT_DEFINITIONS } from "@core/config";
import type { ChatInputCommandInteraction } from "discord.js";

export async function systemReload(interaction: ChatInputCommandInteraction, manager: ClientManager) {
    const botName = interaction.options.getString("bot", true) as BotName;
    await interaction.deferReply();

    const definition = BOT_DEFINITIONS.find((d) => d.name === botName);
    if (!definition) {
        await interaction.editReply({
           content: `Invalid bot name: **${botName}**.`,
        });
        return;
    }

    try {
        await manager.stopBot(botName);
        await manager.initializeBot(definition);
        await manager.startBot(botName);

        await interaction.editReply({
            content: `✅ Bot **${botName}** has been reloaded successfully.`,
        });
    } catch {
        await interaction.editReply({
            content: `❌ Failed to reload bot **${botName}**. Check logs for details.`,
        });
    }
}