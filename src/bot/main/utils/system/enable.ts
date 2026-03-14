import type { ClientManager } from "@core/ClientManager";
import { BOT_DEFINITIONS } from "@core/config";
import type { ChatInputCommandInteraction } from "discord.js";

export async function enableSystemCommands(interaction: ChatInputCommandInteraction, manager: ClientManager) {
    const botName = interaction.options.getString("bot", true) as BotName;
    await interaction.deferReply();

    const existing = manager.getClient(botName);
    if (existing?.isReady()) {
        await interaction.editReply({
            content: `Bot **${botName}** is already online.`,
        });
        return;
    }

    const definition = BOT_DEFINITIONS.find((d) => d.name === botName);
    if (!definition) {
        await interaction.editReply({
            content: `Invalid bot name: **${botName}**.`,
        });
        return;
    }

    try {
        await manager.initializeBot(definition);
        await manager.startBot(botName);
        await interaction.editReply({
            content: `✅ Bot **${botName}** has been enabled.`,
        });
    } catch {
        await interaction.editReply({
            content: `❌ Failed to enable bot **${botName}**.`,
        });
    }
}