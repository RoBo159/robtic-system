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
        | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
        | import("discord.js").ContextMenuCommandBuilder;
    requiredPermission?: number;
    department?: Department;
    cooldown?: number;
    run: (interaction: any, client: BotClient) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction, client: BotClient) => Promise<void>;
}

type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

interface ComponentHandler<T extends ComponentInteraction = ComponentInteraction> {
    customId: string | RegExp;
    run: (
        interaction: T,
        client: BotClient
    ) => Promise<void>;
}

export * from "./clients";
export * from "./constants";
export * from "./aiConfig";
export type { ComponentHandler, CommandConfig};