import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { Shortcut } from "@database/models";
import { isValidCommandPath } from "@bot/utils/prefix";
import { CHAT_UTIL_COMMANDS } from "./run-chat-util";

const CTX = "shortcuts";

/** A target is reachable if it is a channel utility or a runnable command path. */
export function isReachableTarget(client: BotClient, target: string): boolean {
    return CHAT_UTIL_COMMANDS.has(target) || isValidCommandPath(client, target);
}

/**
 * Reports shortcuts pointing at commands that no longer exist.
 *
 * A shortcut whose target is missing simply does nothing when typed, with no error and no log, so
 * nobody finds out until someone asks why their trigger stopped working. Boot is the one moment
 * the full command list and every stored row are both available.
 *
 * Reports rather than deletes: a missing target can just as easily mean a feature is switched off
 * as that the command is gone for good.
 */
export async function reportOrphanShortcuts(client: BotClient): Promise<void> {
    const shortcuts = await Shortcut.find().catch(() => null);
    if (!shortcuts?.length) return;

    const orphans = shortcuts.filter(s => !isReachableTarget(client, s.command));
    if (!orphans.length) return;

    for (const orphan of orphans) {
        Logger.warn(`Guild ${orphan.guildId}: "${orphan.trigger}" points at "${orphan.command}", which no longer exists`, CTX);
    }

    Logger.warn(
        `${orphans.length} shortcut(s) name a missing command. Bare subcommand names such as "warn" ` +
        `never worked and now need the full path — re-add them as "warn add".`,
        CTX,
    );
}
