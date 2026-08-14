import type { Client } from "discord.js";
import { SavedRoles } from "@database/models";
import { RejoinRolesConfigRepository } from "@database/repositories";
import { Logger } from "@logger";
import { isFeatureEnabled } from "@core/features";

const CTX = "rejoin-roles";
const HOUR_MS = 60 * 60 * 1000;

/**
 * Deletes snapshots past their guild's retention window.
 *
 * Restore already ignores an expired snapshot, so this is about not keeping a record of who held
 * what long after it can be used — the guild set a retention window, and the data should not
 * outlive it just because nobody happened to rejoin.
 *
 * Per guild, because the window is per guild.
 */
export async function purgeExpiredSavedRoles(client: Client): Promise<void> {
    for (const [, guild] of client.guilds.cache) {
        if (!(await isFeatureEnabled(guild.id, "rejoin-roles"))) continue;

        const config = await RejoinRolesConfigRepository.getCached(guild.id);
        const cutoff = new Date(Date.now() - config.retentionHours * HOUR_MS);

        const result = await SavedRoles.deleteMany({ guildId: guild.id, leftAt: { $lt: cutoff } }).catch(err => {
            Logger.warn(`Could not purge expired saved roles for ${guild.id}: ${err}`, CTX);
            return null;
        });

        if (result?.deletedCount) {
            Logger.debug(`Purged ${result.deletedCount} expired role snapshot(s) in ${guild.id}`, CTX);
        }
    }
}
