import type {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    ContextMenuCommandBuilder,
    AutocompleteInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    RoleSelectMenuInteraction,
    ModalSubmitInteraction,
} from "discord.js";
import type { BotClient } from "@core/bot-client";

export interface CommandConfig {
    data:
        | SlashCommandBuilder
        | SlashCommandSubcommandsOnlyBuilder
        | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
        | ContextMenuCommandBuilder;
    requiredPermission?: number;
    cooldown?: number;
    /** Grouping label shown in the `!help` category dropdown (e.g. "Streak", "Moderation"). Uncategorized commands fall under "General". */
    category?: string;
    /** Opens a modal as its primary flow — can't be driven by a prefix text command, so the prefix router skips it. */
    modalOnly?: boolean;
    run: (interaction: any, client: BotClient) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction, client: BotClient) => Promise<void>;
}

export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | RoleSelectMenuInteraction | ModalSubmitInteraction;

export interface ComponentHandler<T extends ComponentInteraction = ComponentInteraction> {
    customId: string | RegExp;
    run: (
        interaction: T,
        client: BotClient
    ) => Promise<void>;
}
