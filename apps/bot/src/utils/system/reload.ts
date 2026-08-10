import type { ClientManager } from "@core/client-manager";
import type { ChatInputCommandInteraction } from "discord.js";
import { Logger } from "@logger";

export async function systemReload(interaction: ChatInputCommandInteraction, manager: ClientManager) {
    await interaction.deferReply();

    try {
        await manager.reload();
        await interaction.editReply({
            content: `✅ Reloaded ${manager.getStatus().commands} command(s) and their components.`,
        });
    } catch (error) {
        Logger.error(`Failed to reload modules: ${error}`, "system");
        await interaction.editReply({
            content: "❌ Reload failed. Check logs for details.",
        });
    }
}
