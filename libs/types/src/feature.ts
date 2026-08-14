import type { ApplicationCommandOptionAllowedChannelTypes, ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandScope, GuildAccessLevel } from "@constants/command-scopes";
import type { ComponentHandler } from "./command";

/**
 * Option types a feature may declare.
 *
 * Deliberately narrower than Discord's full set: every entry here must be reproducible on a
 * SlashCommandBuilder *and* parseable from text by utils/prefix/resolve-option-value.ts, because a
 * feature command is always reachable both ways. Mentionable and attachment options are absent for
 * exactly that reason — the prefix path cannot resolve them.
 */
export type FeatureOptionType =
    | "string"
    | "integer"
    | "number"
    | "boolean"
    | "user"
    | "channel"
    | "role";

export interface FeatureOption {
    name: string;
    description: string;
    type: FeatureOptionType;
    required?: boolean;
    choices?: readonly { name: string; value: string | number }[];
    minValue?: number;
    maxValue?: number;
    channelTypes?: readonly ApplicationCommandOptionAllowedChannelTypes[];
    autocomplete?: boolean;
}

export interface FeatureSubcommand {
    name: string;
    description: string;
    /** In declaration order — the prefix parser consumes positional arguments in this same order. */
    options?: readonly FeatureOption[];
}

export interface FeatureSubcommandGroup {
    name: string;
    description: string;
    subcommands: readonly FeatureSubcommand[];
}

export interface FeatureCommand {
    name: string;
    description: string;
    scope?: CommandScope;
    access?: GuildAccessLevel;
    category?: string;
    cooldown?: number;
    requiredPermission?: number;
    modalOnly?: boolean;
    /** Mutually exclusive with subcommands/groups, exactly as Discord requires. */
    options?: readonly FeatureOption[];
    subcommands?: readonly FeatureSubcommand[];
    groups?: readonly FeatureSubcommandGroup[];
}

/**
 * Whether a guild has to turn the feature on before it does anything.
 *
 * - `opt-in`     — off until `/feature enable <key>`.
 * - `default-on` — live the moment the bot joins; per-feature channel lists narrow it afterwards.
 */
export type FeatureActivation = "opt-in" | "default-on";

/**
 * A feature's declarative surface: no discord.js, no runtime logic, so the loader, the help builder
 * and docs tooling can all read it without pulling in handlers.
 */
export interface FeatureManifest {
    /** Folder name, customId namespace and log label. */
    key: string;
    /** Shown by `/feature list`. */
    description: string;
    activation: FeatureActivation;
    commands: readonly FeatureCommand[];
    /** Gateway event names the feature owns. Documentation, plus a load-time cross-check against its *.event.ts. */
    events?: readonly string[];
    /** customId namespaces the feature owns. */
    components?: readonly string[];
}

/** Identity helper that pins literal types for editor completion. */
export function defineFeature<const T extends FeatureManifest>(manifest: T): T {
    return manifest;
}

/**
 * A real ChatInputCommandInteraction, or the duck-typed stand-in from
 * utils/prefix/build-fake-interaction.ts. Handlers may only use members both provide — notably not
 * `showModal()`, `deferUpdate()`, `locale`, `memberPermissions`, or the mentionable/attachment
 * option getters. Anything needing a modal must set `modalOnly` on its FeatureCommand.
 */
export type CommandInteractionLike = ChatInputCommandInteraction;

/** One leaf subcommand's implementation — one per file in a feature's commands/ folder. */
export type FeatureSubcommandHandler = (
    interaction: CommandInteractionLike,
    client: BotClient,
) => Promise<void>;

/** What a feature's `<key>.component.ts` default-exports. */
export interface FeatureComponentIndex {
    /** Shared customId prefix for every handler below, e.g. "coins" for `coins:adjust:…`. */
    namespace: string;
    handlers: readonly ComponentHandler[];
}
