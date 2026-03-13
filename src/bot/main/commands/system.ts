import { ClientManager } from "@core/ClientManager";
import { BOT_DEFINITIONS } from "@core/config";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

const validBotNames = BOT_DEFINITIONS.map((d) => d.name);

export default {
    data: new SlashCommandBuilder()
        .setName("system")
        .setDescription("System management commands")
        .addSubcommand((sub) =>
            sub.setName("status").setDescription("View status of all bots")
        )
        .addSubcommand((sub) =>
            sub
                .setName("enable")
                .setDescription("Enable a bot")
                .addStringOption((opt) =>
                    opt
                        .setName("bot")
                        .setDescription("Bot name to enable")
                        .setRequired(true)
                        .addChoices(
                            ...validBotNames.map((n) => ({ name: n, value: n }))
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("disable")
                .setDescription("Disable a bot")
                .addStringOption((opt) =>
                    opt
                        .setName("bot")
                        .setDescription("Bot name to disable")
                        .setRequired(true)
                        .addChoices(
                            ...validBotNames.filter((n) => n !== "main").map((n) => ({ name: n, value: n }))
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("reload")
                .setDescription("Reload a bot's modules")
                .addStringOption((opt) =>
                    opt
                        .setName("bot")
                        .setDescription("Bot name to reload")
                        .setRequired(true)
                        .addChoices(
                            ...validBotNames.map((n) => ({ name: n, value: n }))
                        )
                )
        ),
    requiredPermission: 100,
    cooldown: 10,
    async run(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();
        const manager = ClientManager.getInstance();

        switch (sub) {
            case "status":
                await import("../utils/system").then((mod) =>
                    mod.systemStatus(interaction, manager)
                );
                break;
            case "enable":
                await import("../utils/system").then((mod) =>
                    mod.enableSystemCommands(interaction, manager)
                );
                break;
            case "disable":
                await import("../utils/system").then((mod) =>
                    mod.disableSystemCommands(interaction, manager)
                );
                break;
            case "reload":
                await import("../utils/system").then((mod) =>
                    mod.systemReload(interaction, manager)
                );
                break;
        }
    }
}