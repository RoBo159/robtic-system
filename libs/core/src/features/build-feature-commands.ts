import type { AutocompleteInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureManifest } from "@typings/feature";
import { buildCommandFromManifest } from "./build-command-from-manifest";

export interface FeatureCommandRunner {
    run: (interaction: CommandInteractionLike, client: BotClient) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction, client: BotClient) => Promise<void>;
}

/** One runner per command name in the manifest. A bare function is shorthand for `{ run }`. */
export type FeatureRunners = Record<
    string,
    FeatureCommandRunner | ((interaction: CommandInteractionLike, client: BotClient) => Promise<void>)
>;

/**
 * Joins a feature's manifest to its handlers, producing the CommandConfigs the loader registers.
 *
 * This is the one place per feature where the duck-typed prefix interaction crosses into typed
 * code: `CommandConfig.run` takes `any` so build-fake-interaction's stand-in can flow through, and
 * everything downstream sees a real ChatInputCommandInteraction.
 *
 * A manifest entry with no runner throws at load time rather than registering a command that
 * silently does nothing when invoked.
 */
export function buildFeatureCommands(manifest: FeatureManifest, runners: FeatureRunners): CommandConfig[] {
    return manifest.commands.map(command => {
        const runner = runners[command.name];
        if (!runner) {
            throw new Error(`Feature "${manifest.key}" declares command "${command.name}" but supplied no runner for it.`);
        }

        const { run, autocomplete } = typeof runner === "function" ? { run: runner, autocomplete: undefined } : runner;

        return {
            data: buildCommandFromManifest(command),
            feature: manifest.key,
            scope: command.scope,
            access: command.access,
            category: command.category,
            cooldown: command.cooldown,
            requiredPermission: command.requiredPermission,
            modalOnly: command.modalOnly,
            run: (interaction, client) => run(interaction as CommandInteractionLike, client),
            ...(autocomplete ? { autocomplete } : {}),
        };
    });
}
