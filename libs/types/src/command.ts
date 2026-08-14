import type {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    ContextMenuCommandBuilder,
    AutocompleteInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    RoleSelectMenuInteraction,
    ChannelSelectMenuInteraction,
    UserSelectMenuInteraction,
    MentionableSelectMenuInteraction,
    ModalSubmitInteraction,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandScope, GuildAccessLevel } from "@constants/command-scopes";

export interface CommandConfig {
    data:
        | SlashCommandBuilder
        | SlashCommandSubcommandsOnlyBuilder
        | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
        | ContextMenuCommandBuilder;
    /** Where this command's data lives. Omitted means `guild`. `admin` also changes the registration route. */
    scope?: CommandScope;
    /** Only meaningful for `guild` scope. Omitted means `general`, which gates nothing. */
    access?: GuildAccessLevel;
    requiredPermission?: number;
    cooldown?: number;
    /** Grouping label shown in the `!help` category dropdown (e.g. "Streak", "Moderation"). Uncategorized commands fall under "General". */
    category?: string;
    /** Opens a modal as its primary flow — can't be driven by a prefix text command, so the prefix router skips it. */
    modalOnly?: boolean;
    /** Key of the feature that owns this command. Set by the feature dispatcher; drives the per-guild activation gate. */
    feature?: string;
    run: (interaction: any, client: BotClient) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction, client: BotClient) => Promise<void>;
}

export type ComponentInteraction =
    | ButtonInteraction
    | StringSelectMenuInteraction
    | RoleSelectMenuInteraction
    | ChannelSelectMenuInteraction
    | UserSelectMenuInteraction
    | MentionableSelectMenuInteraction
    | ModalSubmitInteraction;

export interface ComponentHandler<T extends ComponentInteraction = ComponentInteraction> {
    customId: string | RegExp;
    /** Key of the feature that owns this handler, so a disabled feature's buttons say so rather than acting. */
    feature?: string;
    run: (
        interaction: T,
        client: BotClient
    ) => Promise<void>;
}
