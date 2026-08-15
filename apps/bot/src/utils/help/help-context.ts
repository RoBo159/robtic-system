import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import { DEFAULT_PREFIX } from "@constants";
import { ServerConfigRepository, SuperUserRepository } from "@database/repositories";
import { listFeatureManifests, isFeatureEnabled } from "@core/features";
import { isChatInputCommand } from "./command-usage";

export interface HelpContext {
    prefix: string;
    guildId: string | null;
    /** Admin-scoped commands are only listed for people who can actually run them. */
    isSuperUser: boolean;
    /** Feature key → whether it is switched on in this guild. */
    featureState: Map<string, boolean>;
}

/**
 * Everything the help views need about *this* viewer in *this* guild.
 *
 * Resolved once per invocation and threaded through, rather than re-read by each builder: the
 * dropdown redraws on every selection, and re-querying the prefix and every feature's state on
 * each redraw would turn browsing help into a stream of database round trips.
 */
export async function buildHelpContext(client: BotClient, guildId: string | null, userId: string): Promise<HelpContext> {
    const [prefix, isSuperUser] = await Promise.all([
        guildId ? ServerConfigRepository.getPrefix(guildId) : Promise.resolve(null),
        SuperUserRepository.isWhitelisted(userId),
    ]);

    const featureState = new Map<string, boolean>();
    if (guildId) {
        for (const manifest of listFeatureManifests()) {
            featureState.set(manifest.key, await isFeatureEnabled(guildId, manifest.key));
        }
    }

    return { prefix: prefix ?? DEFAULT_PREFIX, guildId, isSuperUser, featureState };
}

/** True when this command's owning feature is switched off here. */
export function isFromDisabledFeature(command: CommandConfig, context: HelpContext): boolean {
    if (!command.feature) return false;
    return context.featureState.get(command.feature) === false;
}

/**
 * The commands worth showing this viewer.
 *
 * Context-menu entries are dropped because they have no typed form to document, and admin-scoped
 * commands are hidden from everyone who cannot run them — they are registered only to the admin
 * guild, so listing them elsewhere advertises commands that do not exist for the reader.
 *
 * Commands from a disabled feature are kept, and marked. Hiding them would leave an admin no way to
 * discover what turning the feature on would give them.
 */
export function visibleCommands(client: BotClient, context: HelpContext): CommandConfig[] {
    return [...client.commands.values()].filter(command => {
        if (!isChatInputCommand(command)) return false;
        if (command.scope === "admin" && !context.isSuperUser) return false;
        return true;
    });
}
