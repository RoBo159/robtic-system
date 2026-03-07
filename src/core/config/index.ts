import type {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
} from "discord.js";
import type { BotClient } from "@core/BotClient";

interface CommandConfig {
    data:
        | SlashCommandBuilder
        | SlashCommandSubcommandsOnlyBuilder
        | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
    requiredPermission?: PermissionLevel;
    cooldown?: number;
    run: (interaction: ChatInputCommandInteraction, client: BotClient) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction, client: BotClient) => Promise<void>;
}

interface ComponentHandler {
    customId: string | RegExp;
    run: (
        interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
        client: BotClient
    ) => Promise<void>;
}

export * from "./clients";
export * from "./constants";
export type { ComponentHandler, CommandConfig};