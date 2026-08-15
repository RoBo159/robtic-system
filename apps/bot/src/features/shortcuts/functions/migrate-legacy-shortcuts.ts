import { ServerConfig, Shortcut } from "@database/models";
import { Logger } from "@logger";
import { isShortcutDeleteMode } from "@constants";

const CTX = "shortcuts";

/**
 * Moves shortcuts off the embedded ServerConfig array into their own collection.
 *
 * Runs on every boot but only copies rows the new collection does not already have, so it is
 * idempotent and costs one query per guild that still has legacy entries. The old array is left
 * in place rather than cleared — if this migration is ever wrong, the original data is still
 * there to look at.
 */
export async function migrateLegacyShortcuts(): Promise<void> {
    const configs = await ServerConfig.find({ "shortcuts.0": { $exists: true } }).catch(() => null);
    if (!configs?.length) return;

    let migrated = 0;

    for (const config of configs) {
        for (const legacy of config.shortcuts) {
            const trigger = legacy.trigger?.trim().toLowerCase();
            if (!trigger || !legacy.command) continue;

            const exists = await Shortcut.exists({ guildId: config.guildId, trigger });
            if (exists) continue;

            await Shortcut.create({
                guildId: config.guildId,
                trigger,
                command: legacy.command,
                deleteMode: isShortcutDeleteMode(legacy.deleteMode ?? "") ? legacy.deleteMode : "none",
            }).catch(err => Logger.warn(`Could not migrate shortcut "${trigger}" in ${config.guildId}: ${err}`, CTX));

            migrated++;
        }
    }

    if (migrated) Logger.info(`Migrated ${migrated} shortcut(s) into the shortcuts collection`, CTX);
}
