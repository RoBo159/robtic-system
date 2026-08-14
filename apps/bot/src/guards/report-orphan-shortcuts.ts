import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { ServerConfig } from "@database/models";

const CTX = "shortcut-audit";

/**
 * Reports `/shortcut` rows pointing at commands that no longer exist.
 *
 * `runCustomCommandShortcut` resolves a trigger through `client.commands.get(row.command)` and
 * simply does nothing when that misses, so a deleted or renamed command leaves triggers that fail
 * silently — nobody finds out until a member types one and gets no reply. Boot is the only moment
 * the full command list and the full set of stored rows are both in hand.
 *
 * Reporting only: an orphan may equally mean a feature is temporarily disabled, and deleting a
 * guild's configuration on that guess would be far worse than logging it.
 */
export async function reportOrphanShortcuts(client: BotClient): Promise<void> {
    const configs = await ServerConfig.find({ "shortcuts.0": { $exists: true } }).catch(() => null);
    if (!configs?.length) return;

    let orphans = 0;

    for (const config of configs) {
        const missing = config.shortcuts.filter(shortcut => !client.commands.has(shortcut.command));
        if (!missing.length) continue;

        orphans += missing.length;
        const detail = missing.map(s => `${s.trigger} → ${s.command}`).join(", ");
        Logger.warn(`Guild ${config.guildId} has ${missing.length} shortcut(s) naming a command that no longer exists: ${detail}`, CTX);
    }

    if (orphans) {
        Logger.warn(`${orphans} orphaned shortcut(s) in total — remove them with /shortcut remove, or re-add the command.`, CTX);
    }
}
