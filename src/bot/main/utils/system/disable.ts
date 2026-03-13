import type { ClientManager } from "@core/ClientManager";
import type { ChatInputCommandInteraction } from "discord.js";

export async function disableSystemCommands(interaction: ChatInputCommandInteraction, manager: ClientManager) {
    const botName = interaction.options.getString("bot", true) as BotName;

    if (botName === "main") {
        await interaction.reply({
            content: "❌ The main bot cannot be disabled.",
        });
        return;
    }

    await interaction.deferReply();
    await manager.stopBot(botName);

    await interaction.editReply({
        content: `✅ Bot **${botName}** has been disabled.`,
    });
}